import { getAIProvider } from './get-provider';
import type { AICompletionResult } from './types';

export async function requestSuggestion(
  prompt: string,
  context: string,
  provider: 'openai' | 'anthropic' = 'openai'
): Promise<AICompletionResult> {
  const client = getAIProvider(provider);
  return client.complete([
    {
      role: 'system',
      content: 'You are a Shopify theme expert.',
    },
    {
      role: 'user',
      content: `${prompt}\n\nContext:\n${context}`,
    },
  ]);
}
