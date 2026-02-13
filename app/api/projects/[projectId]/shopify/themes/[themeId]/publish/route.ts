import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { ShopifyAdminAPIFactory } from '@/lib/shopify/admin-api-factory';

interface RouteParams {
  params: Promise<{ projectId: string; themeId: string }>;
}

/**
 * POST /api/projects/[projectId]/shopify/themes/[themeId]/publish
 * Publish a theme to live (set role to main).
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(request);
    const { projectId, themeId } = await params;

    const api = await ShopifyAdminAPIFactory.fromProjectId(projectId, userId);
    const theme = await api.getTheme(Number(themeId));

    if (theme.role === 'main') {
      throw APIError.badRequest('Theme is already published as the live theme');
    }

    const themes = await api.listThemes();
    const liveTheme = themes.find((t) => t.role === 'main');

    await api.updateTheme(Number(themeId), { role: 'main' });

    return successResponse({
      published: true,
      previousLiveThemeId: liveTheme?.id ?? null,
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
