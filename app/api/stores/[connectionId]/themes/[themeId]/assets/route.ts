import { NextRequest } from 'next/server';

import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { ShopifyAdminAPIFactory } from '@/lib/shopify/admin-api-factory';
import { ShopifyTokenManager } from '@/lib/shopify/token-manager';

interface RouteParams {
  params: Promise<{ connectionId: string; themeId: string }>;
}

/**
 * GET /api/stores/[connectionId]/themes/[themeId]/assets
 * List all assets in the theme's `assets/` folder (images, CSS, JS, fonts, etc.).
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(request);
    const { connectionId, themeId } = await params;

    const numericThemeId = Number(themeId);
    if (!Number.isFinite(numericThemeId)) {
      throw APIError.badRequest('themeId must be a number');
    }

    // Verify the connection belongs to this user
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
    const allAssets = await api.listAssets(numericThemeId);

    // Filter to only assets/ folder items (images, fonts, CSS, JS static files)
    const assets = allAssets.filter((a) => a.key.startsWith('assets/'));

    return successResponse(assets);
  } catch (error) {
    return handleAPIError(error);
  }
}

/**
 * POST /api/stores/[connectionId]/themes/[themeId]/assets
 * Upload or create an asset.
 * Body: { key: string, value: string }
 * - `key` must start with "assets/" (e.g. "assets/custom.css")
 * - `value` is base64-encoded for binary files or raw text for text files
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(request);
    const { connectionId, themeId } = await params;

    const numericThemeId = Number(themeId);
    if (!Number.isFinite(numericThemeId)) {
      throw APIError.badRequest('themeId must be a number');
    }

    // Verify the connection belongs to this user
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

    const body = await request.json();
    const { key, value } = body as { key?: string; value?: string };

    if (!key || typeof key !== 'string') {
      throw APIError.badRequest('key is required and must be a string');
    }
    if (!key.startsWith('assets/')) {
      throw APIError.badRequest('key must start with "assets/"');
    }
    if (value === undefined || value === null || typeof value !== 'string') {
      throw APIError.badRequest('value is required and must be a string');
    }

    const api = await ShopifyAdminAPIFactory.create(connectionId);
    const asset = await api.putAsset(numericThemeId, key, value);

    return successResponse(asset, 201);
  } catch (error) {
    return handleAPIError(error);
  }
}

/**
 * DELETE /api/stores/[connectionId]/themes/[themeId]/assets?key=assets/file.css
 * Delete an asset by key.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(request);
    const { connectionId, themeId } = await params;

    const numericThemeId = Number(themeId);
    if (!Number.isFinite(numericThemeId)) {
      throw APIError.badRequest('themeId must be a number');
    }

    // Verify the connection belongs to this user
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

    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (!key || typeof key !== 'string') {
      throw APIError.badRequest('key query parameter is required');
    }
    if (!key.startsWith('assets/')) {
      throw APIError.badRequest('key must start with "assets/"');
    }

    const api = await ShopifyAdminAPIFactory.create(connectionId);
    await api.deleteAsset(numericThemeId, key);

    return successResponse({ deleted: true });
  } catch (error) {
    return handleAPIError(error);
  }
}
