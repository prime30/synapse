import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { getFile, updateFile, deleteFile } from '@/lib/services/files';
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
      const { data: connection } = await supabase
        .from('shopify_connections')
        .select('id, theme_id')
        .eq('project_id', projectId)
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
    const file = await updateFile(id, { name: body.name, path: body.name });
    return successResponse(file);
  } catch (error) {
    return handleAPIError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth(request);
    const { id } = await params;
    await deleteFile(id);
    return successResponse({ message: 'File deleted' });
  } catch (error) {
    return handleAPIError(error);
  }
}
