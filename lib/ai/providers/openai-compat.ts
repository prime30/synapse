/**
 * OpenAI-compatible provider -- EPIC E
 *
 * Generic adapter for any API compatible with OpenAI's chat completions.
 * Supports: DeepSeek, Groq, Mistral, Fireworks, Together AI, Ollama, etc.
 */

import type {
  AIProviderInterface,
  AIMessage,
  AICompletionOptions,
  AICompletionResult,
  StreamResult,
} from '../types';
import { AIProviderError } from '../errors';

export interface OpenAICompatConfig {
  name: string;
  baseURL: string;
  apiKey: string;
  defaultModel: string;
}

export function createOpenAICompatProvider(config: OpenAICompatConfig): AIProviderInterface {
  const { name, baseURL, apiKey, defaultModel } = config;

  // Normalize base URL (remove trailing slash)
  const base = baseURL.replace(/\/+$/, '');

  return {
    name: name as AIProviderInterface['name'],

    async complete(
      messages: AIMessage[],
      options?: Partial<AICompletionOptions>,
    ): Promise<AICompletionResult> {
      const model = options?.model ?? defaultModel;
      const url = base + '/chat/completions';

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + apiKey,
          },
          body: JSON.stringify({
            model,
            messages: messages.map((m) => ({ role: m.role, content: m.content })),
            max_tokens: options?.maxTokens ?? 1024,
            temperature: options?.temperature ?? 0.7,
          }),
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => 'Unknown error');
          throw new AIProviderError(
            response.status === 429 ? 'RATE_LIMITED' : response.status === 401 ? 'AUTH_ERROR' : 'PROVIDER_ERROR',
            'Provider ' + name + ' error (' + response.status + '): ' + errText,
            name,
            response.status,
          );
        }

        const data = await response.json();
        const choice = data?.choices?.[0];
        const content = choice?.message?.content ?? '';

        return {
          content,
          provider: name,
          model: data?.model ?? model,
          inputTokens: data?.usage?.prompt_tokens ?? 0,
          outputTokens: data?.usage?.completion_tokens ?? 0,
        };
      } catch (err) {
        if (err instanceof AIProviderError) throw err;
        throw new AIProviderError(
          'NETWORK_ERROR',
          'Failed to reach ' + name + ': ' + (err instanceof Error ? err.message : String(err)),
          name,
        );
      }
    },

    async stream(
      messages: AIMessage[],
      options?: Partial<AICompletionOptions>,
    ): Promise<StreamResult> {
      const model = options?.model ?? defaultModel;
      const url = base + '/chat/completions';

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + apiKey,
        },
        body: JSON.stringify({
          model,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          max_tokens: options?.maxTokens ?? 4096,
          temperature: options?.temperature ?? 0.7,
          stream: true,
        }),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => 'Unknown error');
        throw new AIProviderError(
          response.status === 429 ? 'RATE_LIMITED' : 'PROVIDER_ERROR',
          'Provider ' + name + ' stream error: ' + errText,
          name,
          response.status,
        );
      }

      if (!response.body) {
        throw new AIProviderError('PROVIDER_ERROR', 'No response body', name);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      // Track token usage from stream events
      let inputTokens = 0;
      let outputTokens = 0;
      let usageResolve: (value: { inputTokens: number; outputTokens: number }) => void;
      const usagePromise = new Promise<{ inputTokens: number; outputTokens: number }>(
        (resolve) => { usageResolve = resolve; }
      );

      const stream = new ReadableStream<string>({
        async pull(controller) {
          try {
            const { done, value } = await reader.read();
            if (done) {
              controller.close();
              usageResolve!({ inputTokens, outputTokens });
              return;
            }
            const text = decoder.decode(value, { stream: true });
            const lines = text.split('\n').filter((l) => l.startsWith('data: '));
            for (const line of lines) {
              const raw = line.slice(6);
              if (raw === '[DONE]') {
                controller.close();
                usageResolve!({ inputTokens, outputTokens });
                return;
              }
              try {
                const parsed = JSON.parse(raw);
                // Some providers send usage in the final chunk
                if (parsed.usage) {
                  inputTokens = parsed.usage.prompt_tokens ?? 0;
                  outputTokens = parsed.usage.completion_tokens ?? 0;
                }
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) controller.enqueue(content);
              } catch {
                // Skip malformed SSE chunks
              }
            }
          } catch {
            controller.close();
            usageResolve!({ inputTokens, outputTokens });
          }
        },
      });

      return { stream, getUsage: () => usagePromise };
    },
  };
}

/**
 * Health check for an OpenAI-compatible endpoint.
 * Returns latency and availability.
 */
export async function healthCheck(
  config: OpenAICompatConfig,
): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  const base = config.baseURL.replace(/\/+$/, '');

  try {
    const response = await fetch(base + '/models', {
      headers: { Authorization: 'Bearer ' + config.apiKey },
      signal: AbortSignal.timeout(5000),
    });

    const latencyMs = Date.now() - start;

    if (response.ok) {
      return { ok: true, latencyMs };
    }

    // Some providers don't support /models but are still healthy
    // Try a minimal completion instead
    const completionResponse = await fetch(base + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + config.apiKey,
      },
      body: JSON.stringify({
        model: config.defaultModel,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
      }),
      signal: AbortSignal.timeout(10000),
    });

    return {
      ok: completionResponse.ok,
      latencyMs: Date.now() - start,
      error: completionResponse.ok ? undefined : 'Status ' + completionResponse.status,
    };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}