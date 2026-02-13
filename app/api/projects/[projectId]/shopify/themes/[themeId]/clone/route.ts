import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { ShopifyAdminAPIFactory } from '@/lib/shopify/admin-api-factory';

interface RouteParams {
  params: Promise<{ projectId: string; themeId: string }>;
}

const CONCURRENCY_LIMIT = 10;

/**
 * POST /api/projects/[projectId]/shopify/themes/[themeId]/clone
 * Clone a Shopify theme by copying all assets to a new unpublished theme.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(request);

    const body = await request.json().catch(() => ({}));
    const name = typeof body?.name === 'string' ? body.name.trim() : '';

    if (!name) {
      throw APIError.badRequest('Name is required and must be a non-empty string');
    }

    const { projectId, themeId } = await params;
    const api = await ShopifyAdminAPIFactory.fromProjectId(projectId, userId);

    const assets = await api.listAssets(Number(themeId));
    const newTheme = await api.createTheme(name, undefined, 'unpublished');

    const errors: string[] = [];
    let successCount = 0;

    for (let i = 0; i < assets.length; i += CONCURRENCY_LIMIT) {
      const batch = assets.slice(i, i + CONCURRENCY_LIMIT);
      const results = await Promise.allSettled(
        batch.map(async (asset) => {
          try {
            const assetData = await api.getAsset(Number(themeId), asset.key);
            const value = assetData.value ?? '';
            if (value) {
              await api.putAsset(newTheme.id, asset.key, value);
              return { success: true };
            }
            return { success: false, skip: true };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            throw new Error(`${asset.key}: ${msg}`);
          }
        })
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          if (result.value.success) {
            successCount++;
          }
        } else {
          errors.push(result.reason?.message ?? String(result.reason));
        }
      }
    }

    return successResponse({
      theme: newTheme,
      copied: successCount,
      errors,
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
