import { NextRequest } from 'next/server';

import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { ShopifyTokenManager } from '@/lib/shopify/token-manager';
import { ShopifyAdminAPI } from '@/lib/shopify/admin-api';

/**
 * GET /api/stores
 * List all store connections for the authenticated user.
 * ?active=true returns only the active store.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const active = request.nextUrl.searchParams.get('active');
    const projectId = request.nextUrl.searchParams.get('projectId') ?? undefined;
    const tokenManager = new ShopifyTokenManager();

    if (active === 'true') {
      const connection = await tokenManager.getActiveConnection(userId, { projectId });
      return successResponse({
        connection: connection
          ? {
              id: connection.id,
              store_domain: connection.store_domain,
              theme_id: connection.theme_id,
              is_active: connection.is_active ?? true,
              sync_status: connection.sync_status,
              scopes: connection.scopes,
              last_sync_at: connection.last_sync_at,
              created_at: connection.created_at,
              updated_at: connection.updated_at,
            }
          : null,
      });
    }

    const connections = await tokenManager.listConnections(userId, { projectId });
    return successResponse(
      connections.map((c) => ({
        id: c.id,
        store_domain: c.store_domain,
        theme_id: c.theme_id,
        is_active: c.is_active ?? true,
        sync_status: c.sync_status,
        scopes: c.scopes,
        last_sync_at: c.last_sync_at,
        created_at: c.created_at,
        updated_at: c.updated_at,
      }))
    );
  } catch (error) {
    return handleAPIError(error);
  }
}

/**
 * POST /api/stores
 * Connect a new Shopify store (or reactivate existing) using Admin API token.
 * Body: { storeDomain, adminApiToken }
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);

    const body = await request.json().catch(() => ({}));
    const storeDomain = typeof body.storeDomain === 'string' ? body.storeDomain.trim() : '';
    const adminApiToken = typeof body.adminApiToken === 'string' ? body.adminApiToken.trim() : '';
    const projectId = typeof body.projectId === 'string' ? body.projectId.trim() : undefined;

    if (!storeDomain || !adminApiToken) {
      throw APIError.badRequest('storeDomain and adminApiToken are required');
    }

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

    const tokenManager = new ShopifyTokenManager();
    const connection = await tokenManager.storeConnection(
      userId,
      fullDomain,
      adminApiToken,
      ['read_themes', 'write_themes'],
      { projectId }
    );

    return successResponse({
      connected: true,
      connection: {
        id: connection.id,
        store_domain: connection.store_domain,
        theme_id: connection.theme_id,
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
 * PATCH /api/stores
 * Switch the active store for the user.
 * Body: { connectionId }
 */
export async function PATCH(request: NextRequest) {
  try {
    const userId = await requireAuth(request);

    const body = await request.json().catch(() => ({}));
    const connectionId = typeof body.connectionId === 'string' ? body.connectionId.trim() : '';
    const projectId = typeof body.projectId === 'string' ? body.projectId.trim() : undefined;

    if (!connectionId) {
      throw APIError.badRequest('connectionId is required');
    }

    const tokenManager = new ShopifyTokenManager();
    await tokenManager.activateStore(userId, connectionId, { projectId });

    const connection = await tokenManager.getActiveConnection(userId, { projectId });

    return successResponse({
      connection: connection
        ? {
            id: connection.id,
            store_domain: connection.store_domain,
            theme_id: connection.theme_id,
            is_active: connection.is_active,
            sync_status: connection.sync_status,
            scopes: connection.scopes,
            last_sync_at: connection.last_sync_at,
            created_at: connection.created_at,
            updated_at: connection.updated_at,
          }
        : null,
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
