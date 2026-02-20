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

// ── HTTP keep-alive for connection reuse ───────────────────────────────
// Saves ~100-300ms TCP+TLS handshake per request by reusing connections.
// Uses Node.js built-in undici Agent; degrades gracefully if unavailable.
let keepAliveDispatcher: unknown;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Agent } = require('undici');
  keepAliveDispatcher = new Agent({
    keepAliveTimeout: 30_000,
    keepAliveMaxTimeout: 60_000,
    connections: 10,
  });
} catch {
  // undici not available (edge runtime, etc.) — fall back to default fetch
  keepAliveDispatcher = undefined;
}

/** Build fetch options, adding keep-alive dispatcher when available. */
function withKeepAlive(init: RequestInit): RequestInit {
  if (keepAliveDispatcher) {
    return { ...init, dispatcher: keepAliveDispatcher } as RequestInit;
  }
  return init;
}

// ── Connection pre-warming ────────────────────────────────────────────────
// Fire-and-forget HEAD request to api.anthropic.com on module load.
// Primes TCP+TLS in the keep-alive pool so the first real request
// skips the ~100-300ms cold handshake.
let _connectionWarmed = false;
function prewarmConnection(apiKey?: string): void {
  if (_connectionWarmed || !keepAliveDispatcher) return;
  _connectionWarmed = true;
  const key = (apiKey ?? process.env.ANTHROPIC_API_KEY)?.replace(/^\uFEFF/, '').trim();
  if (!key) return;
  fetch(
    'https://api.anthropic.com/v1/messages',
    withKeepAlive({
      method: 'HEAD',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    }),
  ).catch(() => { /* connection priming is best-effort */ });
}

/** Max retries for 429/529 (rate limit / overloaded). */
const RATE_LIMIT_MAX_ATTEMPTS = 3;

/**
 * Run a fetch and retry on 429 (rate limit) or 529 (overloaded) with backoff.
 * Consumes the response body when retrying so the connection can be reused.
 */
async function fetchWithRateLimitRetry(fetchFn: () => Promise<Response>): Promise<Response> {
  for (let attempt = 0; attempt < RATE_LIMIT_MAX_ATTEMPTS; attempt++) {
    const res = await fetchFn();
    if ((res.status === 429 || res.status === 529) && attempt < RATE_LIMIT_MAX_ATTEMPTS - 1) {
      await res.text(); // consume body so connection can be released
      const retryAfter = res.headers.get('Retry-After');
      const waitMs = retryAfter
        ? Math.min(parseInt(retryAfter, 10) * 1000, 60_000)
        : Math.min(2000 * 2 ** attempt, 30_000);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    return res;
  }
  throw new Error('fetchWithRateLimitRetry: unreachable');
}

/**
 * Build the request headers for Anthropic API calls.
 * Adds beta headers (prompt caching, etc.) when features are enabled.
 */
/** Per https://platform.claude.com/docs/en/api/overview: x-api-key, anthropic-version, content-type are required. */
function buildHeaders(apiKey: string, options?: Partial<AICompletionOptions>): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey.replace(/^\uFEFF/, '').trim(),
    'anthropic-version': '2023-06-01',
  };

  // Collect beta features
  const betaFeatures: string[] = [];
  if (AI_FEATURES.promptCaching || options?.cacheEnabled) {
    betaFeatures.push('prompt-caching-2024-07-31');
  }
  betaFeatures.push('code-execution-2025-08-25');
  if (AI_FEATURES.contextEditing) {
    betaFeatures.push('context-management-2025-06-27');
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
        cache_control: {
          type: systemMessage.cacheControl.type,
          ...(systemMessage.cacheControl.ttl ? { ttl: systemMessage.cacheControl.ttl } : {}),
        },
      },
    ];
  }

  return systemMessage.content;
}

/** PTC (Programmatic Tool Calling) is only supported by Sonnet and Opus, not Haiku. */
function modelSupportsPTC(model: string): boolean {
  return !model.includes('haiku');
}

/** Extended thinking and effort control require Opus 4.5+, Opus 4.6+, or Sonnet 4.6+ (not Haiku or Sonnet 4.5). */
function modelSupportsThinking(model: string): boolean {
  if (model.includes('opus')) return true;
  if (model.includes('sonnet-4-6') || model.includes('sonnet-4-7')) return true;
  return false;
}

export function createAnthropicProvider(customApiKey?: string): AIToolProviderInterface {
  prewarmConnection(customApiKey);
  return {
    name: 'anthropic',

    async complete(
      messages: AIMessage[],
      options?: Partial<AICompletionOptions>
    ): Promise<AICompletionResult> {
      const apiKey = (customApiKey ?? process.env.ANTHROPIC_API_KEY)?.replace(/^\uFEFF/, '').trim() ?? '';
      if (!apiKey) throw new AIProviderError('AUTH_ERROR', 'ANTHROPIC_API_KEY is not set', 'anthropic');

      const model = options?.model ?? 'claude-sonnet-4-6';
      const systemMessage = messages.find((m) => m.role === 'system');
      const chatMessages = messages.filter((m) => m.role !== 'system');

      // When thinking is enabled, Anthropic requires temperature=1
      const thinkingSupported = modelSupportsThinking(model);
      const useThinking = AI_FEATURES.adaptiveThinking && options?.thinking && thinkingSupported;
      const temperature = useThinking ? 1 : (options?.temperature ?? 0.7);

      const body: Record<string, unknown> = {
        model,
        max_tokens: options?.maxTokens ?? 1024,
        temperature,
        messages: chatMessages.map((m) => ({ role: m.role, content: m.content })),
      };
      const systemField = buildSystemField(systemMessage);
      if (systemField !== undefined) body.system = systemField;

      // Add thinking when adaptive thinking is enabled
      if (useThinking) {
        body.thinking = options!.thinking;
      }

      // Add structured output config or effort to output_config
      if (AI_FEATURES.structuredOutputs && options?.outputConfig) {
        body.output_config = options.outputConfig;
      } else if (options?.effort && thinkingSupported) {
        body.output_config = { effort: options.effort };
      }

      // 2-minute timeout for non-streaming completions
      const fetchController = new AbortController();
      const fetchTimeout = setTimeout(() => fetchController.abort(), 120_000);
      try {
        const response = await fetchWithRateLimitRetry(() =>
          fetch('https://api.anthropic.com/v1/messages', withKeepAlive({
            method: 'POST',
            headers: buildHeaders(apiKey, options),
            body: JSON.stringify(body),
            signal: fetchController.signal,
          }))
        );
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
          usage?: { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number };
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
      const apiKey = (customApiKey ?? process.env.ANTHROPIC_API_KEY)?.replace(/^\uFEFF/, '').trim() ?? '';
      if (!apiKey) throw new AIProviderError('AUTH_ERROR', 'ANTHROPIC_API_KEY is not set', 'anthropic');

      const model = options?.model ?? 'claude-sonnet-4-6';
      const systemMessage = messages.find((m) => m.role === 'system');
      const chatMessages = messages.filter((m) => m.role !== 'system');

      const thinkingSupported = modelSupportsThinking(model);
      const useThinking = AI_FEATURES.adaptiveThinking && options?.thinking && thinkingSupported;
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
      }
      if (options?.effort && thinkingSupported) {
        body.output_config = { effort: options.effort };
      }

      // 4-minute timeout — abort if Anthropic API doesn't respond in time.
      const fetchController = new AbortController();
      const fetchTimeout = setTimeout(() => fetchController.abort(), 240_000);

      // Skip undici keep-alive for streaming — it buffers SSE bodies.
      let response: Response;
      try {
        response = await fetchWithRateLimitRetry(() =>
          fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: buildHeaders(apiKey, options),
            body: JSON.stringify(body),
            signal: fetchController.signal,
          })
        );
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

      // SSE format per https://docs.anthropic.com/en/api/streaming: message_start →
      // content_block_start → content_block_delta (text in delta.text) → content_block_stop →
      // message_delta → message_stop; ping events are optional keep-alives.
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '';

      // Track token usage from SSE events
      let inputTokens = 0;
      let outputTokens = 0;
      let cacheCreationInputTokens = 0;
      let cacheReadInputTokens = 0;
      let usageResolve: (value: UsageInfo) => void;
      const usagePromise = new Promise<UsageInfo>(
        (resolve) => { usageResolve = resolve; }
      );

      // Push-based: background loop reads HTTP body and pushes text chunks.
      const stream = new ReadableStream<string>({
        start(controller) {
          (async () => {
            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                sseBuffer += decoder.decode(value, { stream: true });
                const lines = sseBuffer.split('\n');
                sseBuffer = lines.pop() ?? '';
                const dataLines = lines.filter((l) => l.startsWith('data: '));
                let streamEnded = false;
                for (const line of dataLines) {
                  try {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Anthropic SSE events have dynamic shapes
                    const parsed = JSON.parse(line.slice(6)) as any;
                    if (parsed.type === 'ping') continue;
                    if (parsed.type === 'message_start') {
                      inputTokens = parsed.message?.usage?.input_tokens ?? 0;
                      cacheCreationInputTokens = parsed.message?.usage?.cache_creation_input_tokens ?? 0;
                      cacheReadInputTokens = parsed.message?.usage?.cache_read_input_tokens ?? 0;
                    }
                    if (parsed.type === 'message_delta') {
                      outputTokens = parsed.usage?.output_tokens ?? 0;
                    }
                    if (parsed.type === 'content_block_delta') {
                      const delta = parsed.delta;
                      const content = delta?.text ?? (delta?.type === 'text_delta' ? delta?.text : undefined);
                      if (content) controller.enqueue(content as string);
                    }
                    if (parsed.type === 'message_stop') {
                      streamEnded = true;
                      break;
                    }
                  } catch {
                    // skip malformed chunks
                  }
                }
                if (streamEnded) break;
              }
              controller.close();
              usageResolve!({ inputTokens, outputTokens, cacheCreationInputTokens, cacheReadInputTokens });
            } catch (e) {
              const err = e instanceof AIProviderError ? e : classifyNetworkError(e, 'anthropic');
              controller.enqueue(formatSSEError(err));
              controller.close();
              usageResolve!({ inputTokens, outputTokens, cacheCreationInputTokens, cacheReadInputTokens });
            }
          })();
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

      const model = options?.model ?? 'claude-sonnet-4-6';
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
        // Propagate cache_control for prompt caching
        if (m.cacheControl && AI_FEATURES.promptCaching) {
          return {
            role: m.role,
            content: [{
              type: 'text',
              text: m.content,
              cache_control: {
                type: m.cacheControl.type,
                ...(m.cacheControl.ttl ? { ttl: m.cacheControl.ttl } : {}),
              },
            }],
          };
        }
        return { role: m.role, content: m.content };
      });

      const ptcEnabled = modelSupportsPTC(model);
      const serializedTools = tools
        .filter((t) => !t.type || ptcEnabled) // Drop server tools (code_execution) for non-PTC models
        .map((t) => {
          if (t.type && ptcEnabled) {
            return { type: t.type, name: t.name } as Record<string, unknown>;
          }
          const def: Record<string, unknown> = {
            name: t.name,
            description: t.description,
            input_schema: t.input_schema,
          };
          if (t.allowed_callers && ptcEnabled) def.allowed_callers = t.allowed_callers;
          if (t.eager_input_streaming) def.eager_input_streaming = true;
          return def;
        });
      if (AI_FEATURES.promptCaching && serializedTools.length > 0) {
        serializedTools[serializedTools.length - 1].cache_control = {
          type: 'ephemeral',
          ...(AI_FEATURES.promptCacheTtl !== '5m' ? { ttl: AI_FEATURES.promptCacheTtl } : {}),
        };
      }

      const thinkingSupported = modelSupportsThinking(model);
      const useThinking = AI_FEATURES.adaptiveThinking && options?.thinking && thinkingSupported;
      const body: Record<string, unknown> = {
        model,
        max_tokens: options?.maxTokens ?? 4096,
        temperature: useThinking ? 1 : (options?.temperature ?? 0.7),
        messages: anthropicMessages,
        tools: serializedTools,
      };
      if (useThinking) {
        body.thinking = options!.thinking;
      }
      if (options?.effort && thinkingSupported) {
        body.output_config = { effort: options.effort };
      }
      const systemField = buildSystemField(systemMessage);
      if (systemField !== undefined) body.system = systemField;
      if (options?.container && ptcEnabled) body.container = options.container;
      if (options?.contextManagement) body.context_management = options.contextManagement;

      // 2-minute timeout for tool completions
      const toolFetchController = new AbortController();
      const toolFetchTimeout = setTimeout(() => toolFetchController.abort(), 120_000);
      try {
        const response = await fetchWithRateLimitRetry(() =>
          fetch('https://api.anthropic.com/v1/messages', withKeepAlive({
            method: 'POST',
            headers: buildHeaders(apiKey, options),
            body: JSON.stringify(body),
            signal: toolFetchController.signal,
          }))
        );
        clearTimeout(toolFetchTimeout);

        const bodyText = await response.text();
        if (!response.ok) {
          throw classifyProviderError(response.status, bodyText, 'anthropic');
        }

        const data = JSON.parse(bodyText || '{}') as {
          content?: Array<{
            type: string; text?: string; id?: string; name?: string;
            input?: Record<string, unknown>;
            caller?: ToolCall['caller'];
            content?: Array<{ type: string; stdout?: string; stderr?: string; return_code?: number }>;
          }>;
          stop_reason?: string;
          usage?: { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number };
          container?: { id: string; expires_at: string };
        };

        const textBlocks = (data.content ?? []).filter(c => c.type === 'text');
        const toolUseBlocks = (data.content ?? []).filter(c => c.type === 'tool_use');

        const content = textBlocks.map(b => b.text ?? '').join('');
        const toolCalls: ToolCall[] = toolUseBlocks.map(b => ({
          id: b.id!,
          name: b.name!,
          input: b.input ?? {},
          ...(b.caller ? { caller: b.caller } : {}),
        }));

        let stopReason: 'end_turn' | 'tool_use' | 'max_tokens' = 'end_turn';
        if (data.stop_reason === 'tool_use') stopReason = 'tool_use';
        else if (data.stop_reason === 'max_tokens') stopReason = 'max_tokens';

        const cacheWrite = data.usage?.cache_creation_input_tokens ?? 0;
        const cacheRead = data.usage?.cache_read_input_tokens ?? 0;
        if (cacheWrite > 0 || cacheRead > 0) {
          console.log(`[anthropic] completeWithTools cache: write=${cacheWrite}, read=${cacheRead}`);
        }

        return {
          content,
          provider: 'anthropic',
          model,
          inputTokens: data.usage?.input_tokens,
          outputTokens: data.usage?.output_tokens,
          cacheCreationInputTokens: cacheWrite,
          cacheReadInputTokens: cacheRead,
          stopReason,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          container: data.container,
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

      const model = options?.model ?? 'claude-sonnet-4-6';
      const systemMessage = messages.find((m) => m.role === 'system');
      const chatMessages = messages.filter((m) => m.role !== 'system');

      // Build Anthropic-style messages (supports __toolCalls / __toolResults for multi-turn)
      const anthropicMessages = chatMessages.map((m) => {
        const msg = m as unknown as Record<string, unknown>;
        if (m.role === 'assistant' && msg.__toolCalls) {
          return { role: 'assistant', content: msg.__toolCalls as unknown[] };
        }
        if (msg.__toolResults) {
          return { role: 'user', content: msg.__toolResults as unknown[] };
        }
        // Propagate cache_control for prompt caching
        if (m.cacheControl && AI_FEATURES.promptCaching) {
          return {
            role: m.role,
            content: [{
              type: 'text',
              text: m.content,
              cache_control: {
                type: m.cacheControl.type,
                ...(m.cacheControl.ttl ? { ttl: m.cacheControl.ttl } : {}),
              },
            }],
          };
        }
        return { role: m.role, content: m.content };
      });

      const ptcEnabled = modelSupportsPTC(model);
      const serializedTools = tools
        .filter((t) => !t.type || ptcEnabled)
        .map((t) => {
          if (t.type && ptcEnabled) {
            return { type: t.type, name: t.name } as Record<string, unknown>;
          }
          const def: Record<string, unknown> = {
            name: t.name,
            description: t.description,
            input_schema: t.input_schema,
          };
          if (t.allowed_callers && ptcEnabled) def.allowed_callers = t.allowed_callers;
          if (t.eager_input_streaming) def.eager_input_streaming = true;
          return def;
        });
      if (AI_FEATURES.promptCaching && serializedTools.length > 0) {
        serializedTools[serializedTools.length - 1].cache_control = {
          type: 'ephemeral',
          ...(AI_FEATURES.promptCacheTtl !== '5m' ? { ttl: AI_FEATURES.promptCacheTtl } : {}),
        };
      }

      const thinkingSupported = modelSupportsThinking(model);
      const useThinking = AI_FEATURES.adaptiveThinking && options?.thinking && thinkingSupported;
      const body: Record<string, unknown> = {
        model,
        max_tokens: options?.maxTokens ?? 4096,
        temperature: useThinking ? 1 : (options?.temperature ?? 0.7),
        stream: true,
        messages: anthropicMessages,
        tools: serializedTools,
      };
      if (useThinking) {
        body.thinking = options!.thinking;
      }
      if (options?.effort && thinkingSupported) {
        body.output_config = { effort: options.effort };
      }
      const systemField = buildSystemField(systemMessage);
      if (systemField !== undefined) body.system = systemField;
      if (options?.container && ptcEnabled) body.container = options.container;
      if (options?.contextManagement) body.context_management = options.contextManagement;

      // 4-minute timeout for streaming tool completions
      const streamToolController = new AbortController();
      const streamToolTimeout = setTimeout(() => streamToolController.abort(), 240_000);

      // Skip undici keep-alive for streaming — undici buffers response bodies
      // for connection reuse which prevents incremental SSE chunk delivery.
      let response: Response;
      try {
        response = await fetchWithRateLimitRetry(() =>
          fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: buildHeaders(apiKey, options),
            body: JSON.stringify(body),
            signal: streamToolController.signal,
          })
        );
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

      // PTC: container for code-execution sandbox reuse
      let containerInfo: { id: string; expires_at: string } | null = null;
      let containerResolve: (value: { id: string; expires_at: string } | null) => void;
      const containerPromise = new Promise<{ id: string; expires_at: string } | null>(
        (resolve) => { containerResolve = resolve; }
      );

      // Context editing: track applied edits from API response
      type ContextEditResultLocal = { type: string; cleared_input_tokens?: number; cleared_tool_uses?: number; cleared_thinking_turns?: number };
      let contextEdits: ContextEditResultLocal[] = [];
      let contextEditsResolve: (value: ContextEditResultLocal[]) => void;
      const contextEditsPromise = new Promise<ContextEditResultLocal[]>(
        (resolve) => { contextEditsResolve = resolve; }
      );

      // Tool accumulation buffer: Map<block_index, { id, name, jsonChunks }>
      const toolBuffers = new Map<number, { id: string; name: string; jsonChunks: string[] }>();

      // 30s inactivity timeout for tool blocks
      let lastActivity = Date.now();
      const TOOL_TIMEOUT_MS = 30_000;

      // Track stop_reason and raw content blocks for multi-turn agent loops
      let stopReason: 'end_turn' | 'tool_use' | 'max_tokens' = 'end_turn';
      let stopReasonResolve: (value: 'end_turn' | 'tool_use' | 'max_tokens') => void;
      const stopReasonPromise = new Promise<'end_turn' | 'tool_use' | 'max_tokens'>(
        (resolve) => { stopReasonResolve = resolve; }
      );

      const rawContentBlocks: unknown[] = [];
      let rawBlocksResolve: (value: unknown[]) => void;
      const rawBlocksPromise = new Promise<unknown[]>(
        (resolve) => { rawBlocksResolve = resolve; }
      );

      // Accumulate text for current text block
      let currentTextBlock = '';
      let currentTextBlockIndex = -1;
      let currentThinkingBlockIndex = -1;

      // Push-based stream: background loop reads HTTP body and pushes events.
      // Node.js ReadableStream pull() has quirks where it won't re-invoke after
      // a no-enqueue return, so we use start() with an async read loop instead.
      const stream = new ReadableStream<ToolStreamEvent>({
        start(controller) {
          const resolveAll = () => {
            usageResolve!({ inputTokens, outputTokens, cacheCreationInputTokens, cacheReadInputTokens });
            stopReasonResolve!(stopReason);
            rawBlocksResolve!(rawContentBlocks);
            containerResolve!(containerInfo);
            contextEditsResolve!(contextEdits);
          };

          (async () => {
            try {
              while (true) {
                // Tool block inactivity timeout
                if (toolBuffers.size > 0 && Date.now() - lastActivity > TOOL_TIMEOUT_MS) {
                  for (const [, buf] of toolBuffers) {
                    controller.enqueue({
                      type: 'tool_end',
                      id: buf.id,
                      name: buf.name,
                      input: { _error: true, message: 'Tool block timed out after 30s inactivity' } as Record<string, unknown>,
                    });
                  }
                  toolBuffers.clear();
                  break;
                }

                const { done, value } = await reader.read();
                if (done) break;

                lastActivity = Date.now();
                const text = decoder.decode(value);
                const lines = text.split('\n').filter((l) => l.startsWith('data: '));

                for (const line of lines) {
                  try {
                    const parsed = JSON.parse(line.slice(6));

                    if (parsed.type === 'message_start') {
                      inputTokens = parsed.message?.usage?.input_tokens ?? 0;
                      cacheCreationInputTokens = parsed.message?.usage?.cache_creation_input_tokens ?? 0;
                      cacheReadInputTokens = parsed.message?.usage?.cache_read_input_tokens ?? 0;
                      if (parsed.message?.container) {
                        containerInfo = parsed.message.container;
                      }
                      controller.enqueue({ type: 'stream_start' });
                    }

                    if (parsed.type === 'message_delta') {
                      outputTokens = parsed.usage?.output_tokens ?? 0;
                      if (parsed.delta?.stop_reason) {
                        const sr = parsed.delta.stop_reason;
                        if (sr === 'tool_use') stopReason = 'tool_use';
                        else if (sr === 'max_tokens') stopReason = 'max_tokens';
                        else stopReason = 'end_turn';
                      }
                      if (parsed.context_management?.applied_edits) {
                        contextEdits = parsed.context_management.applied_edits;
                      }
                    }

                    if (parsed.type === 'content_block_start') {
                      const block = parsed.content_block;
                      const index = parsed.index ?? 0;

                      if (block?.type === 'tool_use') {
                        toolBuffers.set(index, { id: block.id, name: block.name, jsonChunks: [] });
                        controller.enqueue({ type: 'tool_start', id: block.id, name: block.name });
                      }
                      if (block?.type === 'text') {
                        currentTextBlockIndex = index;
                        currentTextBlock = '';
                      }
                      if (block?.type === 'thinking') {
                        currentThinkingBlockIndex = index;
                      }
                      if (block?.type === 'server_tool_use') {
                        controller.enqueue({ type: 'server_tool_use', id: block.id, name: block.name, input: block.input ?? {} });
                        rawContentBlocks.push(block);
                      }
                      if (block?.type === 'code_execution_tool_result') {
                        const execContent = block.content ?? [];
                        const resultBlock = execContent.find((c: Record<string, unknown>) => c.type === 'code_execution_result');
                        if (resultBlock) {
                          controller.enqueue({
                            type: 'code_execution_result',
                            toolUseId: block.id ?? '',
                            stdout: (resultBlock as Record<string, string>).stdout ?? '',
                            stderr: (resultBlock as Record<string, string>).stderr ?? '',
                            returnCode: (resultBlock as Record<string, number>).return_code ?? -1,
                          });
                        }
                        rawContentBlocks.push(block);
                      }
                    }

                    if (parsed.type === 'content_block_delta') {
                      const index = parsed.index ?? 0;
                      const delta = parsed.delta;

                      if (delta?.type === 'text_delta' && delta.text) {
                        controller.enqueue({ type: 'text_delta', text: delta.text });
                        if (index === currentTextBlockIndex) {
                          currentTextBlock += delta.text;
                        }
                      }

                      if (delta?.type === 'thinking_delta' && delta.thinking) {
                        controller.enqueue({ type: 'thinking_delta', text: delta.thinking });
                      }

                      if (delta?.type === 'signature_delta') {
                        // intentionally ignored
                      } else if (delta?.type === 'input_json_delta' && delta.partial_json !== undefined) {
                        const buf = toolBuffers.get(index);
                        if (buf) {
                          buf.jsonChunks.push(delta.partial_json);
                          controller.enqueue({ type: 'tool_delta', id: buf.id, partialJson: delta.partial_json });
                        }
                      }
                    }

                    if (parsed.type === 'content_block_stop') {
                      const index = parsed.index ?? 0;
                      const buf = toolBuffers.get(index);
                      if (buf) {
                        toolBuffers.delete(index);
                        try {
                          const fullJson = buf.jsonChunks.join('');
                          const input = JSON.parse(fullJson) as Record<string, unknown>;
                          rawContentBlocks.push({ type: 'tool_use', id: buf.id, name: buf.name, input });
                          controller.enqueue({ type: 'tool_end', id: buf.id, name: buf.name, input });
                        } catch {
                          rawContentBlocks.push({ type: 'tool_use', id: buf.id, name: buf.name, input: { _error: true, message: 'Failed to parse tool input JSON' } });
                          controller.enqueue({
                            type: 'tool_end', id: buf.id, name: buf.name,
                            input: { _error: true, message: 'Failed to parse tool input JSON' } as Record<string, unknown>,
                          });
                        }
                      } else if (index === currentTextBlockIndex && currentTextBlock) {
                        rawContentBlocks.push({ type: 'text', text: currentTextBlock });
                        currentTextBlock = '';
                        currentTextBlockIndex = -1;
                      }
                      if (index === currentThinkingBlockIndex) {
                        currentThinkingBlockIndex = -1;
                      }
                    }

                    if (parsed.type === 'message_stop') {
                      controller.close();
                      resolveAll();
                      return;
                    }
                  } catch {
                    // skip malformed SSE chunks
                  }
                }
              }
              controller.close();
              resolveAll();
            } catch (e) {
              const err = e instanceof AIProviderError ? e : classifyNetworkError(e, 'anthropic');
              console.error('[anthropic] streamWithTools() stream error:', err.message);
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
        getContainer: () => containerPromise,
        getContextEdits: () => contextEditsPromise,
      };
    },
  };
}
