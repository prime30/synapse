import { NextRequest } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { ThemeSyncService } from '@/lib/shopify/sync-service';
import { invalidatePreviewCache } from '../preview/route';
import {
  buildSnapshotForConnection,
  recordPush,
} from '@/lib/shopify/push-history';

export const maxDuration = 300; // Dev theme push can take minutes for large themes

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/**
 * POST /api/projects/[projectId]/sync-dev-theme
 * Pushes pending theme files to the Shopify dev theme and cleans up extra assets.
 * Called client-side after the user enters the IDE, so the import returns instantly.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Find connection and dev theme for this project
    // Try to select dev_theme_id; gracefully handle missing column (pre-migration-037)
    let projectData: { shopify_connection_id?: string; dev_theme_id?: string } | null = null;
    {
      const { data } = await supabase
        .from('projects')
        .select('shopify_connection_id, dev_theme_id')
        .eq('id', projectId)
        .single();
      if (data) {
        projectData = data;
      } else {
        // Column may not exist — retry without dev_theme_id
        const { data: fallback } = await supabase
          .from('projects')
          .select('shopify_connection_id')
          .eq('id', projectId)
          .single();
        projectData = fallback;
      }
    }

    if (!projectData?.shopify_connection_id) {
      return successResponse({ pushed: 0, errors: [] });
    }

    const connectionId = projectData.shopify_connection_id;

    // Per-project dev theme takes precedence; fall back to connection.theme_id
    let devThemeIdStr = projectData.dev_theme_id ?? null;
    if (!devThemeIdStr) {
      const { data: connection } = await supabase
        .from('shopify_connections')
        .select('theme_id')
        .eq('id', connectionId)
        .single();
      devThemeIdStr = connection?.theme_id ?? null;
    }

    if (!devThemeIdStr) {
      return successResponse({ pushed: 0, errors: ['No dev theme configured'] });
    }

    const devThemeId = Number(devThemeIdStr);

    // Check if there are any pending files to push
    const { count: pendingCount } = await supabase
      .from('theme_files')
      .select('id', { count: 'exact', head: true })
      .eq('connection_id', connectionId)
      .eq('sync_status', 'pending');

    if (!pendingCount || pendingCount === 0) {
      return successResponse({ pushed: 0, errors: [] });
    }

    const syncService = new ThemeSyncService();

    // Push pending files to dev theme
    const pushResult = await syncService.pushTheme(
      connectionId,
      devThemeId,
      undefined,
      projectId
    );

    // Clean up extra files on the dev theme (e.g. Dawn scaffold leftovers)
    if (pushResult.pushed > 0) {
      const { data: allThemeFiles } = await supabase
        .from('theme_files')
        .select('file_path')
        .eq('connection_id', connectionId);
      const importedPaths = new Set(
        (allThemeFiles ?? []).map((f: { file_path: string }) => f.file_path)
      );
      if (importedPaths.size > 0) {
        await syncService.cleanupExtraAssets(
          connectionId,
          devThemeId,
          importedPaths
        );
      }
    }

    // Record push history and update sync_status to 'connected'
    if (pushResult.pushed > 0) {
      // Dev theme now has files — connection is fully working
      await supabase
        .from('shopify_connections')
        .update({ sync_status: 'connected', updated_at: new Date().toISOString() })
        .eq('id', connectionId);

      // Bust the preview cache so next iframe load fetches fresh content
      invalidatePreviewCache(projectId);

      try {
        const snapshot = await buildSnapshotForConnection(
          supabase,
          connectionId,
          projectId
        );
        if (snapshot.files.length) {
          await recordPush(
            connectionId,
            String(devThemeId),
            snapshot,
            { note: 'Post-import sync', trigger: 'import' }
          );
        }
      } catch {
        // Push history recording is non-critical
      }
    }

    return successResponse({
      pushed: pushResult.pushed,
      errors: pushResult.errors,
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
