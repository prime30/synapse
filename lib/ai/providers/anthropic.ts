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

export function createAnthropicProvider(customApiKey?: string): AIProviderInterface {
  return {
    name: 'anthropic',

    async complete(
      messages: AIMessage[],
      options?: Partial<AICompletionOptions>
    ): Promise<AICompletionResult> {
      const apiKey = customApiKey ?? process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new AIProviderError('AUTH_ERROR', 'ANTHROPIC_API_KEY is not set', 'anthropic');

      const model = options?.model ?? 'claude-3-5-haiku-20241022';
      const systemMessage = messages.find((m) => m.role === 'system');
      const chatMessages = messages.filter((m) => m.role !== 'system');

      const body: Record<string, unknown> = {
        model,
        max_tokens: options?.maxTokens ?? 1024,
        temperature: options?.temperature ?? 0.7,
        messages: chatMessages.map((m) => ({ role: m.role, content: m.content })),
      };
      if (systemMessage) body.system = systemMessage.content;

      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(body),
        });

        const bodyText = await response.text();
        if (!response.ok) {
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

      const model = options?.model ?? 'claude-3-5-haiku-20241022';
      const systemMessage = messages.find((m) => m.role === 'system');
      const chatMessages = messages.filter((m) => m.role !== 'system');

      const body: Record<string, unknown> = {
        model,
        max_tokens: options?.maxTokens ?? 1024,
        temperature: options?.temperature ?? 0.7,
        stream: true,
        messages: chatMessages.map((m) => ({ role: m.role, content: m.content })),
      };
      if (systemMessage) body.system = systemMessage.content;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const err = await response.text();
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
              try {
                const parsed = JSON.parse(line.slice(6));

                // Capture input tokens from message_start event
                if (parsed.type === 'message_start') {
                  inputTokens = parsed.message?.usage?.input_tokens ?? 0;
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
            usageResolve!({ inputTokens, outputTokens });
          }
        },
      });

      return { stream, getUsage: () => usagePromise };
    },
  };
}
