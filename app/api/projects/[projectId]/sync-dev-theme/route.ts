import { NextRequest } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { ThemeSyncService } from '@/lib/shopify/sync-service';
import { invalidatePreviewCache } from '@/lib/preview/preview-cache';
import {
  buildSnapshotForConnection,
  recordPush,
} from '@/lib/shopify/push-history';
import { ensureDevTheme } from '@/lib/shopify/theme-provisioning';

export const maxDuration = 300; // Dev theme push can take minutes for large themes

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/**
 * POST /api/projects/[projectId]/sync-dev-theme
 * Self-healing push: ensures a dev theme exists, marks files pending if the
 * background import task didn't finish, then pushes to Shopify.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // ── 1. Load project data (connection, dev theme, source theme) ──────
    let projectData: {
      shopify_connection_id?: string;
      dev_theme_id?: string;
      shopify_theme_id?: string;
    } | null = null;
    {
      const { data } = await supabase
        .from('projects')
        .select('shopify_connection_id, dev_theme_id, shopify_theme_id')
        .eq('id', projectId)
        .single();
      if (data) {
        projectData = data;
      } else {
        const { data: fallback } = await supabase
          .from('projects')
          .select('shopify_connection_id')
          .eq('id', projectId)
          .single();
        projectData = fallback;
      }
    }

    if (!projectData?.shopify_connection_id) {
      console.log(`[sync-dev-theme] EXIT: no shopify_connection_id for project ${projectId}`);
      return successResponse({ pushed: 0, errors: ['No Shopify connection for this project'] });
    }

    const connectionId = projectData.shopify_connection_id;
    console.log(
      `[sync-dev-theme] project=${projectId} connection=${connectionId} ` +
      `dev_theme_id=${projectData.dev_theme_id ?? 'null'} shopify_theme_id=${projectData.shopify_theme_id ?? 'null'}`,
    );

    // ── 2. Resolve or create dev theme (self-healing) ───────────────────
    let devThemeIdStr = projectData.dev_theme_id ?? null;

    if (!devThemeIdStr) {
      const { data: connection } = await supabase
        .from('shopify_connections')
        .select('theme_id')
        .eq('id', connectionId)
        .single();
      devThemeIdStr = connection?.theme_id ?? null;
      console.log(`[sync-dev-theme] Fallback to connection.theme_id=${devThemeIdStr ?? 'null'}`);
    }

    if (!devThemeIdStr) {
      // Background ensureDevTheme never completed — create one now.
      const sourceThemeId = projectData.shopify_theme_id
        ? Number(projectData.shopify_theme_id)
        : undefined;

      console.log(
        `[sync-dev-theme] No dev theme found for project ${projectId}, creating one (source: ${sourceThemeId ?? 'ZIP seed'})`,
      );

      try {
        devThemeIdStr = await ensureDevTheme(connectionId, {
          sourceThemeId: sourceThemeId && Number.isFinite(sourceThemeId)
            ? sourceThemeId
            : undefined,
        });

        // Persist the dev theme on the project row
        try {
          await supabase
            .from('projects')
            .update({ dev_theme_id: devThemeIdStr })
            .eq('id', projectId);
        } catch {
          // Column may not exist yet
        }
      } catch (err) {
        console.error('[sync-dev-theme] Failed to create dev theme:', err);
        return successResponse({
          pushed: 0,
          errors: [`Could not create dev theme: ${err instanceof Error ? err.message : 'unknown'}`],
        });
      }
    }

    const devThemeId = Number(devThemeIdStr);

    // Verify the theme actually exists on Shopify
    try {
      const { ShopifyAdminAPIFactory } = await import('@/lib/shopify/admin-api-factory');
      const api = await ShopifyAdminAPIFactory.create(connectionId);
      const theme = await api.getTheme(devThemeId);
      console.log(
        `[sync-dev-theme] Dev theme ${devThemeId} exists on Shopify: name="${theme.name}" role="${theme.role}"`,
      );
    } catch (verifyErr) {
      console.warn(
        `[sync-dev-theme] Dev theme ${devThemeId} NOT FOUND on Shopify — stale ID, recreating`,
        verifyErr instanceof Error ? verifyErr.message : verifyErr,
      );
      // Theme was deleted or doesn't exist — clear it and recreate
      const sourceThemeId = projectData.shopify_theme_id
        ? Number(projectData.shopify_theme_id)
        : undefined;
      try {
        devThemeIdStr = await ensureDevTheme(connectionId, {
          sourceThemeId: sourceThemeId && Number.isFinite(sourceThemeId)
            ? sourceThemeId
            : undefined,
        });
        try {
          await supabase
            .from('projects')
            .update({ dev_theme_id: devThemeIdStr })
            .eq('id', projectId);
        } catch {
          // Column may not exist yet
        }
        // Mark files as pending since new theme needs all files
        await supabase
          .from('theme_files')
          .update({ sync_status: 'pending' })
          .eq('connection_id', connectionId)
          .neq('sync_status', 'binary_pending');
        // Reset connection status so the push actually runs
        await supabase
          .from('shopify_connections')
          .update({ sync_status: 'pending', updated_at: new Date().toISOString() })
          .eq('id', connectionId);
        console.log(`[sync-dev-theme] Recreated dev theme as ${devThemeIdStr}`);
      } catch (recreateErr) {
        console.error('[sync-dev-theme] Failed to recreate dev theme:', recreateErr);
        return successResponse({
          pushed: 0,
          errors: [`Dev theme was deleted and could not be recreated: ${recreateErr instanceof Error ? recreateErr.message : 'unknown'}`],
        });
      }
    }

    const resolvedDevThemeId = Number(devThemeIdStr);
    console.log(`[sync-dev-theme] Using dev theme ${resolvedDevThemeId}`);

    // ── 3. Verify the dev theme actually has files on Shopify ───────────
    // themeDuplicate copies all files; the empty-theme fallback does not.
    // If the theme is empty, we must push regardless of local sync_status.
    let themeIsEmpty = false;
    try {
      const { ShopifyAdminAPIFactory: ApiFactory } = await import('@/lib/shopify/admin-api-factory');
      const api = await ApiFactory.create(connectionId);
      const assets = await api.listAssets(resolvedDevThemeId);
      const templateCount = assets.filter(a => a.key.startsWith('templates/')).length;
      console.log(`[sync-dev-theme] Dev theme has ${assets.length} assets (${templateCount} templates)`);
      themeIsEmpty = templateCount < 2;
    } catch (assetErr) {
      console.warn('[sync-dev-theme] Could not list dev theme assets, assuming empty:', assetErr instanceof Error ? assetErr.message : assetErr);
      themeIsEmpty = true;
    }

    // ── 4. Ensure files are marked pending ──────────────────────────────
    const { count: pendingCount } = await supabase
      .from('theme_files')
      .select('id', { count: 'exact', head: true })
      .eq('connection_id', connectionId)
      .eq('sync_status', 'pending');

    const { count: totalThemeFiles } = await supabase
      .from('theme_files')
      .select('id', { count: 'exact', head: true })
      .eq('connection_id', connectionId);

    console.log(
      `[sync-dev-theme] theme_files: ${totalThemeFiles ?? 0} total, ${pendingCount ?? 0} pending, themeIsEmpty=${themeIsEmpty}`,
    );

    if (!pendingCount || pendingCount === 0) {
      if (themeIsEmpty) {
        // Theme exists but has no files — force a full push
        console.log('[sync-dev-theme] Theme is empty on Shopify, promoting all files to pending');
        const { count: promoted } = await supabase
          .from('theme_files')
          .update({ sync_status: 'pending' }, { count: 'exact' })
          .eq('connection_id', connectionId)
          .in('sync_status', ['synced', 'error']);
        console.log(`[sync-dev-theme] Promoted ${promoted ?? 0} files to pending (empty theme)`);

        if (!promoted || promoted === 0) {
          console.log('[sync-dev-theme] EXIT: no files to promote for empty theme');
          return successResponse({ pushed: 0, errors: ['No files available to push'] });
        }

        // Reset connection status so push runs
        await supabase
          .from('shopify_connections')
          .update({ sync_status: 'pending', updated_at: new Date().toISOString() })
          .eq('id', connectionId);
      } else {
        const { data: connStatus } = await supabase
          .from('shopify_connections')
          .select('sync_status')
          .eq('id', connectionId)
          .single();

        console.log(`[sync-dev-theme] Connection sync_status=${connStatus?.sync_status ?? 'null'}`);

        if (connStatus?.sync_status !== 'connected') {
          const { count: promoted } = await supabase
            .from('theme_files')
            .update({ sync_status: 'pending' }, { count: 'exact' })
            .eq('connection_id', connectionId)
            .eq('sync_status', 'synced');

          console.log(
            `[sync-dev-theme] Promoted ${promoted ?? 0} synced files to pending`,
          );

          if (!promoted || promoted === 0) {
            console.log(`[sync-dev-theme] EXIT: no files to promote or push`);
            return successResponse({ pushed: 0, errors: ['No files available to push'] });
          }
        } else {
          console.log(`[sync-dev-theme] EXIT: already connected, 0 pending — dev theme is up to date`);
          return successResponse({ pushed: 0, errors: [] });
        }
      }
    }

    // ── 5. Push ─────────────────────────────────────────────────────────
    const syncService = new ThemeSyncService();

    const pushResult = await syncService.pushTheme(
      connectionId,
      resolvedDevThemeId,
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
          resolvedDevThemeId,
          importedPaths
        );
      }
    }

    // ── 6. Finalize ─────────────────────────────────────────────────────
    if (pushResult.pushed > 0) {
      await supabase
        .from('shopify_connections')
        .update({ sync_status: 'connected', updated_at: new Date().toISOString() })
        .eq('id', connectionId);

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
            String(resolvedDevThemeId),
            snapshot,
            { note: 'Post-import sync', trigger: 'import' }
          );
        }
      } catch {
        // Push history recording is non-critical
      }
    }

    console.log(
      `[sync-dev-theme] DONE: pushed=${pushResult.pushed} errors=${pushResult.errors.length}`,
    );
    return successResponse({
      pushed: pushResult.pushed,
      errors: pushResult.errors,
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
