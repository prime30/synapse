import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

import { requireProjectAccess } from '@/lib/middleware/auth';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { ShopifyTokenManager } from '@/lib/shopify/token-manager';
import { ShopifyAdminAPI } from '@/lib/shopify/admin-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

function adminSupabase() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * POST /api/projects/[projectId]/dev-store
 * Connect a secondary Shopify dev store for preview rendering.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { projectId } = await params;
    const userId = await requireProjectAccess(request, projectId);

    const body = await request.json().catch(() => ({}));
    const storeDomain = typeof body.storeDomain === 'string' ? body.storeDomain.trim() : '';
    const adminApiToken = typeof body.adminApiToken === 'string' ? body.adminApiToken.trim() : '';
    const tkaPassword = typeof body.tkaPassword === 'string' ? body.tkaPassword.trim() : '';

    if (!storeDomain || !adminApiToken) {
      throw APIError.badRequest('storeDomain and adminApiToken are required');
    }

    const fullDomain = storeDomain.includes('.myshopify.com')
      ? storeDomain
      : `${storeDomain}.myshopify.com`;

    const testApi = new ShopifyAdminAPI(fullDomain, adminApiToken);
    let themes;
    try {
      themes = await testApi.listThemes();
    } catch {
      throw APIError.badRequest(
        'Could not connect to Shopify. Please check your store domain and Admin API token.',
      );
    }

    const tokenManager = new ShopifyTokenManager();
    const connection = await tokenManager.storeConnection(
      userId,
      fullDomain,
      adminApiToken,
      ['read_themes', 'write_themes'],
    );

    const publishedTheme = themes.find((t) => t.role === 'main');
    if (!publishedTheme) {
      throw APIError.notFound('No published (main) theme found on the dev store');
    }

    const supabase = adminSupabase();
    const { error: updateError } = await supabase
      .from('projects')
      .update({
        preview_connection_id: connection.id,
        preview_store_theme_id: String(publishedTheme.id),
      })
      .eq('id', projectId);

    if (updateError) {
      throw new APIError(
        `Failed to update project: ${updateError.message}`,
        'PROJECT_UPDATE_FAILED',
        500,
      );
    }

    if (tkaPassword) {
      await tokenManager.storeThemeAccessPassword(connection.id, tkaPassword);
    }

    return NextResponse.json({
      connected: true,
      connectionId: connection.id,
      storeDomain: fullDomain,
      theme: {
        id: publishedTheme.id,
        name: publishedTheme.name,
        role: publishedTheme.role,
      },
    });
  } catch (error) {
    return handleAPIError(error);
  }
}

/**
 * GET /api/projects/[projectId]/dev-store
 * Return the dev store connection status and pending file count.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const supabase = adminSupabase();
    const { data: project, error: projError } = await supabase
      .from('projects')
      .select('preview_connection_id, preview_store_theme_id, last_dev_store_push_at')
      .eq('id', projectId)
      .single();

    if (projError || !project) {
      throw APIError.notFound('Project not found');
    }

    if (!project.preview_connection_id) {
      return NextResponse.json({ connected: false });
    }

    const tokenManager = new ShopifyTokenManager();
    const conn = await tokenManager.getConnectionById(project.preview_connection_id);
    const storeDomain = conn?.store_domain ?? null;

    let themeName: string | null = null;
    const themeId = project.preview_store_theme_id ?? null;

    if (conn && themeId) {
      try {
        const token = await tokenManager.getDecryptedToken(conn.id);
        const api = new ShopifyAdminAPI(conn.store_domain, token);
        const theme = await api.getTheme(Number(themeId));
        themeName = theme.name;
      } catch {
        // Non-critical — theme name is cosmetic
      }
    }

    let pendingFileCount = 0;
    const lastPushAt = project.last_dev_store_push_at ?? null;

    if (lastPushAt) {
      const { count } = await supabase
        .from('files')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .gt('updated_at', lastPushAt);
      pendingFileCount = count ?? 0;
    } else {
      const { count } = await supabase
        .from('files')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId);
      pendingFileCount = count ?? 0;
    }

    return NextResponse.json({
      connected: true,
      storeDomain,
      themeName,
      themeId,
      lastPushAt,
      pendingFileCount,
    });
  } catch (error) {
    return handleAPIError(error);
  }
}

/**
 * DELETE /api/projects/[projectId]/dev-store
 * Disconnect the secondary dev store from this project.
 */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const supabase = adminSupabase();
    const { error: updateError } = await supabase
      .from('projects')
      .update({
        preview_connection_id: null,
        preview_store_theme_id: null,
        last_dev_store_push_at: null,
      })
      .eq('id', projectId);

    if (updateError) {
      throw new APIError(
        `Failed to update project: ${updateError.message}`,
        'PROJECT_UPDATE_FAILED',
        500,
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleAPIError(error);
  }
}
