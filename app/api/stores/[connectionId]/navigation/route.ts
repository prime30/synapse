import { NextRequest } from 'next/server';

import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { ShopifyTokenManager } from '@/lib/shopify/token-manager';
import { ShopifyAdminAPIFactory } from '@/lib/shopify/admin-api-factory';

interface RouteParams {
  params: Promise<{ connectionId: string }>;
}

/**
 * GET /api/stores/[connectionId]/navigation
 * List navigation menus for a Shopify store.
 * Returns: { menus: ShopifyMenu[] }
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(request);
    const { connectionId } = await params;

    const tokenManager = new ShopifyTokenManager();
    const connection = await tokenManager.getConnectionById(connectionId);
    if (!connection) {
      throw APIError.notFound('Store connection not found');
    }
    const ownerMatch =
      connection.user_id === userId ||
      (!connection.user_id && connection.project_id);
    if (!ownerMatch) {
      throw APIError.notFound('Store connection not found');
    }

    const api = await ShopifyAdminAPIFactory.create(connectionId);
    const menus = await api.listMenus();

    return successResponse({ menus });
  } catch (error) {
    return handleAPIError(error);
  }
}
