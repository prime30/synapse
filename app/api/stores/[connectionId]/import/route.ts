import { NextRequest } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { ShopifyTokenManager } from '@/lib/shopify/token-manager';
import { ShopifyAdminAPIFactory } from '@/lib/shopify/admin-api-factory';
import { ThemeSyncService } from '@/lib/shopify/sync-service';
import { ensureDevTheme } from '@/lib/shopify/theme-provisioning';
import {
  isLocalSyncEnabled,
  resolveProjectSlug,
  writeAllFilesToDisk,
  getLocalThemePath,
} from '@/lib/sync/disk-sync';

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
  params: Promise<{ connectionId: string }>;
}

/**
 * POST /api/stores/[connectionId]/import
 * Import a Shopify theme: auto-creates a project, pulls files, optionally sets up preview.
 * Body: { themeId: number, themeName?: string, createDevThemeForPreview?: boolean, note?: string }
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(request);
    const { connectionId } = await params;

    // Verify connection belongs to user
    const tokenManager = new ShopifyTokenManager();
    const connection = await tokenManager.getConnectionById(connectionId);
    if (!connection) {
      throw APIError.notFound('Store connection not found');
    }
    const ownerMatch =
      connection.user_id === userId ||
      // Legacy connections may have no user_id; verify via project owner
      (!connection.user_id && connection.project_id);
    if (!ownerMatch) {
      throw APIError.notFound('Store connection not found');
    }

    const body = await request.json().catch(() => ({}));
    const themeId = typeof body.themeId === 'number' ? body.themeId : null;
    const themeName = typeof body.themeName === 'string' ? body.themeName.trim() : null;
    const createDevThemeForPreview = body.createDevThemeForPreview !== false;
    const syncToLocal = body.syncToLocal === true;
    const note = typeof body.note === 'string' ? body.note.trim() : 'Import from store';
    // Optional client-generated projectId for progress polling
    const clientProjectId =
      typeof body.projectId === 'string' && body.projectId.length > 0
        ? body.projectId
        : undefined;

    if (!themeId || !Number.isFinite(themeId)) {
      throw APIError.badRequest('themeId (number) is required');
    }

    const supabase = getAdminClient();

    // Resolve the theme name from Shopify if not provided
    let resolvedThemeName = themeName;
    if (!resolvedThemeName) {
      try {
        const api = await ShopifyAdminAPIFactory.create(connectionId);
        const theme = await api.getTheme(themeId);
        resolvedThemeName = theme.name;
      } catch {
        resolvedThemeName = `Theme ${themeId}`;
      }
    }

    // 1. Get user's org to create the project in
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', userId)
      .limit(1)
      .single();

    if (!membership) {
      throw APIError.badRequest('User has no organization. Create one first.');
    }

    // 2. Auto-create a project named after the theme
    //    If the client provided a projectId, use it so polling can start immediately.
    const projectInsert: Record<string, unknown> = {
      name: resolvedThemeName,
      description: `Imported from ${connection.store_domain}`,
      organization_id: membership.organization_id,
      owner_id: userId,
      shopify_connection_id: connectionId,
      shopify_theme_id: String(themeId),
      shopify_theme_name: resolvedThemeName,
      shopify_store_url: `https://${connection.store_domain}`,
    };
    if (clientProjectId) {
      projectInsert.id = clientProjectId;
    }
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .insert(projectInsert)
      .select('id, name')
      .single();

    if (projectError || !project) {
      throw new APIError(
        `Failed to create project: ${projectError?.message ?? 'Unknown error'}`,
        'PROJECT_CREATE_FAILED',
        500
      );
    }

    // 3. Pull theme files; optionally start dev theme creation in background (don't block response).
    const syncService = new ThemeSyncService();
    const result = await syncService.pullTheme(connectionId, themeId, project.id, { textOnly: true });

    // 3b. Write files to local disk if requested (non-blocking).
    let localPath: string | null = null;
    if (syncToLocal && isLocalSyncEnabled()) {
      (async () => {
        try {
          const { data: textFiles } = await supabase
            .from('files')
            .select('path, content')
            .eq('project_id', project.id)
            .not('content', 'is', null);

          const diskFiles = (textFiles ?? [])
            .filter((f: { path: string | null; content: string | null }) =>
              f.path && typeof f.content === 'string' && f.content.length > 0,
            )
            .map((f: { path: string; content: string }) => ({
              path: f.path,
              content: f.content,
            }));

          if (diskFiles.length > 0) {
            const slug = await resolveProjectSlug(project.id);
            await writeAllFilesToDisk(slug, project.id, diskFiles);
            console.log(`[Import] Wrote ${diskFiles.length} files to local disk for project ${project.id}`);

            // Start file watcher so local edits flow back
            try {
              const { startFileWatcher } = await import('@/lib/sync/file-watcher');
              startFileWatcher();
            } catch { /* chokidar may not be available */ }

            // Fire-and-forget: build theme intelligence map
            try {
              const { triggerThemeMapIndexing } = await import('@/lib/agents/theme-map');
              triggerThemeMapIndexing(project.id, diskFiles);
            } catch { /* non-fatal */ }
          }
        } catch (err) {
          console.warn('[Import] Local disk sync failed:', err);
        }
      })();

      // Resolve the local path for the response (even if write is still in progress)
      try {
        const slug = await resolveProjectSlug(project.id);
        localPath = getLocalThemePath(slug);
      } catch { /* non-critical */ }
    }

    // 3c. Fire-and-forget theme map indexing (runs for ALL imports, not just local sync).
    (async () => {
      try {
        const { data: mapFiles } = await supabase
          .from('files')
          .select('id, path, content, file_type')
          .eq('project_id', project.id)
          .not('content', 'is', null);

        const indexableFiles = (mapFiles ?? [])
          .filter((f: { path: string | null; content: string | null }) =>
            f.path && typeof f.content === 'string' && f.content.length > 0,
          )
          .map((f: { id: string; path: string; content: string; file_type?: string }) => ({
            path: f.path,
            content: f.content,
            fileId: f.id,
            fileType: f.file_type,
          }));

        if (indexableFiles.length > 0) {
          const { triggerThemeMapIndexing } = await import('@/lib/agents/theme-map');
          triggerThemeMapIndexing(project.id, indexableFiles);
          console.log(`[Import] Theme map indexing triggered for ${indexableFiles.length} files (project ${project.id})`);
        }
      } catch (err) {
        console.warn('[Import] Theme map indexing trigger failed:', err);
      }
    })();

    // 3d. Fire-and-forget design token ingestion in the background.
    (async () => {
      try {
        const { data: projectFiles } = await supabase
          .from('files')
          .select('id, path, content')
          .eq('project_id', project.id);

        if (projectFiles && projectFiles.length > 0) {
          const ingestionFiles = projectFiles
            .filter((f: { content: string | null }) => typeof f.content === 'string' && f.content.length > 0)
            .map((f: { id: string; path: string; content: string }) => ({
              id: f.id,
              path: f.path,
              content: f.content,
            }));

          if (ingestionFiles.length > 0) {
            const { ingestTheme } = await import(
              '@/lib/design-tokens/components/theme-ingestion'
            );
            const ingestionResult = await ingestTheme(project.id, ingestionFiles);
            console.log(
              `[Theme Ingestion] Project ${project.id}: ${ingestionResult.tokensCreated} tokens created, ` +
              `${ingestionResult.componentsDetected} components detected from ${ingestionResult.totalFilesAnalyzed} files.`,
            );
          }
        }
      } catch (err) {
        console.warn('[Theme Ingestion] Failed for store import:', err);
      }
    })();

    // 3d. Defer dev theme creation so the response returns as soon as pull is done.
    //     Attach dev theme to project and mark theme_files pending when ready (background).
    if (createDevThemeForPreview) {
      (async () => {
        try {
          const previewThemeId = await ensureDevTheme(connectionId, {
            themeName: note || undefined,
            sourceThemeId: themeId,
          });
          if (previewThemeId) {
            try {
              await supabase
                .from('projects')
                .update({ dev_theme_id: previewThemeId })
                .eq('id', project.id);
            } catch {
              // Column may not exist yet
            }
            await supabase
              .from('theme_files')
              .update({ sync_status: 'pending' })
              .eq('connection_id', connectionId)
              .neq('sync_status', 'binary_pending');
          }
        } catch {
          // Dev theme is optional; preview falls back to source theme
        }
      })();
    }

    // 4. Update last_sync_at and back-link the project_id on the connection
    await supabase
      .from('shopify_connections')
      .update({
        last_sync_at: new Date().toISOString(),
        sync_status: 'connected' as const,
        project_id: project.id,
      })
      .eq('id', connectionId);

    return successResponse({
      projectId: project.id,
      projectName: project.name,
      pulled: result.pulled,
      pushed: 0,
      errors: result.errors,
      conflicts: result.conflicts,
      previewThemeId: null, // Attached in background when dev theme is ready; IDE uses source theme until then
      binaryPending: result.binaryPending ?? 0,
      localPath,
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
