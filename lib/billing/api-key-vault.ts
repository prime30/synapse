import crypto from 'crypto';
import { createServiceClient } from '@/lib/supabase/admin';
import { AI_FEATURES } from '@/lib/ai/feature-flags';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AIProvider = 'anthropic' | 'openai' | 'google';

// ---------------------------------------------------------------------------
// Encryption (AES-256-GCM)
// ---------------------------------------------------------------------------

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error('ENCRYPTION_KEY environment variable is not set');
  return Buffer.from(key, 'hex');
}

function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();
  // Store as iv:tag:ciphertext (all hex-encoded)
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

function decrypt(stored: string): string {
  const parts = stored.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted key format');
  const [ivHex, tagHex, ciphertext] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ---------------------------------------------------------------------------
// Key storage
// ---------------------------------------------------------------------------

/**
 * Store (or upsert) an encrypted API key for an org + provider.
 */
export async function storeKey(
  orgId: string,
  provider: AIProvider,
  apiKey: string,
): Promise<void> {
  const supabase = createServiceClient();
  const encrypted = encrypt(apiKey);
  const suffix = apiKey.slice(-4);

  const { error } = await supabase.from('user_api_keys').upsert(
    {
      organization_id: orgId,
      provider,
      encrypted_key: encrypted,
      key_suffix: suffix,
      is_valid: true,
      last_verified_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id,provider' },
  );

  if (error) throw error;
}

/**
 * Retrieve and decrypt a stored API key.
 * Returns null if the key doesn't exist, is invalid, or decryption fails.
 */
export async function getKey(
  orgId: string,
  provider: AIProvider,
): Promise<string | null> {
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('user_api_keys')
      .select('encrypted_key, is_valid')
      .eq('organization_id', orgId)
      .eq('provider', provider)
      .single();

    if (!data || !data.is_valid) return null;

    return decrypt(data.encrypted_key);
  } catch {
    return null;
  }
}

/**
 * Delete a stored API key.
 */
export async function deleteKey(
  orgId: string,
  provider: AIProvider,
): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from('user_api_keys')
    .delete()
    .eq('organization_id', orgId)
    .eq('provider', provider);
}

/**
 * List all stored keys for an org (metadata only — never the actual key).
 */
export async function listKeys(
  orgId: string,
): Promise<
  Array<{
    provider: string;
    suffix: string;
    isValid: boolean;
    lastVerified: string | null;
  }>
> {
  try {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from('user_api_keys')
      .select('provider, key_suffix, is_valid, last_verified_at')
      .eq('organization_id', orgId);

    return (data ?? []).map((k) => ({
      provider: k.provider,
      suffix: k.key_suffix,
      isValid: k.is_valid,
      lastVerified: k.last_verified_at,
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

/**
 * Verify a raw API key by making a minimal API call.
 */
export async function verifyKey(
  provider: AIProvider,
  apiKey: string,
): Promise<boolean> {
  try {
    if (provider === 'anthropic') {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      };
      if (AI_FEATURES.promptCaching) {
        headers['anthropic-beta'] = 'prompt-caching-2024-07-31';
      }
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        }),
      });
      // 200 = valid; 400 = valid key, bad request; 401 = invalid key
      return res.status !== 401 && res.status !== 403;
    }
    if (provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      return res.ok;
    }
    if (provider === 'google') {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      );
      return res.ok;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Re-verify a stored key and update its status.
 */
export async function reverifyStoredKey(
  orgId: string,
  provider: AIProvider,
): Promise<boolean> {
  const key = await getKey(orgId, provider);
  if (!key) return false;

  const valid = await verifyKey(provider, key);
  const supabase = createServiceClient();

  await supabase
    .from('user_api_keys')
    .update({
      is_valid: valid,
      last_verified_at: new Date().toISOString(),
    })
    .eq('organization_id', orgId)
    .eq('provider', provider);

  return valid;
}

/**
 * Mark a key as invalid (e.g., after an auth error during usage).
 */
export async function markKeyInvalid(
  orgId: string,
  provider: AIProvider,
): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from('user_api_keys')
    .update({ is_valid: false })
    .eq('organization_id', orgId)
    .eq('provider', provider);
}
