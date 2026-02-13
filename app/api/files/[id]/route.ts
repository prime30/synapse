import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { getFile, updateFile, deleteFile } from '@/lib/services/files';
import {
  resolveProjectSlug,
  writeFileToDisk,
  deleteFileFromDisk,
  renameFileOnDisk,
  isLocalSyncEnabled,
} from '@/lib/sync/disk-sync';
import type { UpdateFileRequest } from '@/lib/types/files';
import { APIError } from '@/lib/errors/handler';
import { createClient } from '@/lib/supabase/server';
import { schedulePushForProject } from '@/lib/shopify/push-queue';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const file = await getFile(id);
    return successResponse(file);
  } catch (error) {
    return handleAPIError(error);
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const body = (await request.json()) as UpdateFileRequest;
    if (body.name !== undefined) {
      throw APIError.badRequest('Use PATCH for rename; PUT is for content updates only');
    }
    const file = await updateFile(id, { content: body.content });

    let shopifyPushQueued = false;
    const projectId = file.project_id as string;
    if (projectId) {
      const supabase = await createClient();

      // Store-first: look up connection via project's shopify_connection_id
      const { data: project } = await supabase
        .from('projects')
        .select('shopify_connection_id')
        .eq('id', projectId)
        .maybeSingle();

      if (project?.shopify_connection_id) {
        const { data: connection } = await supabase
          .from('shopify_connections')
          .select('id, theme_id')
          .eq('id', project.shopify_connection_id)
          .maybeSingle();

        if (connection?.theme_id && file.path) {
          const now = new Date().toISOString();
          await supabase
            .from('theme_files')
            .upsert(
              {
                connection_id: connection.id,
                file_path: file.path,
                sync_status: 'pending',
                created_at: now,
                updated_at: now,
              },
              { onConflict: 'connection_id,file_path' }
            );
          schedulePushForProject(projectId);
          shopifyPushQueued = true;
        }
      }
    }

    // Fire-and-forget: sync to local disk
    if (isLocalSyncEnabled() && projectId && file.path && body.content != null) {
      const path = file.path;
      const content = body.content;
      resolveProjectSlug(projectId).then((slug) => {
        if (slug) writeFileToDisk(slug, path, content);
      }).catch(() => {});
    }

    return successResponse({
      ...file,
      ...(shopifyPushQueued && {
        shopifyPushQueued: true,
        project_id: projectId,
      }),
    });
  } catch (error) {
    return handleAPIError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const body = (await request.json()) as UpdateFileRequest;
    if (!body.name) {
      throw APIError.badRequest('PATCH requires name for rename');
    }

    // Capture old path for disk rename
    let oldPath: string | null = null;
    if (isLocalSyncEnabled()) {
      try {
        const existing = await getFile(id);
        oldPath = existing?.path ?? null;
      } catch { /* non-critical */ }
    }

    const file = await updateFile(id, { name: body.name, path: body.name });

    // Fire-and-forget: rename on disk
    if (isLocalSyncEnabled() && file.project_id && oldPath && file.path) {
      resolveProjectSlug(file.project_id as string).then((slug) =>
        renameFileOnDisk(slug, oldPath!, file.path, file.content ?? ''),
      ).catch(() => {});
    }

    return successResponse(file);
  } catch (error) {
    return handleAPIError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth(request);
    const { id } = await params;

    // Capture file info before deletion for disk sync
    let fileInfo: { project_id?: string; path?: string } | null = null;
    if (isLocalSyncEnabled()) {
      try {
        fileInfo = await getFile(id);
      } catch { /* non-critical */ }
    }

    await deleteFile(id);

    // Fire-and-forget: delete from disk
    if (fileInfo?.project_id && fileInfo?.path) {
      resolveProjectSlug(fileInfo.project_id).then((slug) =>
        deleteFileFromDisk(slug, fileInfo!.path!),
      ).catch(() => {});
    }

    return successResponse({ message: 'File deleted' });
  } catch (error) {
    return handleAPIError(error);
  }
}
