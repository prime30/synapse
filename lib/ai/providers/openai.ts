import type {
  AIProviderInterface,
  AIMessage,
  AICompletionOptions,
  AICompletionResult,
  StreamResult,
} from '../types';
import {
  AIProviderError,
  classifyProviderError,
  classifyNetworkError,
  formatSSEError,
} from '../errors';

const RATE_LIMIT_MAX_ATTEMPTS = 3;

async function fetchWithRateLimitRetry(fetchFn: () => Promise<Response>): Promise<Response> {
  for (let attempt = 0; attempt < RATE_LIMIT_MAX_ATTEMPTS; attempt++) {
    const res = await fetchFn();
    if (res.status === 429 && attempt < RATE_LIMIT_MAX_ATTEMPTS - 1) {
      await res.text();
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

export function createOpenAIProvider(customApiKey?: string): AIProviderInterface {
  return {
    name: 'openai',

    async complete(
      messages: AIMessage[],
      options?: Partial<AICompletionOptions>
    ): Promise<AICompletionResult> {
      const apiKey = customApiKey ?? process.env.OPENAI_API_KEY;
      if (!apiKey) throw new AIProviderError('AUTH_ERROR', 'OPENAI_API_KEY is not set', 'openai');

      const model = options?.model ?? 'gpt-4o-mini';

      try {
        const response = await fetchWithRateLimitRetry(() => fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: messages.map((m) => ({
              role: m.role,
              content: m.images?.length
                ? [
                    ...m.images.map((img) => ({ type: 'image_url' as const, image_url: { url: `data:${img.mimeType};base64,${img.base64}` } })),
                    { type: 'text' as const, text: m.content },
                  ]
                : m.content,
            })),
            max_tokens: options?.maxTokens ?? 1024,
            temperature: options?.temperature ?? 0.7,
          }),
        }));

        const bodyText = await response.text();
        if (!response.ok) {
          throw classifyProviderError(response.status, bodyText, 'openai');
        }

        const data = JSON.parse(bodyText || '{}') as {
          choices: Array<{ message?: { content?: string } }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };

        if (!data.choices[0]?.message?.content) {
          throw new AIProviderError('EMPTY_RESPONSE', 'OpenAI returned no content', 'openai');
        }

        return {
          content: data.choices[0].message.content,
          provider: 'openai',
          model,
          inputTokens: data.usage?.prompt_tokens,
          outputTokens: data.usage?.completion_tokens,
        };
      } catch (e) {
        if (e instanceof AIProviderError) throw e;
        throw classifyNetworkError(e, 'openai');
      }
    },

    async stream(
      messages: AIMessage[],
      options?: Partial<AICompletionOptions>
    ): Promise<StreamResult> {
      const apiKey = customApiKey ?? process.env.OPENAI_API_KEY;
      if (!apiKey) throw new AIProviderError('AUTH_ERROR', 'OPENAI_API_KEY is not set', 'openai');

      const model = options?.model ?? 'gpt-4o-mini';
      const response = await fetchWithRateLimitRetry(() => fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.images?.length
              ? [
                  ...m.images.map((img) => ({ type: 'image_url' as const, image_url: { url: `data:${img.mimeType};base64,${img.base64}` } })),
                  { type: 'text' as const, text: m.content },
                ]
              : m.content,
          })),
          max_tokens: options?.maxTokens ?? 1024,
          temperature: options?.temperature ?? 0.7,
          stream: true,
          stream_options: { include_usage: true },
        }),
      }));

      if (!response.ok) {
        const err = await response.text();
        throw classifyProviderError(response.status, err, 'openai');
      }
      if (!response.body) {
        throw new AIProviderError('UNKNOWN', 'OpenAI returned no stream body', 'openai');
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
            const text = decoder.decode(value);
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

                // OpenAI sends usage in the final chunk when stream_options.include_usage is true
                if (parsed.usage) {
                  inputTokens = parsed.usage.prompt_tokens ?? 0;
                  outputTokens = parsed.usage.completion_tokens ?? 0;
                }

                const content = parsed.choices?.[0]?.delta?.content;
                if (content) controller.enqueue(content);
              } catch {
                // skip malformed chunks
              }
            }
          } catch (e) {
            const err = e instanceof AIProviderError ? e : classifyNetworkError(e, 'openai');
            controller.enqueue(formatSSEError(err));
            controller.close();
            usageResolve!({ inputTokens, outputTokens });
          }
        },
      });

      return { stream, getUsage: () => usagePromise };
    },
  };
}
