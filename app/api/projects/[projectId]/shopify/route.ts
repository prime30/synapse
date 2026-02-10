import { NextRequest } from 'next/server';

import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { createClient } from '@/lib/supabase/server';
import { ShopifyTokenManager } from '@/lib/shopify/token-manager';
import { ShopifyAdminAPI } from '@/lib/shopify/admin-api';

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

    const supabase = await createClient();
    const { data: connection } = await supabase
      .from('shopify_connections')
      .select(
        'id, store_domain, sync_status, scopes, last_sync_at, created_at, updated_at'
      )
      .eq('project_id', projectId)
      .maybeSingle();

    return successResponse({
      connected: !!connection,
      connection: connection ?? null,
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

    return successResponse({
      connected: true,
      connection: {
        id: connection.id,
        store_domain: connection.store_domain,
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

    const supabase = await createClient();
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
