/**
 * @deprecated Legacy provider interface — use `AIProviderInterface` from
 * `lib/ai/types.ts` and `getAIProvider()` from `lib/ai/providers/` instead.
 * Kept only so the remaining legacy openai-client / google-client compile.
 */
export interface AIProviderClient {
  generateResponse(
    prompt: string,
    systemPrompt: string,
    context: unknown,
  ): Promise<string>;
}

export { createOpenAIClient } from './openai-client';
export { createGoogleClient, streamGoogleResponse } from './google-client';