import { NextRequest } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { createClient } from '@/lib/supabase/server';
import { ShopifyTokenManager } from '@/lib/shopify/token-manager';
import { ShopifyAdminAPI } from '@/lib/shopify/admin-api';
import { ensureDevTheme } from '@/lib/shopify/theme-provisioning';

/** Admin client that bypasses RLS. Falls back to cookie-based client. */
async function adminSupabase() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey) {
    return createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey,
    );
  }
  return createClient();
}

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

function isMissingIsActiveColumn(error: unknown): boolean {
  const err = error as { code?: string; message?: string };
  const message = (err?.message ?? '').toLowerCase();
  return (
    err?.code === 'PGRST204' ||
    err?.code === '42703' ||
    (message.includes('is_active') &&
      (message.includes('column') || message.includes('schema cache')))
  );
}

/**
 * GET /api/projects/[projectId]/shopify
 * Returns the Shopify connection status for the project.
 * Resolves from the user's active store connection (user-scoped).
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    const userId = await requireProjectAccess(request, projectId);

    const tokenManager = new ShopifyTokenManager();
    const connection = await tokenManager.getActiveConnection(userId, { projectId });

    if (!connection) {
      return successResponse({
        connected: false,
        connection: null,
      });
    }

    // Guarantee a dev theme exists and is persisted (provision or reuse)
    let themeId = connection.theme_id;
    try {
      themeId = await ensureDevTheme(connection.id);
    } catch {
      // Return connection as-is; theme_id may be null if provisioning failed
      if (!themeId && connection.theme_id) themeId = connection.theme_id;
    }

    return successResponse({
      connected: true,
      connection: {
        id: connection.id,
        store_domain: connection.store_domain,
        theme_id: themeId ?? connection.theme_id,
        is_active: connection.is_active,
        sync_status: connection.sync_status,
        scopes: connection.scopes,
        last_sync_at: connection.last_sync_at,
        created_at: connection.created_at,
        updated_at: connection.updated_at,
      },
    });
  } catch (error) {
    return handleAPIError(error);
  }
}

/**
 * POST /api/projects/[projectId]/shopify
 * Connect a Shopify store using Admin API token (user-scoped, auto-activates).
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    const userId = await requireProjectAccess(request, projectId);

    const body = await request.json().catch(() => ({}));
    const storeDomain = typeof body.storeDomain === 'string' ? body.storeDomain.trim() : '';
    const adminApiToken = typeof body.adminApiToken === 'string' ? body.adminApiToken.trim() : '';

    if (!storeDomain || !adminApiToken) {
      throw APIError.badRequest('storeDomain and adminApiToken are required');
    }

    // Normalize domain
    const fullDomain = storeDomain.includes('.myshopify.com')
      ? storeDomain
      : `${storeDomain}.myshopify.com`;

    // Validate credentials by attempting to list themes
    const testApi = new ShopifyAdminAPI(fullDomain, adminApiToken);
    try {
      await testApi.listThemes();
    } catch {
      throw APIError.badRequest(
        'Could not connect to Shopify. Please check your store domain and Admin API token.'
      );
    }

    // Store the connection (user-scoped, encrypted, auto-activates)
    const tokenManager = new ShopifyTokenManager();
    const connection = await tokenManager.storeConnection(
      userId,
      fullDomain,
      adminApiToken,
      ['read_themes', 'write_themes'],
      { projectId }
    );

    // Link the project to this connection
    const supabase = await adminSupabase();
    await supabase
      .from('projects')
      .update({ shopify_connection_id: connection.id })
      .eq('id', projectId);

    // Provision a dev theme and persist theme_id
    let themeId: string | null = connection.theme_id ?? null;
    try {
      themeId = await ensureDevTheme(connection.id);
    } catch {
      // Connection is stored; theme_id may be set later
    }

    return successResponse({
      connected: true,
      connection: {
        id: connection.id,
        store_domain: connection.store_domain,
        theme_id: themeId,
        is_active: connection.is_active,
        sync_status: connection.sync_status,
        scopes: connection.scopes,
        last_sync_at: connection.last_sync_at,
        created_at: connection.created_at,
        updated_at: connection.updated_at,
      },
    });
  } catch (error) {
    return handleAPIError(error);
  }
}

/**
 * DELETE /api/projects/[projectId]/shopify
 * Deactivate the store connection (preserves projects).
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    const userId = await requireProjectAccess(request, projectId);

    const tokenManager = new ShopifyTokenManager();
    const connection = await tokenManager.getActiveConnection(userId, { projectId });

    if (!connection) {
      throw APIError.notFound('No active Shopify connection found');
    }

    // Deactivate (don't delete — preserves projects linked to this store)
    await tokenManager.updateSyncStatus(connection.id, 'disconnected');

    // Clear the active flag
    const supabase = await adminSupabase();
    const { error: deactivateError } = await supabase
      .from('shopify_connections')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', connection.id);
    if (deactivateError && !isMissingIsActiveColumn(deactivateError)) {
      throw new APIError(
        `Failed to disconnect Shopify store: ${deactivateError.message}`,
        'DISCONNECT_FAILED',
        500
      );
    }

    return successResponse({ disconnected: true });
  } catch (error) {
    return handleAPIError(error);
  }
}
