import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { createClient as createAuthClient } from '@/lib/supabase/server';
import { NextRequest } from 'next/server';

// ── Types ─────────────────────────────────────────────────────────────────

export interface StoreTokenOptions {
  userId: string;
  projectId: string;
  accessToken: string;
  refreshToken?: string;
  scope?: string;
  expiresAt?: string;
  githubUsername?: string;
}

export interface GitHubToken {
  accessToken: string;
  refreshToken?: string;
  scope?: string;
  expiresAt?: string;
  githubUsername?: string;
}

// ── Service role client ───────────────────────────────────────────────────

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'createServiceClient requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

// ── Token encryption (same pattern as Shopify) ──────────────────────────────

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const explicit = process.env.GITHUB_ENCRYPTION_KEY;
  if (explicit) {
    return Buffer.from(explicit, 'hex');
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey) {
    return crypto.createHash('sha256').update(serviceKey).digest();
  }

  throw new Error(
    'Either GITHUB_ENCRYPTION_KEY or SUPABASE_SERVICE_ROLE_KEY must be set'
  );
}

function encryptToken(text: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

function decryptToken(encrypted: string): string {
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

// ── Expiry check ──────────────────────────────────────────────────────────

function isExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false;
  try {
    return new Date(expiresAt).getTime() <= Date.now();
  } catch {
    return false;
  }
}

// ── API ───────────────────────────────────────────────────────────────────

/**
 * Store a GitHub OAuth token for a user and project.
 * Upserts into github_tokens table with encrypted access_token and refresh_token.
 */
export async function storeToken(options: StoreTokenOptions): Promise<void> {
  const supabase = createServiceClient();

  const row = {
    user_id: options.userId,
    project_id: options.projectId,
    access_token: encryptToken(options.accessToken),
    refresh_token: options.refreshToken
      ? encryptToken(options.refreshToken)
      : null,
    scope: options.scope ?? null,
    expires_at: options.expiresAt ?? null,
    github_username: options.githubUsername ?? null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('github_tokens').upsert(row, {
    onConflict: 'user_id,project_id',
  });

  if (error) {
    throw new Error(`Failed to store GitHub token: ${error.message}`);
  }
}

/**
 * Get a GitHub token for a user and project.
 * Returns null if no token exists.
 * If the token is expired and a refresh token exists, attempts to refresh and updates storage.
 */
export async function getToken(
  userId: string,
  projectId: string
): Promise<GitHubToken | null> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('github_tokens')
    .select('access_token, refresh_token, scope, expires_at, github_username')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to get GitHub token: ${error.message}`);
  }

  if (!data) return null;

  const accessToken = decryptToken(data.access_token);
  const refreshToken = data.refresh_token
    ? decryptToken(data.refresh_token)
    : undefined;

  const token: GitHubToken = {
    accessToken,
    refreshToken,
    scope: data.scope ?? undefined,
    expiresAt: data.expires_at ?? undefined,
    githubUsername: data.github_username ?? undefined,
  };

  if (isExpired(data.expires_at) && refreshToken) {
    try {
      const refreshed = await refreshAccessToken(refreshToken);
      await storeToken({
        userId,
        projectId,
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        expiresAt: refreshed.expiresAt,
        scope: token.scope,
        githubUsername: token.githubUsername,
      });
      return {
        ...token,
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        expiresAt: refreshed.expiresAt,
      };
    } catch {
      return null;
    }
  }

  return token;
}

/**
 * Delete a GitHub token for a user and project.
 */
export async function deleteToken(
  userId: string,
  projectId: string
): Promise<void> {
  const supabase = createServiceClient();

  const { error } = await supabase
    .from('github_tokens')
    .delete()
    .eq('user_id', userId)
    .eq('project_id', projectId);

  if (error) {
    throw new Error(`Failed to delete GitHub token: ${error.message}`);
  }
}

/**
 * Refresh a GitHub OAuth access token using a refresh token.
 * POST https://github.com/login/oauth/access_token
 * Requires GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET env vars.
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<{ accessToken: string; refreshToken?: string; expiresAt?: string }> {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      'GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are required for token refresh'
    );
  }

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!res.ok) {
    throw new Error(
      `GitHub token refresh failed: ${res.status} ${res.statusText}`
    );
  }

  const body = await res.json();

  if (body.error) {
    throw new Error(
      `GitHub token refresh error: ${body.error_description ?? body.error}`
    );
  }

  const accessToken = body.access_token;
  if (!accessToken) {
    throw new Error('GitHub token refresh did not return access_token');
  }

  let expiresAt: string | undefined;
  if (typeof body.expires_in === 'number') {
    expiresAt = new Date(Date.now() + body.expires_in * 1000).toISOString();
  }

  return {
    accessToken,
    refreshToken: body.refresh_token,
    expiresAt,
  };
}

/**
 * Helper that extracts userId from the request auth, then calls getToken.
 * Returns the access_token string or null.
 * Uses createClient from @/lib/supabase/server (reads auth from request cookies via next/headers).
 */
export async function getTokenForRequest(
  _request: NextRequest,
  projectId: string
): Promise<string | null> {
  const supabase = await createAuthClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.id) {
    return null;
  }

  const token = await getToken(user.id, projectId);
  return token?.accessToken ?? null;
}
