import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { ShopifyTokenManager } from '@/lib/shopify/token-manager';
import { ShopifyAdminAPIFactory } from '@/lib/shopify/admin-api-factory';

interface RouteParams {
  params: Promise<{ projectId: string; themeId: string }>;
}

/**
 * DELETE /api/projects/[projectId]/shopify/themes/[themeId]
 * Delete a Shopify theme (cannot delete the live/main theme).
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(request);
    const { projectId, themeId } = await params;

    const tokenManager = new ShopifyTokenManager();
    const connection = await tokenManager.getActiveConnection(userId, {
      projectId,
    });

    if (!connection) {
      throw APIError.notFound('No active Shopify store connection for this project');
    }

    const api = await ShopifyAdminAPIFactory.create(connection.id);
    const theme = await api.getTheme(Number(themeId));

    if (theme.role === 'main') {
      throw APIError.forbidden('Cannot delete the live theme');
    }

    await api.deleteTheme(Number(themeId));

    if (connection.theme_id === themeId) {
      await tokenManager.updateThemeId(connection.id, null);
    }

    return successResponse({
      deleted: true,
      clearedConnection: connection.theme_id === themeId,
    });
  } catch (error) {
    return handleAPIError(error);
  }
}

/**
 * PATCH /api/projects/[projectId]/shopify/themes/[themeId]
 * Rename a Shopify theme.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(request);
    const { projectId, themeId } = await params;

    const body = await request.json();
    const name = typeof body?.name === 'string' ? body.name.trim() : '';

    if (!name) {
      throw APIError.badRequest('Name is required and must be a non-empty string');
    }

    const tokenManager = new ShopifyTokenManager();
    const connection = await tokenManager.getActiveConnection(userId, {
      projectId,
    });

    if (!connection) {
      throw APIError.notFound('No active Shopify store connection for this project');
    }

    const api = await ShopifyAdminAPIFactory.create(connection.id);
    const updatedTheme = await api.updateTheme(Number(themeId), { name });

    return successResponse({ theme: updatedTheme });
  } catch (error) {
    return handleAPIError(error);
  }
}
