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

function isNoRowsError(error: unknown): boolean {
  const err = error as { code?: string };
  return err?.code === 'PGRST116';
}

function isStoreFirstColumnMissingError(error: unknown): boolean {
  const err = error as { code?: string; message?: string };
  const message = (err?.message ?? '').toLowerCase();
  return (
    err?.code === 'PGRST204' ||
    err?.code === '42703' ||
    (message.includes('column') &&
      message.includes('shopify_connections') &&
      (message.includes('is_active') || message.includes('user_id'))) ||
    (message.includes('schema cache') &&
      (message.includes('is_active') || message.includes('user_id')))
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
  private async getProjectIdsForUser(userId: string): Promise<string[]> {
    const supabase = adminSupabase();
    const { data: memberships, error: membersError } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', userId);

    if (membersError) {
      throw new APIError(
        `Failed to load memberships: ${membersError.message}`,
        'CONNECTION_FETCH_FAILED',
        500
      );
    }

    const orgIds = [...new Set((memberships ?? []).map((m) => m.organization_id))];
    if (orgIds.length === 0) return [];

    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select('id')
      .in('organization_id', orgIds)
      .order('updated_at', { ascending: false });

    if (projectsError) {
      throw new APIError(
        `Failed to load projects: ${projectsError.message}`,
        'CONNECTION_FETCH_FAILED',
        500
      );
    }

    return (projects ?? []).map((p) => p.id);
  }

  private asLegacyCompatibleConnection(
    row: Omit<ShopifyConnection, 'user_id' | 'is_active'> & {
      user_id?: string;
      is_active?: boolean;
    },
    userId: string
  ): ShopifyConnection {
    return {
      ...row,
      user_id: row.user_id ?? userId,
      is_active: row.is_active ?? true,
    } as ShopifyConnection;
  }

  private async getLegacyConnectionByProjectId(
    projectId: string
  ): Promise<ShopifyConnection | null> {
    const supabase = adminSupabase();
    const { data, error } = await supabase
      .from('shopify_connections')
      .select('*')
      .eq('project_id', projectId)
      .maybeSingle();

    if (error) {
      if (isNoRowsError(error)) return null;
      throw new APIError(
        `Failed to get connection: ${error.message}`,
        'CONNECTION_FETCH_FAILED',
        500
      );
    }
    return (data ?? null) as ShopifyConnection | null;
  }

  /**
   * Encrypt an access token and store (or upsert) the Shopify connection.
   * User-scoped: keyed by (user_id, store_domain). Auto-activates.
   */
  async storeConnection(
    userId: string,
    storeDomain: string,
    accessToken: string,
    scopes: string[],
    options?: { projectId?: string }
  ): Promise<ShopifyConnection> {
    const supabase = adminSupabase();
    const encryptedToken = this.encrypt(accessToken);

    try {
      // Deactivate any other active connection for this user first
      await supabase
        .from('shopify_connections')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('is_active', true);

      const { data, error } = await supabase
        .from('shopify_connections')
        .upsert(
          {
            user_id: userId,
            store_domain: storeDomain,
            access_token_encrypted: encryptedToken,
            scopes,
            sync_status: 'connected' as const,
            is_active: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,store_domain' }
        )
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data as ShopifyConnection;
    } catch (error) {
      if (!isStoreFirstColumnMissingError(error)) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        throw new APIError(
          `Failed to store connection: ${message}`,
          'CONNECTION_STORE_FAILED',
          500
        );
      }

      // Legacy fallback: project-scoped schema
      const projectId =
        options?.projectId ??
        (await this.getProjectIdsForUser(userId)).at(0);

      if (!projectId) {
        throw APIError.badRequest(
          'A project is required to connect a store before database migrations are applied.'
        );
      }

      const { data: legacyData, error: legacyError } = await supabase
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

      if (legacyError) {
        throw new APIError(
          `Failed to store connection: ${legacyError.message}`,
          'CONNECTION_STORE_FAILED',
          500
        );
      }

      return this.asLegacyCompatibleConnection(
        legacyData as ShopifyConnection,
        userId
      );
    }
  }

  /**
   * Get the currently active store connection for a user.
   */
  async getActiveConnection(
    userId: string,
    options?: { projectId?: string }
  ): Promise<ShopifyConnection | null> {
    const supabase = adminSupabase();

    try {
      const { data, error } = await supabase
        .from('shopify_connections')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data as ShopifyConnection | null;
    } catch (error) {
      if (!isStoreFirstColumnMissingError(error)) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        throw new APIError(
          `Failed to get active connection: ${message}`,
          'CONNECTION_FETCH_FAILED',
          500
        );
      }

      // Legacy fallback: resolve by project if provided, otherwise most recently updated
      if (options?.projectId) {
        const connection = await this.getLegacyConnectionByProjectId(options.projectId);
        return connection
          ? this.asLegacyCompatibleConnection(connection, userId)
          : null;
      }

      const projectIds = await this.getProjectIdsForUser(userId);
      if (projectIds.length === 0) return null;

      const { data: rows, error: legacyError } = await supabase
        .from('shopify_connections')
        .select('*')
        .in('project_id', projectIds)
        .order('updated_at', { ascending: false })
        .limit(1);

      if (legacyError) {
        throw new APIError(
          `Failed to get active connection: ${legacyError.message}`,
          'CONNECTION_FETCH_FAILED',
          500
        );
      }

      const row = rows?.[0];
      return row
        ? this.asLegacyCompatibleConnection(row as ShopifyConnection, userId)
        : null;
    }
  }

  /**
   * Switch the active store for a user.
   */
  async activateStore(
    userId: string,
    connectionId: string,
    options?: { projectId?: string }
  ): Promise<void> {
    const supabase = adminSupabase();

    try {
      // Deactivate all
      await supabase
        .from('shopify_connections')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('is_active', true);

      // Activate the target
      const { error } = await supabase
        .from('shopify_connections')
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq('id', connectionId)
        .eq('user_id', userId);

      if (error) {
        throw error;
      }
      return;
    } catch (error) {
      if (!isStoreFirstColumnMissingError(error)) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        throw new APIError(
          `Failed to activate store: ${message}`,
          'ACTIVATE_STORE_FAILED',
          500
        );
      }

      // Legacy fallback: no is_active column. Validate the connection exists in scope.
      if (options?.projectId) {
        const scoped = await this.getLegacyConnectionByProjectId(options.projectId);
        if (!scoped || scoped.id !== connectionId) {
          throw APIError.notFound('Store connection not found');
        }
        return;
      }

      const projectIds = await this.getProjectIdsForUser(userId);
      if (projectIds.length === 0) {
        throw APIError.notFound('Store connection not found');
      }

      const { data: rows, error: legacyError } = await supabase
        .from('shopify_connections')
        .select('id')
        .in('project_id', projectIds)
        .eq('id', connectionId)
        .limit(1);

      if (legacyError) {
        throw new APIError(
          `Failed to activate store: ${legacyError.message}`,
          'ACTIVATE_STORE_FAILED',
          500
        );
      }
      if (!rows?.length) {
        throw APIError.notFound('Store connection not found');
      }
    }
  }

  /**
   * List all store connections for a user.
   */
  async listConnections(
    userId: string,
    options?: { projectId?: string }
  ): Promise<ShopifyConnection[]> {
    const supabase = adminSupabase();

    try {
      const { data, error } = await supabase
        .from('shopify_connections')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });

      if (error) {
        throw error;
      }

      return (data ?? []) as ShopifyConnection[];
    } catch (error) {
      if (!isStoreFirstColumnMissingError(error)) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        throw new APIError(
          `Failed to list connections: ${message}`,
          'CONNECTION_LIST_FAILED',
          500
        );
      }

      if (options?.projectId) {
        const scoped = await this.getLegacyConnectionByProjectId(options.projectId);
        return scoped
          ? [this.asLegacyCompatibleConnection(scoped, userId)]
          : [];
      }

      const projectIds = await this.getProjectIdsForUser(userId);
      if (projectIds.length === 0) return [];

      const { data: rows, error: legacyError } = await supabase
        .from('shopify_connections')
        .select('*')
        .in('project_id', projectIds)
        .order('updated_at', { ascending: false });

      if (legacyError) {
        throw new APIError(
          `Failed to list connections: ${legacyError.message}`,
          'CONNECTION_LIST_FAILED',
          500
        );
      }

      return (rows ?? []).map((row) =>
        this.asLegacyCompatibleConnection(row as ShopifyConnection, userId)
      );
    }
  }

  /**
   * Look up a connection by user and store domain.
   */
  async getConnection(
    userId: string,
    storeDomain: string,
    options?: { projectId?: string }
  ): Promise<ShopifyConnection | null> {
    const supabase = adminSupabase();

    try {
      const { data, error } = await supabase
        .from('shopify_connections')
        .select('*')
        .eq('user_id', userId)
        .eq('store_domain', storeDomain)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data as ShopifyConnection | null;
    } catch (error) {
      if (!isStoreFirstColumnMissingError(error)) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        throw new APIError(
          `Failed to get connection: ${message}`,
          'CONNECTION_FETCH_FAILED',
          500
        );
      }

      if (options?.projectId) {
        const { data: row, error: legacyError } = await supabase
          .from('shopify_connections')
          .select('*')
          .eq('project_id', options.projectId)
          .eq('store_domain', storeDomain)
          .maybeSingle();

        if (legacyError) {
          throw new APIError(
            `Failed to get connection: ${legacyError.message}`,
            'CONNECTION_FETCH_FAILED',
            500
          );
        }
        return row
          ? this.asLegacyCompatibleConnection(row as ShopifyConnection, userId)
          : null;
      }

      const projectIds = await this.getProjectIdsForUser(userId);
      if (projectIds.length === 0) return null;

      const { data: rows, error: legacyError } = await supabase
        .from('shopify_connections')
        .select('*')
        .in('project_id', projectIds)
        .eq('store_domain', storeDomain)
        .order('updated_at', { ascending: false })
        .limit(1);

      if (legacyError) {
        throw new APIError(
          `Failed to get connection: ${legacyError.message}`,
          'CONNECTION_FETCH_FAILED',
          500
        );
      }

      const row = rows?.[0];
      return row
        ? this.asLegacyCompatibleConnection(row as ShopifyConnection, userId)
        : null;
    }
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
    'id' | 'user_id' | 'project_id' | 'store_domain' | 'theme_id' | 'is_active' | 'sync_status' | 'scopes' | 'last_sync_at' | 'created_at' | 'updated_at'
  > | null> {
    const supabase = adminSupabase();

    try {
      const { data, error } = await supabase
        .from('shopify_connections')
        .select('id, user_id, project_id, store_domain, theme_id, is_active, sync_status, scopes, last_sync_at, created_at, updated_at')
        .eq('id', connectionId)
        .single();

      if (error) {
        throw error;
      }

      return data as Pick<
        ShopifyConnection,
        'id' | 'user_id' | 'project_id' | 'store_domain' | 'theme_id' | 'is_active' | 'sync_status' | 'scopes' | 'last_sync_at' | 'created_at' | 'updated_at'
      >;
    } catch (error) {
      if (!isStoreFirstColumnMissingError(error)) {
        if (isNoRowsError(error)) {
          return null;
        }
        const message = error instanceof Error ? error.message : 'Unknown error';
        throw new APIError(
          `Failed to get connection: ${message}`,
          'CONNECTION_FETCH_FAILED',
          500
        );
      }

      const { data: legacyData, error: legacyError } = await supabase
        .from('shopify_connections')
        .select('id, project_id, store_domain, theme_id, sync_status, scopes, last_sync_at, created_at, updated_at')
        .eq('id', connectionId)
        .single();

      if (legacyError) {
        if (isNoRowsError(legacyError)) {
          return null;
        }
        throw new APIError(
          `Failed to get connection: ${legacyError.message}`,
          'CONNECTION_FETCH_FAILED',
          500
        );
      }

      let ownerId = '';
      if (legacyData?.project_id) {
        const { data: project } = await supabase
          .from('projects')
          .select('owner_id')
          .eq('id', legacyData.project_id)
          .maybeSingle();
        ownerId = project?.owner_id ?? '';
      }

      return {
        ...legacyData,
        user_id: ownerId,
        is_active: true,
      } as Pick<
        ShopifyConnection,
        'id' | 'user_id' | 'project_id' | 'store_domain' | 'theme_id' | 'is_active' | 'sync_status' | 'scopes' | 'last_sync_at' | 'created_at' | 'updated_at'
      >;
    }
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
