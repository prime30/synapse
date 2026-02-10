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

/**
 * GET /api/projects/[projectId]/shopify
 * Returns the Shopify connection status for the project.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const supabase = await adminSupabase();
    const { data: connection } = await supabase
      .from('shopify_connections')
      .select(
        'id, store_domain, theme_id, sync_status, scopes, last_sync_at, created_at, updated_at'
      )
      .eq('project_id', projectId)
      .maybeSingle();

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
      // Return connection as-is; theme_id may be null if provisioning failed (e.g. missing zip URL)
      if (!themeId && connection.theme_id) themeId = connection.theme_id;
    }

    return successResponse({
      connected: true,
      connection: {
        ...connection,
        theme_id: themeId ?? connection.theme_id,
      },
    });
  } catch (error) {
    return handleAPIError(error);
  }
}

/**
 * POST /api/projects/[projectId]/shopify
 * Manually connect a Shopify store using a store domain and Admin API access token.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

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

    // Store the connection (encrypted)
    const tokenManager = new ShopifyTokenManager();
    const connection = await tokenManager.storeConnection(
      projectId,
      fullDomain,
      adminApiToken,
      ['read_themes', 'write_themes']
    );

    // Provision a dev theme and persist theme_id
    let themeId: string | null = connection.theme_id ?? null;
    try {
      themeId = await ensureDevTheme(connection.id);
    } catch {
      // Connection is stored; theme_id may be set later via GET (e.g. once zip URL is configured)
    }

    return successResponse({
      connected: true,
      connection: {
        id: connection.id,
        store_domain: connection.store_domain,
        theme_id: themeId,
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
 * Disconnect the Shopify store from the project.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const supabase = await adminSupabase();
    const { data: connection } = await supabase
      .from('shopify_connections')
      .select('id')
      .eq('project_id', projectId)
      .maybeSingle();

    if (!connection) {
      throw APIError.notFound('No Shopify connection found for this project');
    }

    const tokenManager = new ShopifyTokenManager();
    await tokenManager.deleteConnection(connection.id);

    return successResponse({ disconnected: true });
  } catch (error) {
    return handleAPIError(error);
  }
}
