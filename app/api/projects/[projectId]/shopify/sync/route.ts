import { NextRequest } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { ThemeSyncService } from '@/lib/shopify/sync-service';
import { ShopifyAdminAPIFactory } from '@/lib/shopify/admin-api-factory';
import { ShopifyTokenManager } from '@/lib/shopify/token-manager';
import {
  buildSnapshotForConnection,
  recordPush,
} from '@/lib/shopify/push-history';

function getAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey) {
    return createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceKey,
    );
  }
  throw new Error('SUPABASE_SERVICE_ROLE_KEY required for Shopify operations');
}

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/**
 * POST /api/projects/[projectId]/shopify/sync
 * Pull or push theme files between the project and the connected Shopify store.
 * Uses the user's active store connection (user-scoped).
 * Body: { action: 'pull' | 'push', themeId?: number, note?: string }.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    const userId = await requireProjectAccess(request, projectId);

    const body = await request.json().catch(() => ({}));
    const { action, themeId: bodyThemeId, note: bodyNote } = body;

    if (!action || !['pull', 'push'].includes(action)) {
      throw APIError.badRequest('action must be "pull" or "push"');
    }

    // Resolve connection from user's active store
    const tokenManager = new ShopifyTokenManager();
    const connection = await tokenManager.getActiveConnection(userId, { projectId });

    if (!connection) {
      throw APIError.notFound('No active Shopify store connection. Connect a store first.');
    }

    const themeId =
      action === 'push'
        ? connection.theme_id
          ? Number(connection.theme_id)
          : null
        : typeof bodyThemeId === 'number' && Number.isFinite(bodyThemeId)
          ? bodyThemeId
          : connection.theme_id
            ? Number(connection.theme_id)
            : null;

    if (themeId === null || !Number.isFinite(themeId)) {
      throw APIError.badRequest(
        action === 'push'
          ? 'No preview theme set. Set up preview or connect first.'
          : 'themeId is required (or connect and provision a dev theme first)'
      );
    }

    if (action === 'push') {
      const api = await ShopifyAdminAPIFactory.create(connection.id);
      const theme = await api.getTheme(themeId).catch(() => null);
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
    }

    const supabase = getAdminClient();

    // Update status to 'syncing' while in progress
    await supabase
      .from('shopify_connections')
      .update({ sync_status: 'syncing' })
      .eq('id', connection.id);

    let snapshotBeforePush: Awaited<
      ReturnType<typeof buildSnapshotForConnection>
    > | null = null;
    if (action === 'push') {
      snapshotBeforePush = await buildSnapshotForConnection(
        supabase,
        connection.id,
        projectId
      );
    }

    const syncService = new ThemeSyncService();
    const result =
      action === 'pull'
        ? await syncService.pullTheme(connection.id, themeId, projectId)
        : await syncService.pushTheme(connection.id, themeId, undefined, projectId);

    if (action === 'push' && result.pushed > 0 && snapshotBeforePush?.files.length) {
      await recordPush(connection.id, String(themeId), snapshotBeforePush, {
        note: typeof bodyNote === 'string' ? bodyNote : null,
        trigger: 'manual',
      });
    }

    // Update last_sync_at and reset status
    await supabase
      .from('shopify_connections')
      .update({
        last_sync_at: new Date().toISOString(),
        sync_status: result.errors.length > 0 ? 'error' : 'connected',
      })
      .eq('id', connection.id);

    return successResponse(result);
  } catch (error) {
    return handleAPIError(error);
  }
}
