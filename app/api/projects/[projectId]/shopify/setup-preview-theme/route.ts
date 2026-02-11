import { NextRequest } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { createClient } from '@/lib/supabase/server';
import { ensureDevTheme } from '@/lib/shopify/theme-provisioning';
import { ThemeSyncService } from '@/lib/shopify/sync-service';
import {
  buildSnapshotForConnection,
  recordPush,
} from '@/lib/shopify/push-history';
import { ShopifyAdminAPIFactory } from '@/lib/shopify/admin-api-factory';
import { ShopifyTokenManager } from '@/lib/shopify/token-manager';

/** Admin client that bypasses RLS. Falls back to cookie-based client. */
async function adminSupabase() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey) {
    return createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey,
    );
  }
  return createClient();
}

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/**
 * POST /api/projects/[projectId]/shopify/setup-preview-theme
 * After import: ensure dev theme exists, mark theme_files pending, push to dev theme, record push history.
 * Resolves connection from user's active store (user-scoped).
 * Body: { note?: string }. Never pushes to main theme.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    const userId = await requireProjectAccess(request, projectId);

    const body = await request.json().catch(() => ({}));
    const note =
      typeof body.note === 'string' ? body.note : 'Preview after import';

    // Resolve connection from user's active store
    const tokenManager = new ShopifyTokenManager();
    const connection = await tokenManager.getActiveConnection(userId, { projectId });

    if (!connection) {
      throw APIError.notFound('No active Shopify store connection');
    }

    let themeId: string;
    try {
      themeId = await ensureDevTheme(connection.id, {
        themeName: note || undefined,
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Unknown error';
      throw new APIError(
        msg.includes('SHOPIFY_DEV_THEME') || msg.includes('zip')
          ? msg
          : `Preview theme could not be created: ${msg}`,
        'SETUP_ERROR',
        500
      );
    }

    const api = await ShopifyAdminAPIFactory.create(connection.id);
    const theme = await api.getTheme(Number(themeId)).catch(() => null);
    if (!theme) {
      throw APIError.notFound(
        'Preview theme no longer exists. Reconnect or set up preview again.'
      );
    }
    if (theme.role === 'main') {
      throw APIError.forbidden(
        'Cannot update the live theme. Only the preview theme can be changed.'
      );
    }

    const supabase = await adminSupabase();

    await supabase
      .from('theme_files')
      .update({ sync_status: 'pending' })
      .eq('connection_id', connection.id);

    const snapshot = await buildSnapshotForConnection(
      supabase,
      connection.id,
      projectId
    );

    const syncService = new ThemeSyncService();
    const result = await syncService.pushTheme(
      connection.id,
      Number(themeId),
      undefined,
      projectId
    );

    await recordPush(connection.id, themeId, snapshot, {
      note,
      trigger: 'import',
    });

    return successResponse({
      theme_id: themeId,
      pushed: result.pushed,
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
