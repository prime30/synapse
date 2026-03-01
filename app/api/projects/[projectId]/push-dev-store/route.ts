import { NextRequest } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { ShopifyAdminAPIFactory } from '@/lib/shopify/admin-api-factory';
import { invalidatePreviewCache } from '@/lib/preview/preview-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

const CONCURRENCY = 5;

/**
 * POST /api/projects/[projectId]/push-dev-store
 * Push changed files from the project to the dev store's published theme.
 * Streams progress via SSE.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('preview_connection_id, preview_store_theme_id, last_dev_store_push_at')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      throw APIError.notFound('Project not found');
    }

    if (!project.preview_connection_id) {
      throw APIError.badRequest('No dev store connection configured for this project');
    }

    const themeId = Number(project.preview_store_theme_id);
    if (!Number.isFinite(themeId) || themeId <= 0) {
      throw APIError.badRequest('No valid dev store theme configured for this project');
    }

    let filesQuery = supabase
      .from('files')
      .select('path, content')
      .eq('project_id', projectId)
      .not('content', 'is', null);

    if (project.last_dev_store_push_at) {
      filesQuery = filesQuery.gt('updated_at', project.last_dev_store_push_at);
    }

    const { data: files, error: filesError } = await filesQuery;

    if (filesError) {
      throw APIError.internal(`Failed to query files: ${filesError.message}`);
    }

    if (!files || files.length === 0) {
      return Response.json({ pushed: 0, total: 0, errors: [], duration_ms: 0 });
    }

    const api = await ShopifyAdminAPIFactory.create(project.preview_connection_id);

    const fileList = files!;
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const startTime = Date.now();

        function send(data: object) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        }

        let pushed = 0;
        const errors: { path: string; error: string }[] = [];

        send({ type: 'start', total: fileList.length });

        async function pushFile(file: { path: string; content: string }) {
          try {
            await api.putAsset(themeId, file.path, file.content);
            pushed++;
            send({ type: 'progress', pushed, total: fileList.length, current: file.path });
          } catch (err) {
            errors.push({
              path: file.path,
              error: err instanceof Error ? err.message : String(err),
            });
            send({ type: 'error', path: file.path, error: err instanceof Error ? err.message : String(err) });
          }
        }

        for (let i = 0; i < fileList.length; i += CONCURRENCY) {
          const chunk = fileList.slice(i, i + CONCURRENCY);
          await Promise.all(chunk.map(pushFile));
        }

        await supabase
          .from('projects')
          .update({ last_dev_store_push_at: new Date().toISOString() })
          .eq('id', projectId);

        invalidatePreviewCache(projectId);

        const duration_ms = Date.now() - startTime;
        send({
          type: 'complete',
          pushed,
          errors,
          total: fileList.length,
          duration_ms,
        });

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
