import { getKey, markKeyInvalid, type AIProvider } from './api-key-vault';
import type { AIProviderInterface } from '@/lib/ai/types';
import { createAnthropicProvider } from '@/lib/ai/providers/anthropic';
import { createOpenAIProvider } from '@/lib/ai/providers/openai';
import { createGoogleProvider } from '@/lib/ai/providers/google';

/**
 * Attempt to create an AI provider using a BYOK (Bring Your Own Key) key
 * stored for the given organization.
 *
 * Returns `{ provider, isByok: true }` when a valid key is found, or `null`
 * so the caller can fall back to the platform key.
 */
export async function getByokProvider(
  orgId: string,
  providerName: AIProvider,
): Promise<{ provider: AIProviderInterface; isByok: true } | null> {
  const key = await getKey(orgId, providerName);
  if (!key) return null;

  const provider = createProviderWithKey(providerName, key);
  return { provider, isByok: true };
}

/**
 * Wrapper around `getByokProvider` that marks the key as invalid
 * when an AUTH_ERROR is thrown during usage.
 *
 * Use this in hot paths (chat, agents) so invalid BYOK keys are
 * automatically flagged and the next request falls back to the
 * platform key.
 */
export async function getByokProviderSafe(
  orgId: string,
  providerName: AIProvider,
): Promise<{ provider: AIProviderInterface; isByok: true } | null> {
  const result = await getByokProvider(orgId, providerName);
  if (!result) return null;

  // Wrap provider methods to detect auth failures
  const wrapped: AIProviderInterface = {
    name: result.provider.name,

    async complete(messages, options) {
      try {
        return await result.provider.complete(messages, options);
      } catch (err) {
        if (isAuthError(err)) {
          await markKeyInvalid(orgId, providerName);
        }
        throw err;
      }
    },

    async stream(messages, options) {
      try {
        return await result.provider.stream(messages, options);
      } catch (err) {
        if (isAuthError(err)) {
          await markKeyInvalid(orgId, providerName);
        }
        throw err;
      }
    },
  };

  return { provider: wrapped, isByok: true };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createProviderWithKey(
  providerName: AIProvider,
  apiKey: string,
): AIProviderInterface {
  switch (providerName) {
    case 'anthropic':
      return createAnthropicProvider(apiKey);
    case 'openai':
      return createOpenAIProvider(apiKey);
    case 'google':
      return createGoogleProvider(apiKey);
    default:
      throw new Error(`Unknown provider: ${providerName}`);
  }
}

function isAuthError(err: unknown): boolean {
  if (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === 'AUTH_ERROR'
  ) {
    return true;
  }
  return false;
}
