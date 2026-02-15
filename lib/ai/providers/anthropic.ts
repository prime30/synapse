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
import {
  AIProviderError,
  classifyProviderError,
  classifyNetworkError,
  formatSSEError,
} from '../errors';
import { AI_FEATURES } from '../feature-flags';

/**
 * Build the request headers for Anthropic API calls.
 * Adds beta headers (prompt caching, etc.) when features are enabled.
 */
function buildHeaders(apiKey: string, options?: Partial<AICompletionOptions>): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  };

  // Collect beta features
  const betaFeatures: string[] = [];
  if (AI_FEATURES.promptCaching || options?.cacheEnabled) {
    betaFeatures.push('prompt-caching-2024-07-31');
  }
  if (betaFeatures.length > 0) {
    headers['anthropic-beta'] = betaFeatures.join(',');
  }

  return headers;
}

/**
 * Build the system field for the Anthropic API body.
 * When prompt caching is enabled and the system message has cacheControl,
 * converts from a plain string to a content block array with cache_control.
 */
function buildSystemField(systemMessage: AIMessage | undefined): unknown {
  if (!systemMessage) return undefined;

  if (systemMessage.cacheControl && (AI_FEATURES.promptCaching)) {
    return [
      {
        type: 'text',
        text: systemMessage.content,
        cache_control: systemMessage.cacheControl,
      },
    ];
  }

  return systemMessage.content;
}

export function createAnthropicProvider(customApiKey?: string): AIToolProviderInterface {
  return {
    name: 'anthropic',

    async complete(
      messages: AIMessage[],
      options?: Partial<AICompletionOptions>
    ): Promise<AICompletionResult> {
      const apiKey = customApiKey ?? process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new AIProviderError('AUTH_ERROR', 'ANTHROPIC_API_KEY is not set', 'anthropic');

      const model = options?.model ?? 'claude-sonnet-4-5-20250929';
      const systemMessage = messages.find((m) => m.role === 'system');
      const chatMessages = messages.filter((m) => m.role !== 'system');

      // When thinking is enabled, Anthropic requires temperature=1
      const useThinking = AI_FEATURES.adaptiveThinking && options?.thinking;
      const temperature = useThinking ? 1 : (options?.temperature ?? 0.7);

      const body: Record<string, unknown> = {
        model,
        max_tokens: options?.maxTokens ?? 1024,
        temperature,
        messages: chatMessages.map((m) => ({ role: m.role, content: m.content })),
      };
      const systemField = buildSystemField(systemMessage);
      if (systemField !== undefined) body.system = systemField;

      // Add thinking / effort when adaptive thinking is enabled
      if (useThinking) {
        body.thinking = options!.thinking;
        if (options?.effort) body.effort = options.effort;
      }

      // Add structured output config when enabled
      if (AI_FEATURES.structuredOutputs && options?.outputConfig) {
        body.output_config = options.outputConfig;
      }

      // 2-minute timeout for non-streaming completions
      const fetchController = new AbortController();
      const fetchTimeout = setTimeout(() => fetchController.abort(), 120_000);
      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: buildHeaders(apiKey, options),
          body: JSON.stringify(body),
          signal: fetchController.signal,
        });
        clearTimeout(fetchTimeout);

        const bodyText = await response.text();
        if (!response.ok) {
          console.error('[anthropic] complete() API error:', {
            model, status: response.status, body: bodyText.slice(0, 500),
          });
          throw classifyProviderError(response.status, bodyText, 'anthropic');
        }

        const data = JSON.parse(bodyText || '{}') as {
          content?: Array<{ type?: string; text?: string }>;
          usage?: { input_tokens?: number; output_tokens?: number };
        };

        const textBlock = data.content?.find((c) => c.type === 'text');
        if (!textBlock?.text) {
          throw new AIProviderError('EMPTY_RESPONSE', 'Anthropic returned no content', 'anthropic');
        }

        return {
          content: textBlock.text,
          provider: 'anthropic',
          model,
          inputTokens: data.usage?.input_tokens,
          outputTokens: data.usage?.output_tokens,
        };
      } catch (e) {
        clearTimeout(fetchTimeout);
        if (e instanceof DOMException && e.name === 'AbortError') {
          throw new AIProviderError('TIMEOUT', 'Anthropic API request timed out after 2 minutes', 'anthropic');
        }
        if (e instanceof AIProviderError) throw e;
        throw classifyNetworkError(e, 'anthropic');
      }
    },

    async stream(
      messages: AIMessage[],
      options?: Partial<AICompletionOptions>
    ): Promise<StreamResult> {
      const apiKey = customApiKey ?? process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new AIProviderError('AUTH_ERROR', 'ANTHROPIC_API_KEY is not set', 'anthropic');

      const model = options?.model ?? 'claude-sonnet-4-5-20250929';
      const systemMessage = messages.find((m) => m.role === 'system');
      const chatMessages = messages.filter((m) => m.role !== 'system');

      const useThinking = AI_FEATURES.adaptiveThinking && options?.thinking;
      const temperature = useThinking ? 1 : (options?.temperature ?? 0.7);

      const body: Record<string, unknown> = {
        model,
        max_tokens: options?.maxTokens ?? 1024,
        temperature,
        stream: true,
        messages: chatMessages.map((m) => ({ role: m.role, content: m.content })),
      };
      const systemField = buildSystemField(systemMessage);
      if (systemField !== undefined) body.system = systemField;

      if (useThinking) {
        body.thinking = options!.thinking;
        if (options?.effort) body.effort = options.effort;
      }

      // 4-minute timeout — abort if Anthropic API doesn't respond in time.
      // This prevents the request from hanging indefinitely.
      const fetchController = new AbortController();
      const fetchTimeout = setTimeout(() => fetchController.abort(), 240_000);

      let response: Response;
      try {
        response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: buildHeaders(apiKey, options),
          body: JSON.stringify(body),
          signal: fetchController.signal,
        });
      } catch (e) {
        clearTimeout(fetchTimeout);
        if (e instanceof DOMException && e.name === 'AbortError') {
          throw new AIProviderError('TIMEOUT', 'Anthropic API request timed out after 4 minutes', 'anthropic');
        }
        throw classifyNetworkError(e, 'anthropic');
      }
      clearTimeout(fetchTimeout);

      if (!response.ok) {
        const err = await response.text();
        console.error('[anthropic] stream() API error:', {
          model, status: response.status, body: err.slice(0, 500),
        });
        throw classifyProviderError(response.status, err, 'anthropic');
      }
      if (!response.body) {
        throw new AIProviderError('UNKNOWN', 'Anthropic returned no stream body', 'anthropic');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      // Track token usage from SSE events
      let inputTokens = 0;
      let outputTokens = 0;
      let cacheCreationInputTokens = 0;
      let cacheReadInputTokens = 0;
      let usageResolve: (value: UsageInfo) => void;
      const usagePromise = new Promise<UsageInfo>(
        (resolve) => { usageResolve = resolve; }
      );

      const stream = new ReadableStream<string>({
        async pull(controller) {
          try {
            const { done, value } = await reader.read();
            if (done) {
              controller.close();
              usageResolve!({ inputTokens, outputTokens, cacheCreationInputTokens, cacheReadInputTokens });
              return;
            }
            const text = decoder.decode(value);
            const lines = text.split('\n').filter((l) => l.startsWith('data: '));
            for (const line of lines) {
              try {
                const parsed = JSON.parse(line.slice(6));

                // Capture input tokens from message_start event
                if (parsed.type === 'message_start') {
                  inputTokens = parsed.message?.usage?.input_tokens ?? 0;
                  cacheCreationInputTokens = parsed.message?.usage?.cache_creation_input_tokens ?? 0;
                  cacheReadInputTokens = parsed.message?.usage?.cache_read_input_tokens ?? 0;
                }

                // Capture output tokens from message_delta event (end of stream)
                if (parsed.type === 'message_delta') {
                  outputTokens = parsed.usage?.output_tokens ?? 0;
                }

                // Enqueue content text as before
                if (parsed.type === 'content_block_delta') {
                  const content = parsed.delta?.text;
                  if (content) controller.enqueue(content);
                }
              } catch {
                // skip malformed chunks
              }
            }
          } catch (e) {
            const err = e instanceof AIProviderError ? e : classifyNetworkError(e, 'anthropic');
            controller.enqueue(formatSSEError(err));
            controller.close();
            usageResolve!({ inputTokens, outputTokens, cacheCreationInputTokens, cacheReadInputTokens });
          }
        },
      });

      return { stream, getUsage: () => usagePromise };
    },

    async completeWithTools(
      messages: AIMessage[],
      tools: ToolDefinition[],
      options?: Partial<AICompletionOptions>,
    ): Promise<AIToolCompletionResult> {
      const apiKey = customApiKey ?? process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new AIProviderError('AUTH_ERROR', 'ANTHROPIC_API_KEY is not set', 'anthropic');

      const model = options?.model ?? 'claude-sonnet-4-5-20250929';
      const systemMessage = messages.find((m) => m.role === 'system');
      const chatMessages = messages.filter((m) => m.role !== 'system');

      // Build Anthropic-style messages (supports tool_result role)
      const anthropicMessages = chatMessages.map((m) => {
        const msg = m as unknown as Record<string, unknown>;
        if (m.role === 'assistant' && msg.__toolCalls) {
          // Assistant message with tool use content blocks
          return {
            role: 'assistant',
            content: msg.__toolCalls as unknown[],
          };
        }
        if (msg.__toolResults) {
          return {
            role: 'user',
            content: msg.__toolResults as unknown[],
          };
        }
        return { role: m.role, content: m.content };
      });

      const body: Record<string, unknown> = {
        model,
        max_tokens: options?.maxTokens ?? 4096,
        temperature: options?.temperature ?? 0.7,
        messages: anthropicMessages,
        tools: tools.map(t => ({
          name: t.name,
          description: t.description,
          input_schema: t.input_schema,
        })),
      };
      const systemField = buildSystemField(systemMessage);
      if (systemField !== undefined) body.system = systemField;

      // 2-minute timeout for tool completions
      const toolFetchController = new AbortController();
      const toolFetchTimeout = setTimeout(() => toolFetchController.abort(), 120_000);
      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: buildHeaders(apiKey, options),
          body: JSON.stringify(body),
          signal: toolFetchController.signal,
        });
        clearTimeout(toolFetchTimeout);

        const bodyText = await response.text();
        if (!response.ok) {
          throw classifyProviderError(response.status, bodyText, 'anthropic');
        }

        const data = JSON.parse(bodyText || '{}') as {
          content?: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>;
          stop_reason?: string;
          usage?: { input_tokens?: number; output_tokens?: number };
        };

        const textBlocks = (data.content ?? []).filter(c => c.type === 'text');
        const toolUseBlocks = (data.content ?? []).filter(c => c.type === 'tool_use');

        const content = textBlocks.map(b => b.text ?? '').join('');
        const toolCalls: ToolCall[] = toolUseBlocks.map(b => ({
          id: b.id!,
          name: b.name!,
          input: b.input ?? {},
        }));

        let stopReason: 'end_turn' | 'tool_use' | 'max_tokens' = 'end_turn';
        if (data.stop_reason === 'tool_use') stopReason = 'tool_use';
        else if (data.stop_reason === 'max_tokens') stopReason = 'max_tokens';

        return {
          content,
          provider: 'anthropic',
          model,
          inputTokens: data.usage?.input_tokens,
          outputTokens: data.usage?.output_tokens,
          stopReason,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          // Store raw content blocks for continuation
          __rawContentBlocks: data.content,
        } as AIToolCompletionResult & { __rawContentBlocks: unknown };
      } catch (e) {
        clearTimeout(toolFetchTimeout);
        if (e instanceof AIProviderError) throw e;
        if (e instanceof DOMException && e.name === 'AbortError') {
          throw new AIProviderError('TIMEOUT', 'Anthropic tool completion timed out after 2 minutes', 'anthropic');
        }
        throw classifyNetworkError(e, 'anthropic');
      }
    },
    async streamWithTools(
      messages: AIMessage[],
      tools: ToolDefinition[],
      options?: Partial<AICompletionOptions>,
    ): Promise<ToolStreamResult> {
      const apiKey = customApiKey ?? process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new AIProviderError('AUTH_ERROR', 'ANTHROPIC_API_KEY is not set', 'anthropic');

      const model = options?.model ?? 'claude-sonnet-4-5-20250929';
      const systemMessage = messages.find((m) => m.role === 'system');
      const chatMessages = messages.filter((m) => m.role !== 'system');

      const body: Record<string, unknown> = {
        model,
        max_tokens: options?.maxTokens ?? 4096,
        temperature: options?.temperature ?? 0.7,
        stream: true,
        messages: chatMessages.map((m) => ({ role: m.role, content: m.content })),
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.input_schema,
        })),
      };
      const systemField = buildSystemField(systemMessage);
      if (systemField !== undefined) body.system = systemField;

      // 4-minute timeout for streaming tool completions
      const streamToolController = new AbortController();
      const streamToolTimeout = setTimeout(() => streamToolController.abort(), 240_000);

      let response: Response;
      try {
        response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: buildHeaders(apiKey, options),
          body: JSON.stringify(body),
          signal: streamToolController.signal,
        });
      } catch (e) {
        clearTimeout(streamToolTimeout);
        if (e instanceof DOMException && e.name === 'AbortError') {
          throw new AIProviderError('TIMEOUT', 'Anthropic streaming tool request timed out after 4 minutes', 'anthropic');
        }
        throw classifyNetworkError(e, 'anthropic');
      }
      clearTimeout(streamToolTimeout);

      if (!response.ok) {
        const err = await response.text();
        console.error('[anthropic] streamWithTools() API error:', {
          model, status: response.status, body: err.slice(0, 500),
        });
        throw classifyProviderError(response.status, err, 'anthropic');
      }
      if (!response.body) {
        throw new AIProviderError('UNKNOWN', 'Anthropic returned no stream body', 'anthropic');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      // Track usage
      let inputTokens = 0;
      let outputTokens = 0;
      let cacheCreationInputTokens = 0;
      let cacheReadInputTokens = 0;
      let usageResolve: (value: UsageInfo) => void;
      const usagePromise = new Promise<UsageInfo>(
        (resolve) => { usageResolve = resolve; }
      );

      // Tool accumulation buffer: Map<block_index, { id, name, jsonChunks }>
      const toolBuffers = new Map<number, { id: string; name: string; jsonChunks: string[] }>();

      // 30s inactivity timeout for tool blocks
      let lastActivity = Date.now();
      const TOOL_TIMEOUT_MS = 30_000;

      const stream = new ReadableStream<ToolStreamEvent>({
        async pull(controller) {
          try {
            // Check for tool block timeout
            if (toolBuffers.size > 0 && Date.now() - lastActivity > TOOL_TIMEOUT_MS) {
              // Emit error for all open tool blocks and close
              for (const [, buf] of toolBuffers) {
                controller.enqueue({
                  type: 'tool_end',
                  id: buf.id,
                  name: buf.name,
                  input: { _error: true, message: 'Tool block timed out after 30s inactivity' } as Record<string, unknown>,
                });
              }
              toolBuffers.clear();
              controller.close();
              usageResolve!({ inputTokens, outputTokens, cacheCreationInputTokens, cacheReadInputTokens });
              return;
            }

            const { done, value } = await reader.read();
            if (done) {
              controller.close();
              usageResolve!({ inputTokens, outputTokens, cacheCreationInputTokens, cacheReadInputTokens });
              return;
            }

            lastActivity = Date.now();
            const text = decoder.decode(value);
            const lines = text.split('\n').filter((l) => l.startsWith('data: '));

            for (const line of lines) {
              try {
                const parsed = JSON.parse(line.slice(6));

                // Capture usage from message_start
                if (parsed.type === 'message_start') {
                  inputTokens = parsed.message?.usage?.input_tokens ?? 0;
                  cacheCreationInputTokens = parsed.message?.usage?.cache_creation_input_tokens ?? 0;
                  cacheReadInputTokens = parsed.message?.usage?.cache_read_input_tokens ?? 0;
                }

                // Capture output tokens from message_delta
                if (parsed.type === 'message_delta') {
                  outputTokens = parsed.usage?.output_tokens ?? 0;
                }

                // Content block start
                if (parsed.type === 'content_block_start') {
                  const block = parsed.content_block;
                  const index = parsed.index ?? 0;

                  if (block?.type === 'tool_use') {
                    toolBuffers.set(index, {
                      id: block.id,
                      name: block.name,
                      jsonChunks: [],
                    });
                    controller.enqueue({
                      type: 'tool_start',
                      id: block.id,
                      name: block.name,
                    });
                  }
                  // text blocks: deltas will come via content_block_delta
                }

                // Content block delta
                if (parsed.type === 'content_block_delta') {
                  const index = parsed.index ?? 0;
                  const delta = parsed.delta;

                  if (delta?.type === 'text_delta' && delta.text) {
                    controller.enqueue({ type: 'text_delta', text: delta.text });
                  }

                  if (delta?.type === 'input_json_delta' && delta.partial_json !== undefined) {
                    const buf = toolBuffers.get(index);
                    if (buf) {
                      buf.jsonChunks.push(delta.partial_json);
                      controller.enqueue({
                        type: 'tool_delta',
                        id: buf.id,
                        partialJson: delta.partial_json,
                      });
                    }
                  }
                }

                // Content block stop
                if (parsed.type === 'content_block_stop') {
                  const index = parsed.index ?? 0;
                  const buf = toolBuffers.get(index);
                  if (buf) {
                    toolBuffers.delete(index);
                    try {
                      const fullJson = buf.jsonChunks.join('');
                      const input = JSON.parse(fullJson) as Record<string, unknown>;
                      controller.enqueue({
                        type: 'tool_end',
                        id: buf.id,
                        name: buf.name,
                        input,
                      });
                    } catch {
                      // JSON parse failed — emit error marker
                      controller.enqueue({
                        type: 'tool_end',
                        id: buf.id,
                        name: buf.name,
                        input: { _error: true, message: 'Failed to parse tool input JSON' } as Record<string, unknown>,
                      });
                    }
                  }
                }
              } catch {
                // skip malformed SSE chunks
              }
            }
          } catch (e) {
            const err = e instanceof AIProviderError ? e : classifyNetworkError(e, 'anthropic');
            console.error('[anthropic] streamWithTools() stream error:', err.message);
            controller.close();
            usageResolve!({ inputTokens, outputTokens, cacheCreationInputTokens, cacheReadInputTokens });
          }
        },
      });

      return { stream, getUsage: () => usagePromise };
    },
  };
}
