import crypto from 'crypto';

import { createClient as createServiceClient } from '@supabase/supabase-js';
import { APIError } from '@/lib/errors/handler';
import type {
  ShopifyConnection,
  ShopifySyncStatus,
} from '@/lib/types/shopify';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

/**
 * Returns an AES-256 key for token encryption.
 * Prefers SHOPIFY_ENCRYPTION_KEY; falls back to a key derived from
 * SUPABASE_SERVICE_ROLE_KEY so the app works without extra env setup.
 */
function getEncryptionKey(): Buffer {
  const explicit = process.env.SHOPIFY_ENCRYPTION_KEY;
  if (explicit) {
    return Buffer.from(explicit, 'hex');
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey) {
    // Derive a stable 32-byte key from the service role key
    return crypto.createHash('sha256').update(serviceKey).digest();
  }

  throw new Error(
    'Either SHOPIFY_ENCRYPTION_KEY or SUPABASE_SERVICE_ROLE_KEY must be set',
  );
}

/** Supabase client that bypasses RLS for shopify_connections writes. */
function adminSupabase() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for Shopify operations');
  }
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
  );
}

/**
 * Encrypt a plaintext string using AES-256-CBC.
 * Returns `${iv_hex}:${ciphertext_hex}`.
 */
export function encryptToken(text: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt a string previously encrypted with `encryptToken`.
 * Expects the `${iv_hex}:${ciphertext_hex}` format.
 */
export function decryptToken(encrypted: string): string {
  const key = getEncryptionKey();
  const colonIndex = encrypted.indexOf(':');
  if (colonIndex === -1) {
    throw new Error('Invalid encrypted token format');
  }
  const ivHex = encrypted.slice(0, colonIndex);
  const encryptedText = encrypted.slice(colonIndex + 1);
  if (!ivHex || !encryptedText) {
    throw new Error('Invalid encrypted token format');
  }
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export class ShopifyTokenManager {
  /**
   * Encrypt an access token and store (or upsert) the Shopify connection.
   */
  async storeConnection(
    projectId: string,
    storeDomain: string,
    accessToken: string,
    scopes: string[]
  ): Promise<ShopifyConnection> {
    const supabase = adminSupabase();
    const encryptedToken = this.encrypt(accessToken);

    const { data, error } = await supabase
      .from('shopify_connections')
      .upsert(
        {
          project_id: projectId,
          store_domain: storeDomain,
          access_token_encrypted: encryptedToken,
          scopes,
          sync_status: 'connected' as const,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'project_id,store_domain' }
      )
      .select()
      .single();

    if (error) {
      throw new APIError(
        `Failed to store connection: ${error.message}`,
        'CONNECTION_STORE_FAILED',
        500
      );
    }

    return data as ShopifyConnection;
  }

  /**
   * Look up a connection by project and store domain.
   */
  async getConnection(
    projectId: string,
    storeDomain: string
  ): Promise<ShopifyConnection | null> {
    const supabase = adminSupabase();

    const { data, error } = await supabase
      .from('shopify_connections')
      .select('*')
      .eq('project_id', projectId)
      .eq('store_domain', storeDomain)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        return null;
      }
      throw new APIError(
        `Failed to get connection: ${error.message}`,
        'CONNECTION_FETCH_FAILED',
        500
      );
    }

    return data as ShopifyConnection;
  }

  /**
   * Retrieve a connection by ID and return the decrypted access token.
   */
  async getDecryptedToken(connectionId: string): Promise<string> {
    const supabase = adminSupabase();

    const { data, error } = await supabase
      .from('shopify_connections')
      .select('access_token_encrypted')
      .eq('id', connectionId)
      .single();

    if (error || !data) {
      throw APIError.notFound('Connection not found');
    }

    return this.decrypt(data.access_token_encrypted);
  }

  /**
   * Update the theme_id for a connection (e.g. after provisioning a dev theme).
   */
  async updateThemeId(
    connectionId: string,
    themeId: string
  ): Promise<void> {
    const supabase = adminSupabase();

    const { error } = await supabase
      .from('shopify_connections')
      .update({
        theme_id: themeId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', connectionId);

    if (error) {
      throw new APIError(
        `Failed to update theme_id: ${error.message}`,
        'THEME_ID_UPDATE_FAILED',
        500
      );
    }
  }

  /**
   * Get a connection by ID (without decrypted token). Used for provisioning.
   */
  async getConnectionById(
    connectionId: string
  ): Promise<Pick<
    ShopifyConnection,
    'id' | 'project_id' | 'store_domain' | 'theme_id' | 'sync_status' | 'scopes' | 'last_sync_at' | 'created_at' | 'updated_at'
  > | null> {
    const supabase = adminSupabase();

    const { data, error } = await supabase
      .from('shopify_connections')
      .select('id, project_id, store_domain, theme_id, sync_status, scopes, last_sync_at, created_at, updated_at')
      .eq('id', connectionId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new APIError(
        `Failed to get connection: ${error.message}`,
        'CONNECTION_FETCH_FAILED',
        500
      );
    }

    return data as Pick<
      ShopifyConnection,
      'id' | 'project_id' | 'store_domain' | 'theme_id' | 'sync_status' | 'scopes' | 'last_sync_at' | 'created_at' | 'updated_at'
    >;
  }

  /**
   * Update the sync status of a connection.
   */
  async updateSyncStatus(
    connectionId: string,
    status: ShopifySyncStatus
  ): Promise<void> {
    const supabase = adminSupabase();

    const { error } = await supabase
      .from('shopify_connections')
      .update({
        sync_status: status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', connectionId);

    if (error) {
      throw new APIError(
        `Failed to update sync status: ${error.message}`,
        'SYNC_STATUS_UPDATE_FAILED',
        500
      );
    }
  }

  /**
   * Delete a Shopify connection by ID.
   */
  async deleteConnection(connectionId: string): Promise<void> {
    const supabase = adminSupabase();

    const { error } = await supabase
      .from('shopify_connections')
      .delete()
      .eq('id', connectionId);

    if (error) {
      throw new APIError(
        `Failed to delete connection: ${error.message}`,
        'CONNECTION_DELETE_FAILED',
        500
      );
    }
  }

  // ── Simple AES-256-CBC encryption using env secret ──────────────────

  private encrypt(text: string): string {
    return encryptToken(text);
  }

  private decrypt(encrypted: string): string {
    return decryptToken(encrypted);
  }
}
