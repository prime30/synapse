import { NextRequest } from 'next/server';

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

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/**
 * POST /api/projects/[projectId]/shopify/setup-preview-theme
 * After import: ensure dev theme exists, mark theme_files pending, push to dev theme, record push history.
 * Body: { note?: string }. Never pushes to main theme.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const body = await request.json().catch(() => ({}));
    const note =
      typeof body.note === 'string' ? body.note : 'Preview after import';

    const supabase = await createClient();
    const { data: connection, error: connError } = await supabase
      .from('shopify_connections')
      .select('id, theme_id')
      .eq('project_id', projectId)
      .maybeSingle();

    if (connError || !connection) {
      throw APIError.notFound('No Shopify connection found for this project');
    }

    let themeId: string;
    try {
      themeId = await ensureDevTheme(connection.id);
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
      Number(themeId)
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
