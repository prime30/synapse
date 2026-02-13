/**
 * @deprecated Use `lib/ai/providers/anthropic.ts` (AIProviderInterface) instead.
 * This file is kept for backward compatibility but is no longer used by the Agent base class.
 */

export interface AIProviderClient {
  generateResponse(
    prompt: string,
    systemPrompt: string,
    context: unknown
  ): Promise<string>;
}

/**
 * @deprecated Use `createAnthropicProvider()` from `lib/ai/providers/anthropic.ts` instead.
 */
export function createAnthropicClient(
  model = 'claude-sonnet-4-20250514'
): AIProviderClient {
  return {
    async generateResponse(
      prompt: string,
      systemPrompt: string,
    ): Promise<string> {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        if (response.status === 429) {
          throw new Error('RATE_LIMITED');
        }
        throw new Error(`Anthropic API error: ${response.status} ${err}`);
      }

      const data = (await response.json()) as {
        content?: Array<{ type?: string; text?: string }>;
      };
      const textBlock = data.content?.find((c) => c.type === 'text');
      return textBlock?.text ?? '';
    },
  };
}
