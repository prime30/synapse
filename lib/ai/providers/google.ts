import { GoogleGenAI } from '@google/genai';
import { randomUUID } from 'crypto';
import { AIProviderError, classifyNetworkError, formatSSEError } from '../errors';
import type {
  AIToolProviderInterface,
  AIMessage,
  AICompletionOptions,
  AICompletionResult,
  StreamResult,
  ToolDefinition,
  ToolCall,
  AIToolCompletionResult,
  ToolStreamResult,
  ToolStreamEvent,
  UsageInfo,
} from '../types';

function classifyGoogleError(error: unknown): AIProviderError {
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();

  if (lower.includes('resource_exhausted')) {
    return new AIProviderError('RATE_LIMITED', msg, 'google');
  }
  if (lower.includes('invalid_argument') && lower.includes('token')) {
    return new AIProviderError('CONTEXT_TOO_LONG', msg, 'google');
  }
  if (lower.includes('permission_denied') || lower.includes('api_key_invalid')) {
    return new AIProviderError('AUTH_ERROR', msg, 'google');
  }
  if (lower.includes('safety') || lower.includes('blocked')) {
    return new AIProviderError('CONTENT_FILTERED', msg, 'google');
  }
  if (lower.includes('not_found')) {
    return new AIProviderError('MODEL_UNAVAILABLE', msg, 'google');
  }
  if (lower.includes('malformed_function_call')) {
    return new AIProviderError('UNKNOWN', `Gemini function calling error: ${msg}`, 'google');
  }

  return classifyNetworkError(error, 'google');
}

/**
 * Map Synapse effort levels to Gemini thinking levels.
 */
function mapThinkingLevel(effort?: string): 'minimal' | 'low' | 'medium' | 'high' | undefined {
  if (!effort) return undefined;
  switch (effort) {
    case 'low': return 'low';
    case 'medium': return 'medium';
    case 'high': return 'high';
    case 'max': return 'high';
    default: return undefined;
  }
}

// ── Vertex AI / Google AI client resolution ────────────────────────────────

type GenAIOptions =
  | { vertexai: true; project: string; location: string }
  | { apiKey: string };

/**
 * Resolve whether to use Vertex AI (ADC) or the Gemini Developer API (API key).
 * Vertex takes precedence when project + location are configured.
 */
function resolveGenAIOptions(customApiKey?: string): GenAIOptions {
  const project =
    process.env.VERTEX_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT;
  const location =
    process.env.VERTEX_LOCATION ?? process.env.GOOGLE_CLOUD_LOCATION;

  if (project && location) {
    return { vertexai: true, project, location };
  }

  const apiKey = customApiKey ?? process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    throw new AIProviderError(
      'AUTH_ERROR',
      'Google provider is not configured. Set VERTEX_PROJECT_ID + VERTEX_LOCATION for Vertex AI, or GOOGLE_AI_API_KEY for the Gemini API.',
      'google',
    );
  }
  return { apiKey };
}

/** True when the Google provider will use Vertex AI (useful for health checks). */
export function isVertexConfigured(): boolean {
  const project =
    process.env.VERTEX_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT;
  const location =
    process.env.VERTEX_LOCATION ?? process.env.GOOGLE_CLOUD_LOCATION;
  return !!(project && location);
}

// ── Message conversion ─────────────────────────────────────────────────────

interface GeminiPart {
  text?: string;
  thought?: boolean;
  inlineData?: { data: string; mimeType: string };
  functionCall?: { id?: string; name?: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

interface GeminiContent {
  role?: string;
  parts?: GeminiPart[];
}

/**
 * Convert our AIMessage[] (which may contain __toolCalls / __toolResults
 * for multi-turn tool conversations) into Gemini Content[] + systemInstruction.
 */
function convertMessages(messages: AIMessage[]): {
  systemInstruction: string | undefined;
  contents: GeminiContent[];
} {
  const systemMessage = messages.find((m) => m.role === 'system');
  const chatMessages = messages.filter((m) => m.role !== 'system');

  const contents: GeminiContent[] = [];

  for (const m of chatMessages) {
    const msg = m as unknown as Record<string, unknown>;

    if (m.role === 'assistant' && msg.__toolCalls) {
      // Multi-turn: assistant message with raw Anthropic content blocks
      // Convert to Gemini model message with functionCall parts
      const parts: GeminiPart[] = [];
      for (const block of msg.__toolCalls as Array<{ type: string; id?: string; name?: string; input?: Record<string, unknown>; text?: string }>) {
        if (block.type === 'tool_use' && block.name) {
          parts.push({
            functionCall: {
              id: block.id,
              name: block.name,
              args: block.input ?? {},
            },
          });
        } else if (block.type === 'text' && block.text) {
          parts.push({ text: block.text });
        }
      }
      if (parts.length > 0) {
        contents.push({ role: 'model', parts });
      }
      continue;
    }

    if (msg.__toolResults) {
      // Multi-turn: user message with tool_result blocks
      // Convert to Gemini functionResponse parts
      const parts: GeminiPart[] = [];
      for (const block of msg.__toolResults as Array<{ type: string; tool_use_id?: string; content?: string }>) {
        if (block.type === 'tool_result' && block.tool_use_id) {
          let responseData: Record<string, unknown>;
          try {
            responseData = JSON.parse(block.content ?? '{}');
          } catch {
            responseData = { result: block.content ?? '' };
          }
          // Gemini requires a function name on functionResponse. We track
          // a mapping from id -> name during the conversion. Since we may
          // not have the name readily available, we use the tool_use_id as
          // a fallback and look it up from the previous model message.
          const fnName = findFunctionName(contents, block.tool_use_id) ?? block.tool_use_id;
          parts.push({
            functionResponse: {
              name: fnName,
              response: responseData,
            },
          });
        }
      }
      if (parts.length > 0) {
        contents.push({ parts });
      }
      continue;
    }

    // Standard text message (with optional images for user messages)
    const role = m.role === 'assistant' ? 'model' : 'user';
    const parts: GeminiPart[] = [];
    if (m.images?.length) {
      for (const img of m.images) {
        parts.push({ inlineData: { data: img.base64, mimeType: img.mimeType } });
      }
    }
    parts.push({ text: m.content });
    contents.push({ role, parts });
  }

  return {
    systemInstruction: systemMessage?.content,
    contents,
  };
}

/**
 * Look backwards through contents to find the function name for a given
 * functionCall id (used when building functionResponse messages).
 */
function findFunctionName(contents: GeminiContent[], callId: string): string | undefined {
  for (let i = contents.length - 1; i >= 0; i--) {
    const c = contents[i];
    if (c.role !== 'model' || !c.parts) continue;
    for (const part of c.parts) {
      if (part.functionCall?.id === callId && part.functionCall.name) {
        return part.functionCall.name;
      }
    }
  }
  return undefined;
}

// ── Tool definition conversion ─────────────────────────────────────────────

interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parametersJsonSchema?: unknown;
}

interface GeminiTool {
  functionDeclarations: GeminiFunctionDeclaration[];
}

/**
 * Convert our ToolDefinition[] to a Gemini Tool with functionDeclarations.
 * Uses `parametersJsonSchema` which accepts raw JSON Schema directly — no
 * conversion needed from our input_schema format.
 */
function convertTools(tools: ToolDefinition[]): GeminiTool {
  return {
    functionDeclarations: tools
      .filter(t => !t.type) // Skip PTC server tools (code_execution etc.)
      .map(t => ({
        name: t.name,
        description: t.description,
        parametersJsonSchema: t.input_schema,
      })),
  };
}

// ── Build generation config ────────────────────────────────────────────────

function buildConfig(
  options: Partial<AICompletionOptions> | undefined,
  systemInstruction: string | undefined,
  defaults: { maxOutputTokens: number },
): Record<string, unknown> {
  const thinkingLevel = mapThinkingLevel(options?.effort);
  const config: Record<string, unknown> = {
    maxOutputTokens: options?.maxTokens ?? defaults.maxOutputTokens,
    temperature: options?.temperature ?? 0.7,
  };
  if (systemInstruction) {
    config.systemInstruction = systemInstruction;
  }
  if (thinkingLevel) {
    config.thinkingConfig = { thinkingLevel };
  }
  return config;
}

// ── Provider ───────────────────────────────────────────────────────────────

/**
 * Google Gemini provider using the unified @google/genai SDK.
 *
 * Supports:
 *  - Vertex AI (ADC auth) when VERTEX_PROJECT_ID + VERTEX_LOCATION are set
 *  - Gemini Developer API (API key) as fallback
 *  - Gemini 3 Flash / Pro with thinking levels
 *  - Tool calling via functionDeclarations + parametersJsonSchema
 *  - Streaming with token usage tracking
 *  - Streaming function call arguments (Vertex AI only)
 */
export function createGoogleProvider(customApiKey?: string): AIToolProviderInterface {
  const genaiOpts = resolveGenAIOptions(customApiKey);
  const useVertexAI = 'vertexai' in genaiOpts;
  const backend = useVertexAI ? 'Vertex AI' : 'Google AI (API key)';
  console.log(`[GoogleProvider] Using ${backend}`);

  return {
    name: 'google',

    async complete(
      messages: AIMessage[],
      options?: Partial<AICompletionOptions>
    ): Promise<AICompletionResult> {
      const model = options?.model ?? 'gemini-3-flash-preview';
      const { systemInstruction, contents } = convertMessages(messages);
      const ai = new GoogleGenAI(genaiOpts);

      const config = buildConfig(options, systemInstruction, { maxOutputTokens: 1024 });

      let result;
      try {
        result = await ai.models.generateContent({
          model,
          contents: contents as Parameters<typeof ai.models.generateContent>[0]['contents'],
          config,
        });
      } catch (error) {
        throw classifyGoogleError(error);
      }

      const content = result.text ?? '';
      if (!content) {
        throw new AIProviderError('EMPTY_RESPONSE', 'Google returned no content', 'google');
      }

      return {
        content,
        provider: 'google',
        model,
        inputTokens: result.usageMetadata?.promptTokenCount,
        outputTokens: result.usageMetadata?.candidatesTokenCount,
      };
    },

    async stream(
      messages: AIMessage[],
      options?: Partial<AICompletionOptions>
    ): Promise<StreamResult> {
      const model = options?.model ?? 'gemini-3-flash-preview';
      const { systemInstruction, contents } = convertMessages(messages);
      const ai = new GoogleGenAI(genaiOpts);

      const config = buildConfig(options, systemInstruction, { maxOutputTokens: 4096 });

      let inputTokens = 0;
      let outputTokens = 0;
      let usageResolve: (value: { inputTokens: number; outputTokens: number }) => void;
      const usagePromise = new Promise<{ inputTokens: number; outputTokens: number }>(
        (resolve) => { usageResolve = resolve; }
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let streamResponse: AsyncIterable<any>;
      try {
        const result = await ai.models.generateContentStream({
          model,
          contents: contents as Parameters<typeof ai.models.generateContentStream>[0]['contents'],
          config,
        });
        streamResponse = result;
      } catch (error) {
        throw classifyGoogleError(error);
      }

      const stream = new ReadableStream<string>({
        async start(controller) {
          try {
            for await (const chunk of streamResponse) {
              const text = chunk.text;
              if (text) {
                controller.enqueue(text);
              }
              if (chunk.usageMetadata) {
                inputTokens = chunk.usageMetadata.promptTokenCount ?? 0;
                outputTokens = chunk.usageMetadata.candidatesTokenCount ?? 0;
              }
            }
            controller.close();
            usageResolve!({ inputTokens, outputTokens });
          } catch (error) {
            const providerError = classifyGoogleError(error);
            controller.enqueue(formatSSEError(providerError));
            controller.close();
            usageResolve!({ inputTokens, outputTokens });
          }
        },
      });

      return { stream, getUsage: () => usagePromise };
    },

    // ── Tool-calling support ──────────────────────────────────────────

    async completeWithTools(
      messages: AIMessage[],
      tools: ToolDefinition[],
      options?: Partial<AICompletionOptions>,
    ): Promise<AIToolCompletionResult> {
      const model = options?.model ?? 'gemini-3-flash-preview';
      const { systemInstruction, contents } = convertMessages(messages);
      const ai = new GoogleGenAI(genaiOpts);
      const geminiTools = convertTools(tools);

      const config = buildConfig(options, systemInstruction, { maxOutputTokens: 16384 });
      if (geminiTools.functionDeclarations.length > 0) {
        config.tools = [geminiTools];
      }

      let result;
      try {
        result = await ai.models.generateContent({
          model,
          contents: contents as Parameters<typeof ai.models.generateContent>[0]['contents'],
          config,
        });
      } catch (error) {
        throw classifyGoogleError(error);
      }

      const functionCalls = result.functionCalls;
      const toolCalls: ToolCall[] = (functionCalls ?? []).map(fc => ({
        id: fc.id ?? randomUUID(),
        name: fc.name!,
        input: (fc.args ?? {}) as Record<string, unknown>,
      }));

      const hasToolUse = toolCalls.length > 0;
      const finishReason = result.candidates?.[0]?.finishReason;
      let stopReason: 'end_turn' | 'tool_use' | 'max_tokens' = 'end_turn';
      if (hasToolUse) stopReason = 'tool_use';
      else if (finishReason === 'MAX_TOKENS') stopReason = 'max_tokens';

      // Build raw content blocks for multi-turn continuation
      const rawContentBlocks: unknown[] = [];
      const candidate = result.candidates?.[0];
      if (candidate?.content?.parts) {
        for (const part of candidate.content.parts) {
          if (part.functionCall) {
            rawContentBlocks.push({
              type: 'tool_use',
              id: part.functionCall.id ?? randomUUID(),
              name: part.functionCall.name,
              input: part.functionCall.args ?? {},
            });
          } else if (part.text && !part.thought) {
            rawContentBlocks.push({ type: 'text', text: part.text });
          }
        }
      }

      return {
        content: result.text ?? '',
        provider: 'google',
        model,
        inputTokens: result.usageMetadata?.promptTokenCount,
        outputTokens: result.usageMetadata?.candidatesTokenCount,
        stopReason,
        toolCalls: hasToolUse ? toolCalls : undefined,
        __rawContentBlocks: rawContentBlocks,
      } as AIToolCompletionResult & { __rawContentBlocks: unknown };
    },

    async streamWithTools(
      messages: AIMessage[],
      tools: ToolDefinition[],
      options?: Partial<AICompletionOptions>,
    ): Promise<ToolStreamResult> {
      const model = options?.model ?? 'gemini-3-flash-preview';
      const { systemInstruction, contents } = convertMessages(messages);
      const ai = new GoogleGenAI(genaiOpts);
      const geminiTools = convertTools(tools);

      const config = buildConfig(options, systemInstruction, { maxOutputTokens: 16384 });
      if (geminiTools.functionDeclarations.length > 0) {
        config.tools = [geminiTools];
        // Vertex AI supports streaming function call arguments
        if (useVertexAI) {
          config.toolConfig = {
            functionCallingConfig: {
              streamFunctionCallArguments: true,
            },
          };
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let streamResponse: AsyncIterable<any>;
      try {
        const result = await ai.models.generateContentStream({
          model,
          contents: contents as Parameters<typeof ai.models.generateContentStream>[0]['contents'],
          config,
        });
        streamResponse = result;
      } catch (error) {
        throw classifyGoogleError(error);
      }

      // ── Usage tracking ────────────────────────────────────────────
      let inputTokens = 0;
      let outputTokens = 0;
      let usageResolve: (value: UsageInfo) => void;
      const usagePromise = new Promise<UsageInfo>(
        (resolve) => { usageResolve = resolve; }
      );

      // ── Stop reason ───────────────────────────────────────────────
      let stopReason: 'end_turn' | 'tool_use' | 'max_tokens' = 'end_turn';
      let stopReasonResolve: (value: 'end_turn' | 'tool_use' | 'max_tokens') => void;
      const stopReasonPromise = new Promise<'end_turn' | 'tool_use' | 'max_tokens'>(
        (resolve) => { stopReasonResolve = resolve; }
      );

      // ── Raw content blocks for multi-turn ─────────────────────────
      const rawContentBlocks: unknown[] = [];
      let rawBlocksResolve: (value: unknown[]) => void;
      const rawBlocksPromise = new Promise<unknown[]>(
        (resolve) => { rawBlocksResolve = resolve; }
      );

      // Track active function calls for streaming partial args
      const activeFnCalls = new Map<string, { name: string; jsonChunks: string[] }>();
      let sawFunctionCall = false;

      const stream = new ReadableStream<ToolStreamEvent>({
        start(controller) {
          const resolveAll = () => {
            usageResolve!({ inputTokens, outputTokens });
            stopReasonResolve!(stopReason);
            rawBlocksResolve!(rawContentBlocks);
          };

          (async () => {
            try {
              let emittedStart = false;

              for await (const chunk of streamResponse) {
                if (!emittedStart) {
                  controller.enqueue({ type: 'stream_start' });
                  emittedStart = true;
                }

                // Update usage from each chunk
                if (chunk.usageMetadata) {
                  inputTokens = chunk.usageMetadata.promptTokenCount ?? 0;
                  outputTokens = chunk.usageMetadata.candidatesTokenCount ?? 0;
                }

                // Detect finish reason
                const candidate = chunk.candidates?.[0];
                if (candidate?.finishReason) {
                  if (candidate.finishReason === 'MAX_TOKENS') {
                    stopReason = 'max_tokens';
                  }
                  // tool_use is determined by presence of functionCall parts
                }

                const parts = candidate?.content?.parts;
                if (!parts) continue;

                for (const part of parts as Array<{
                  text?: string;
                  thought?: boolean;
                  functionCall?: {
                    id?: string;
                    name?: string;
                    args?: Record<string, unknown>;
                    partialArgs?: Array<{ argName: string; argValue: string }>;
                    willContinue?: boolean;
                  };
                }>) {
                  // ── Text or thinking part ─────────────────────────
                  if (part.text !== undefined && part.text !== null) {
                    if (part.thought) {
                      controller.enqueue({ type: 'thinking_delta', text: part.text });
                    } else {
                      controller.enqueue({ type: 'text_delta', text: part.text });
                    }
                    continue;
                  }

                  // ── Function call part ────────────────────────────
                  if (part.functionCall) {
                    sawFunctionCall = true;
                    const fc = part.functionCall;
                    const callId = fc.id ?? randomUUID();
                    const fnName = fc.name ?? 'unknown';

                    if (fc.willContinue) {
                      // Streaming partial args (Vertex AI only)
                      if (!activeFnCalls.has(callId)) {
                        activeFnCalls.set(callId, { name: fnName, jsonChunks: [] });
                        controller.enqueue({ type: 'tool_start', id: callId, name: fnName });
                      }
                      if (fc.partialArgs) {
                        const partialJson = JSON.stringify(
                          Object.fromEntries(fc.partialArgs.map(p => [p.argName, p.argValue]))
                        );
                        activeFnCalls.get(callId)!.jsonChunks.push(partialJson);
                        controller.enqueue({ type: 'tool_delta', id: callId, partialJson });
                      }
                    } else {
                      // Complete function call (either non-streaming or final chunk)
                      const input = (fc.args ?? {}) as Record<string, unknown>;

                      if (activeFnCalls.has(callId)) {
                        // Was streaming, now complete
                        activeFnCalls.delete(callId);
                      } else {
                        // Arrived in one shot
                        controller.enqueue({ type: 'tool_start', id: callId, name: fnName });
                      }

                      rawContentBlocks.push({ type: 'tool_use', id: callId, name: fnName, input });
                      controller.enqueue({ type: 'tool_end', id: callId, name: fnName, input });
                    }
                  }
                }
              }

              if (sawFunctionCall) {
                stopReason = 'tool_use';
              }

              controller.close();
              resolveAll();
            } catch (e) {
              const err = e instanceof AIProviderError ? e : classifyGoogleError(e);
              console.error('[google] streamWithTools() stream error:', err.message);
              if (sawFunctionCall) stopReason = 'tool_use';
              controller.close();
              resolveAll();
            }
          })();
        },
      });

      return {
        stream,
        getUsage: () => usagePromise,
        getStopReason: () => stopReasonPromise,
        getRawContentBlocks: () => rawBlocksPromise,
      };
    },
  };
}
