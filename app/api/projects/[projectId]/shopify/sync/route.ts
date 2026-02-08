import { NextRequest } from 'next/server';

import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { createClient } from '@/lib/supabase/server';
import { ThemeSyncService } from '@/lib/shopify/sync-service';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/**
 * POST /api/projects/[projectId]/shopify/sync
 * Pull or push theme files between the project and the connected Shopify store.
 * Body: { action: 'pull' | 'push', themeId: number }
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const body = await request.json();
    const { action, themeId } = body;

    if (!action || !['pull', 'push'].includes(action)) {
      throw APIError.badRequest('action must be "pull" or "push"');
    }
    if (typeof themeId !== 'number' || !Number.isFinite(themeId)) {
      throw APIError.badRequest('themeId must be a number');
    }

    // Retrieve the connection for this project
    const supabase = await createClient();
    const { data: connection } = await supabase
      .from('shopify_connections')
      .select('id')
      .eq('project_id', projectId)
      .maybeSingle();

    if (!connection) {
      throw APIError.notFound('No Shopify connection found for this project');
    }

    // Update status to 'syncing' while in progress
    await supabase
      .from('shopify_connections')
      .update({ sync_status: 'syncing' })
      .eq('id', connection.id);

    const syncService = new ThemeSyncService();
    const result =
      action === 'pull'
        ? await syncService.pullTheme(connection.id, themeId)
        : await syncService.pushTheme(connection.id, themeId);

    // Update last_sync_at and reset status to 'connected'
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
