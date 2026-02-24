import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { getExecution, getScreenshots, persistExecution, updateExecutionStatus } from '@/lib/agents/execution-store';
import type { CodeChange } from '@/lib/types/agent';
import { updateFile } from '@/lib/services/files';
import { invalidateFileContent } from '@/lib/supabase/file-loader';
import { runPushForProject } from '@/lib/shopify/push-queue';
import { createClient } from '@/lib/supabase/server';

const bodySchema = z.object({
  projectId: z.string().uuid(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function captureAfterScreenshot(executionId: string, projectId: string): Promise<string | undefined> {
  try {
    const supabase = await createClient();
    const { data: project } = await supabase
      .from('projects')
      .select('shopify_connection_id, dev_theme_id')
      .eq('id', projectId)
      .maybeSingle();
    if (!project?.shopify_connection_id) return undefined;

    const { data: connection } = await supabase
      .from('shopify_connections')
      .select('id, theme_id, store_domain')
      .eq('id', project.shopify_connection_id)
      .maybeSingle();
    if (!connection?.store_domain || !connection.theme_id) return undefined;

    const themeId = String(project.dev_theme_id ?? connection.theme_id);
    const { generateThumbnail } = await import('@/lib/thumbnail/generator');
    const buffer = await generateThumbnail(connection.store_domain, themeId);
    if (!buffer) return undefined;

    const { createClient: createStorageClient } = await import('@supabase/supabase-js');
    const storage = createStorageClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const path = `screenshots/${executionId}-after.jpg`;
    await storage.storage.from('project-files').upload(path, buffer, {
      contentType: 'image/jpeg',
      upsert: true,
    });
    const { data: urlData } = storage.storage.from('project-files').getPublicUrl(path);
    return urlData?.publicUrl ?? undefined;
  } catch {
    return undefined;
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(request);
    const { id: executionId } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) throw APIError.badRequest('Invalid request body');
    const { projectId } = parsed.data;

    const state = await getExecution(executionId);
    if (!state) throw APIError.notFound('Execution not found or expired');
    if (state.projectId !== projectId) throw APIError.forbidden('Project mismatch');

    const allChanges: CodeChange[] = [];
    for (const changes of state.proposedChanges.values()) {
      allChanges.push(...changes);
    }

    if (allChanges.length === 0) {
      throw APIError.badRequest('No pending changes to approve');
    }

    const supabase = await createClient();
    let appliedCount = 0;

    // Look up connection once for theme_files upserts
    const { data: project } = await supabase
      .from('projects')
      .select('shopify_connection_id')
      .eq('id', projectId)
      .maybeSingle();

    for (const change of allChanges) {
      if (!change.fileId || !change.proposedContent) continue;

      try {
        await updateFile(change.fileId, { content: change.proposedContent, userId });
        invalidateFileContent(change.fileId);
        appliedCount++;

        if (project?.shopify_connection_id && change.fileName) {
          const now = new Date().toISOString();
          await supabase
            .from('theme_files')
            .upsert(
              {
                connection_id: project.shopify_connection_id,
                file_path: change.fileName,
                sync_status: 'pending',
                created_at: now,
                updated_at: now,
              },
              { onConflict: 'connection_id,file_path' },
            );
        }
      } catch (err) {
        console.error(`[approve] Failed to apply change to ${change.fileName}:`, err);
      }
    }

    // Await the push directly so the after screenshot captures the new state
    await runPushForProject(projectId);

    // Capture after screenshot (best-effort, add ~2s delay for CDN propagation)
    await new Promise((r) => setTimeout(r, 2000));
    const afterScreenshotUrl = await captureAfterScreenshot(executionId, projectId);

    // Retrieve before screenshot from Redis
    const screenshots = await getScreenshots(executionId);

    updateExecutionStatus(executionId, 'completed');
    await persistExecution(executionId);

    return successResponse({
      appliedCount,
      total: allChanges.length,
      beforeScreenshotUrl: screenshots.beforeUrl ?? null,
      afterScreenshotUrl: afterScreenshotUrl ?? null,
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
