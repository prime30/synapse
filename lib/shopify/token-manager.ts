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
    if (process.env.NODE_ENV === 'production') {
      console.warn(
        '[SECURITY] SHOPIFY_ENCRYPTION_KEY is not set. Falling back to SUPABASE_SERVICE_ROLE_KEY-derived key. ' +
        'Set SHOPIFY_ENCRYPTION_KEY in production to avoid token loss if the service key is rotated.',
      );
    }
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

/**
 * Extract a human-readable message from any thrown value.
 * Handles: Error instances, Supabase/PostgREST error objects, strings, etc.
 */
function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const obj = error as Record<string, unknown>;
    if (typeof obj.message === 'string') return obj.message;
    if (typeof obj.details === 'string') return obj.details;
    if (typeof obj.hint === 'string') return obj.hint;
    try { return JSON.stringify(error); } catch { /* ignore */ }
  }
  return 'Unknown error';
}

/**
 * Detect schema-mismatch errors that should trigger the legacy fallback path.
 * Catches: missing columns (user_id, is_active), schema cache stale, and
 * missing unique constraint on (user_id, store_domain).
 */
function isSchemaFallbackError(error: unknown): boolean {
  const err = error as { code?: string; message?: string };
  const message = (err?.message ?? '').toLowerCase();
  const code = err?.code ?? '';
  return (
    // PostgREST: schema cache mismatch
    code === 'PGRST204' ||
    // PostgreSQL: column does not exist
    code === '42703' ||
    // PostgreSQL: no unique or exclusion constraint matching ON CONFLICT
    code === '42P10' ||
    (message.includes('column') &&
      message.includes('shopify_connections') &&
      (message.includes('is_active') || message.includes('user_id'))) ||
    (message.includes('schema cache') &&
      (message.includes('is_active') || message.includes('user_id'))) ||
    // Constraint-related errors for the upsert
    message.includes('on conflict') ||
    message.includes('unique constraint') ||
    message.includes('exclusion constraint')
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

  /**
   * Auto-create a bare project so the legacy schema can store a connection.
   * Called during onboarding when no projects exist yet.
   */
  private async ensurePlaceholderProject(
    userId: string,
    storeDomain: string
  ): Promise<string> {
    const supabase = adminSupabase();

    // Find the user's organization (or create one)
    const { data: memberships } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', userId)
      .limit(1);

    let orgId = memberships?.[0]?.organization_id;

    if (!orgId) {
      // Create a personal organization for the user
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .insert({ name: 'Personal', owner_id: userId })
        .select('id')
        .single();

      if (orgError || !org) {
        throw new APIError(
          `Failed to create organization: ${orgError?.message ?? 'unknown'}`,
          'ORG_CREATE_FAILED',
          500
        );
      }

      orgId = org.id;

      // Add user as member
      await supabase
        .from('organization_members')
        .insert({ organization_id: orgId, user_id: userId, role: 'owner' });
    }

    // Create placeholder project
    const storeName = storeDomain.replace(/\.myshopify\.com$/, '');
    const { data: project, error: projError } = await supabase
      .from('projects')
      .insert({
        name: storeName,
        organization_id: orgId,
        owner_id: userId,
      })
      .select('id')
      .single();

    if (projError || !project) {
      throw new APIError(
        `Failed to create placeholder project: ${projError?.message ?? 'unknown'}`,
        'PROJECT_CREATE_FAILED',
        500
      );
    }

    return project.id;
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
   * Reverse lookup: resolve a connection via `projects.shopify_connection_id`.
   * The import flow sets this FK on the project but doesn't always update
   * `shopify_connections.project_id`, so a direct lookup can miss it.
   */
  private async getConnectionViaProject(
    supabase: ReturnType<typeof adminSupabase>,
    projectId: string,
    userId: string
  ): Promise<ShopifyConnection | null> {
    try {
      const { data: project } = await supabase
        .from('projects')
        .select('shopify_connection_id')
        .eq('id', projectId)
        .maybeSingle();

      if (!project?.shopify_connection_id) return null;

      const { data: conn } = await supabase
        .from('shopify_connections')
        .select('*')
        .eq('id', project.shopify_connection_id)
        .maybeSingle();

      if (!conn) return null;

      return this.asLegacyCompatibleConnection(conn as ShopifyConnection, userId);
    } catch {
      // Column may not exist (pre-migration-025) — safe to ignore
      return null;
    }
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
      if (!isSchemaFallbackError(error)) {
        const message = extractErrorMessage(error);
        throw new APIError(
          `Failed to store connection: ${message}`,
          'CONNECTION_STORE_FAILED',
          500
        );
      }

      // Legacy fallback: project-scoped schema
      let projectId =
        options?.projectId ??
        (await this.getProjectIdsForUser(userId)).at(0);

      // During onboarding, no project exists yet — auto-create a placeholder
      // so the connection can be stored. The import step will create the real project.
      if (!projectId) {
        projectId = await this.ensurePlaceholderProject(userId, storeDomain);
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

    // Project-scoped calls must resolve the project's connection first.
    // Returning a user-global is_active connection here causes cross-project
    // leakage (e.g. preview session/password appears disconnected on refresh
    // because we read/write the wrong connection row).
    if (options?.projectId) {
      const reverseConnection = await this.getConnectionViaProject(supabase, options.projectId, userId);
      if (reverseConnection) {
        return reverseConnection;
      }

      const legacyScoped = await this.getLegacyConnectionByProjectId(options.projectId);
      if (legacyScoped) {
        return this.asLegacyCompatibleConnection(legacyScoped, userId);
      }
    }

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

      // Primary query found a result — return it
      if (data) {
        return data as ShopifyConnection;
      }

      // Fall through to legacy lookup — the connection may have been
      // stored via the project-scoped fallback (no user_id/is_active).
    } catch (error) {
      // If the table doesn't exist or has a schema issue, return null gracefully
      const err = error as { code?: string; message?: string };
      const isTableMissing =
        err?.code === '42P01' ||
        (err?.message ?? '').toLowerCase().includes('relation') ||
        (err?.message ?? '').toLowerCase().includes('does not exist');

      if (!isSchemaFallbackError(error) && !isTableMissing) {
        const message = extractErrorMessage(error);
        throw new APIError(
          `Failed to get active connection: ${message}`,
          'CONNECTION_FETCH_FAILED',
          500
        );
      }

      if (isTableMissing) {
        return null;
      }

      // Schema fallback — continue to legacy lookup below
    }

    // Legacy fallback: resolve by project if provided, otherwise most recently updated
    if (options?.projectId) {
      const connection = await this.getLegacyConnectionByProjectId(options.projectId);
      if (connection) {
        return this.asLegacyCompatibleConnection(connection, userId);
      }

      // Reverse lookup: the import flow sets projects.shopify_connection_id
      // but may not update shopify_connections.project_id back to this project.
      const reverseConnection = await this.getConnectionViaProject(supabase, options.projectId, userId);
      if (reverseConnection) {
        return reverseConnection;
      }
    }

    const projectIds = await this.getProjectIdsForUser(userId);
    if (projectIds.length === 0) return null;

    // Limit IDs to avoid exceeding HTTP URL length limits in the PostgREST
    // .in() filter (577 UUIDs ≈ 21KB, well past the ~8KB URL limit).
    // Projects are sorted by updated_at DESC, so the most recent are first —
    // the legacy storeConnection path always picks the most recent project.
    const MAX_IN_IDS = 50;
    const limitedProjectIds = projectIds.slice(0, MAX_IN_IDS);

    const { data: rows, error: legacyError } = await supabase
      .from('shopify_connections')
      .select('*')
      .in('project_id', limitedProjectIds)
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
      if (!isSchemaFallbackError(error)) {
        const message = extractErrorMessage(error);
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

      const limitedIds = projectIds.slice(0, 50);
      const { data: rows, error: legacyError } = await supabase
        .from('shopify_connections')
        .select('id')
        .in('project_id', limitedIds)
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
      const err = error as { code?: string; message?: string };
      const isTableMissing =
        err?.code === '42P01' ||
        (err?.message ?? '').toLowerCase().includes('relation') ||
        (err?.message ?? '').toLowerCase().includes('does not exist');

      if (isTableMissing) {
        return [];
      }

      if (!isSchemaFallbackError(error)) {
        const message = extractErrorMessage(error);
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

      const limitedIds = projectIds.slice(0, 50);
      const { data: rows, error: legacyError } = await supabase
        .from('shopify_connections')
        .select('*')
        .in('project_id', limitedIds)
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
      if (!isSchemaFallbackError(error)) {
        const message = extractErrorMessage(error);
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

      const limitedIds = projectIds.slice(0, 50);
      const { data: rows, error: legacyError } = await supabase
        .from('shopify_connections')
        .select('*')
        .in('project_id', limitedIds)
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
   * Pass null to clear the theme_id.
   */
  async updateThemeId(
    connectionId: string,
    themeId: string | null
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
      if (!isSchemaFallbackError(error)) {
        if (isNoRowsError(error)) {
          return null;
        }
        const message = extractErrorMessage(error);
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

  /**
   * Store a Theme Kit Access password (shptka_*) for draft theme preview.
   * Propagates the password to ALL sibling connections for the same
   * user + store_domain so it persists regardless of which connection
   * row getActiveConnection resolves to on subsequent page loads.
   */
  async storeThemeAccessPassword(
    connectionId: string,
    password: string,
  ): Promise<void> {
    const supabase = adminSupabase();
    const encrypted = this.encrypt(password);
    const now = new Date().toISOString();

    const { error } = await supabase
      .from('shopify_connections')
      .update({
        theme_access_password_encrypted: encrypted,
        updated_at: now,
      })
      .eq('id', connectionId);

    if (error) {
      throw new APIError(
        `Failed to store theme access password: ${error.message}`,
        'TKA_PASSWORD_STORE_FAILED',
        500,
      );
    }

    // Propagate to sibling connections (same user + store) so the password
    // is found regardless of which connection row is resolved on next load.
    try {
      const { data: primary } = await supabase
        .from('shopify_connections')
        .select('user_id, store_domain')
        .eq('id', connectionId)
        .single();

      if (primary?.user_id && primary?.store_domain) {
        await supabase
          .from('shopify_connections')
          .update({ theme_access_password_encrypted: encrypted })
          .eq('user_id', primary.user_id)
          .eq('store_domain', primary.store_domain)
          .neq('id', connectionId);
      }
    } catch {
      // Best-effort propagation — primary save already succeeded
    }
  }

  /**
   * Retrieve and decrypt the Theme Kit Access password for a connection.
   * Falls back to sibling connections (same user + store_domain) when
   * the primary connection doesn't have a stored password.
   * Returns null if no password is found anywhere.
   */
  async getThemeAccessPassword(
    connectionId: string,
  ): Promise<string | null> {
    const supabase = adminSupabase();

    const { data, error } = await supabase
      .from('shopify_connections')
      .select('theme_access_password_encrypted, user_id, store_domain')
      .eq('id', connectionId)
      .single();

    if (error) return null;

    if (data?.theme_access_password_encrypted) {
      try {
        return this.decrypt(data.theme_access_password_encrypted);
      } catch {
        return null;
      }
    }

    // Fallback: check sibling connections for the same user + store
    if (data?.user_id && data?.store_domain) {
      try {
        const { data: siblings } = await supabase
          .from('shopify_connections')
          .select('id, theme_access_password_encrypted')
          .eq('user_id', data.user_id)
          .eq('store_domain', data.store_domain)
          .neq('id', connectionId)
          .not('theme_access_password_encrypted', 'is', null)
          .limit(1);

        const sibling = siblings?.[0];
        if (sibling?.theme_access_password_encrypted) {
          const password = this.decrypt(sibling.theme_access_password_encrypted);

          // Migrate to the primary connection so the fallback isn't needed next time
          await supabase
            .from('shopify_connections')
            .update({ theme_access_password_encrypted: sibling.theme_access_password_encrypted })
            .eq('id', connectionId);

          console.log(`[TKA] Migrated password from connection ${sibling.id} to ${connectionId}`);
          return password;
        }
      } catch {
        // Best-effort fallback
      }
    }

    return null;
  }

  /**
   * Clear the stored Theme Kit Access password for a connection.
   */
  async clearThemeAccessPassword(
    connectionId: string,
  ): Promise<void> {
    const supabase = adminSupabase();

    const { error } = await supabase
      .from('shopify_connections')
      .update({
        theme_access_password_encrypted: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', connectionId);

    if (error) {
      throw new APIError(
        `Failed to clear theme access password: ${error.message}`,
        'TKA_PASSWORD_CLEAR_FAILED',
        500,
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
