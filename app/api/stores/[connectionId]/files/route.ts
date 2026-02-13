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
 * GET /api/stores/[connectionId]/files
 * List CDN files for a Shopify store.
 * Query params: ?first=50&after=cursor
 * Returns: { files: ShopifyFile[], pageInfo: { hasNextPage, endCursor } }
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

    const firstParam = request.nextUrl.searchParams.get('first');
    const after = request.nextUrl.searchParams.get('after') ?? undefined;
    const first = firstParam ? parseInt(firstParam, 10) : 50;

    const api = await ShopifyAdminAPIFactory.create(connectionId);
    const result = await api.listFiles(first, after);

    return successResponse({ files: result.files, pageInfo: result.pageInfo });
  } catch (error) {
    return handleAPIError(error);
  }
}

/**
 * DELETE /api/stores/[connectionId]/files
 * Delete CDN files by IDs.
 * Body: { fileIds: string[] }
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
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

    const body = await request.json().catch(() => ({}));
    const fileIds = Array.isArray(body.fileIds) ? body.fileIds : [];

    if (fileIds.length === 0) {
      throw APIError.badRequest('fileIds array is required and must not be empty');
    }

    const api = await ShopifyAdminAPIFactory.create(connectionId);
    await api.deleteFiles(fileIds);

    return successResponse({ deleted: fileIds.length });
  } catch (error) {
    return handleAPIError(error);
  }
}
