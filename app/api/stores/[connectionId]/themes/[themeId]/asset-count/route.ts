import { NextRequest } from 'next/server';

import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { ShopifyAdminAPIFactory } from '@/lib/shopify/admin-api-factory';
import { ShopifyTokenManager } from '@/lib/shopify/token-manager';

/** Text-like extensions mirrored from ThemeSyncService.shouldFetchAssetValue */
const TEXT_EXTENSIONS = [
  '.liquid', '.json', '.js', '.css', '.scss', '.sass', '.less',
  '.ts', '.tsx', '.mjs', '.cjs', '.txt', '.md', '.svg', '.map',
];
function isTextAsset(key: string): boolean {
  const lower = key.toLowerCase();
  return TEXT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

interface RouteParams {
  params: Promise<{ connectionId: string; themeId: string }>;
}

/**
 * GET /api/stores/[connectionId]/themes/[themeId]/asset-count
 * Returns asset counts: total, text, and binary.
 * The import progress bar uses `text` as its denominator for the fast phase.
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
    const assets = await api.listAssets(numericThemeId);

    const text = assets.filter((a) => isTextAsset(a.key)).length;
    const binary = assets.length - text;

    return successResponse({ total: assets.length, text, binary });
  } catch (error) {
    return handleAPIError(error);
  }
}
