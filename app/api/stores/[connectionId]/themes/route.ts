import { NextRequest } from 'next/server';

import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { ShopifyAdminAPIFactory } from '@/lib/shopify/admin-api-factory';
import { ShopifyTokenManager } from '@/lib/shopify/token-manager';

interface RouteParams {
  params: Promise<{ connectionId: string }>;
}

/**
 * GET /api/stores/[connectionId]/themes
 * List all themes from the connected Shopify store.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(request);
    const { connectionId } = await params;

    // Verify the connection belongs to this user
    const tokenManager = new ShopifyTokenManager();
    const connection = await tokenManager.getConnectionById(connectionId);
    if (!connection || connection.user_id !== userId) {
      throw APIError.notFound('Store connection not found');
    }

    const api = await ShopifyAdminAPIFactory.create(connectionId);
    const themes = await api.listThemes();

    return successResponse(themes);
  } catch (error) {
    return handleAPIError(error);
  }
}
