import { NextRequest } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import {
  isLocalSyncEnabled,
  resolveProjectSlug,
  writeAllFilesToDisk,
  getLocalThemePath,
} from '@/lib/sync/disk-sync';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/**
 * POST /api/projects/[projectId]/sync-to-disk
 *
 * Pulls all text files from Supabase and writes them to the local
 * .synapse-themes/{slug}/ directory. Starts the file watcher if not
 * already running. Returns the local path and file count.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    if (!isLocalSyncEnabled()) {
      return successResponse({
        enabled: false,
        localPath: null,
        fileCount: 0,
      });
    }

    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Fetch all text files for the project (skip binary/storage-only files)
    const { data: files, error } = await supabase
      .from('files')
      .select('id, name, path, file_type, content')
      .eq('project_id', projectId)
      .not('content', 'is', null);

    if (error) {
      console.warn('[sync-to-disk] Failed to fetch files:', error.message);
      return successResponse({ enabled: true, localPath: null, fileCount: 0 });
    }

    const validFiles = (files ?? []).filter(
      (f: { path: string | null; content: string | null }) =>
        f.path && typeof f.content === 'string' && f.content.length > 0,
    );

    if (validFiles.length === 0) {
      return successResponse({ enabled: true, localPath: null, fileCount: 0 });
    }

    const textFiles = validFiles.map((f: { path: string; content: string }) => ({
      path: f.path,
      content: f.content,
    }));

    // Resolve slug and write files to .synapse-themes/
    const slug = await resolveProjectSlug(projectId);
    await writeAllFilesToDisk(slug, projectId, textFiles);

    // Also populate .cache/themes/ so agents read locally instead of hitting Supabase
    try {
      const { cacheThemeFiles } = await import('@/lib/cache/local-file-cache');
      cacheThemeFiles(
        projectId,
        validFiles.map((f: { id: string; name: string; path: string; file_type: string; content: string }) => ({
          fileId: f.id,
          fileName: f.name,
          path: f.path,
          fileType: f.file_type,
          content: f.content,
        })),
      );
    } catch (cacheErr) {
      console.warn('[sync-to-disk] Agent cache population failed (non-fatal):', cacheErr);
    }

    // Start the file watcher if it isn't already running
    try {
      const { startFileWatcher } = await import('@/lib/sync/file-watcher');
      startFileWatcher();
    } catch (err) {
      console.warn('[sync-to-disk] Failed to start file watcher:', err);
    }

    // Fire-and-forget: build theme intelligence map (Grok 4 indexes all files once)
    try {
      const { triggerThemeMapIndexing } = await import('@/lib/agents/theme-map');
      const mapFiles = validFiles.map((f: { id: string; name: string; path: string; file_type: string; content: string }) => ({
        path: f.path,
        content: f.content,
        fileId: f.id,
        fileName: f.name,
        fileType: f.file_type,
      }));
      triggerThemeMapIndexing(projectId, mapFiles);
    } catch (err) {
      console.warn('[sync-to-disk] Theme map indexing trigger failed (non-fatal):', err);
    }

    const localPath = getLocalThemePath(slug);

    return successResponse({
      enabled: true,
      localPath,
      fileCount: textFiles.length,
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
