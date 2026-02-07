import type { AIProviderClient } from './anthropic-client';

/**
 * OpenAI GPT client for agent execution.
 * Uses GPT-4 for the Review Agent (code review + security).
 */
export function createOpenAIClient(
  model = 'gpt-4o'
): AIProviderClient {
  return {
    async generateResponse(
      prompt: string,
      systemPrompt: string,
    ): Promise<string> {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

      const response = await fetch(
        'https://api.openai.com/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            max_tokens: 4096,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: prompt },
            ],
          }),
        }
      );

      if (!response.ok) {
        const err = await response.text();
        if (response.status === 429) {
          throw new Error('RATE_LIMITED');
        }
        throw new Error(`OpenAI API error: ${response.status} ${err}`);
      }

      const data = (await response.json()) as {
        choices: Array<{ message?: { content?: string } }>;
      };
      return data.choices[0]?.message?.content ?? '';
    },
  };
}
