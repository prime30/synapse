import { NextRequest } from 'next/server';

import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { ShopifyAdminAPIFactory } from '@/lib/shopify/admin-api-factory';
import { ShopifyTokenManager } from '@/lib/shopify/token-manager';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/**
 * GET /api/projects/[projectId]/shopify/themes
 * List all themes from the user's active Shopify store.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    const userId = await requireProjectAccess(request, projectId);

    const tokenManager = new ShopifyTokenManager();
    const connection = await tokenManager.getActiveConnection(userId);

    if (!connection) {
      throw APIError.notFound('No active Shopify store connection');
    }

    const api = await ShopifyAdminAPIFactory.create(connection.id);
    const themes = await api.listThemes();

    return successResponse(themes);
  } catch (error) {
    return handleAPIError(error);
  }
}
