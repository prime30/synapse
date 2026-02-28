import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { getExecution, getScreenshots, persistExecution, updateExecutionStatus } from '@/lib/agents/execution-store';
import type { CodeChange } from '@/lib/types/agent';
import { updateFile } from '@/lib/services/files';
import { invalidateFileContent } from '@/lib/supabase/file-loader';
import { schedulePushForProject } from '@/lib/shopify/push-queue';
import { createClient } from '@/lib/supabase/server';

const bodySchema = z.object({
  projectId: z.string().uuid(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
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
    let allChanges: CodeChange[] = [];

    if (state) {
      if (state.projectId !== projectId) throw APIError.forbidden('Project mismatch');
      for (const changes of state.proposedChanges.values()) {
        allChanges.push(...changes);
      }
    } else {
      // Fallback for persisted executions (Redis state already flushed).
      const supabase = await createClient();
      const { data: row } = await supabase
        .from('agent_executions')
        .select('project_id, user_id, proposed_changes')
        .eq('id', executionId)
        .maybeSingle();
      if (!row) throw APIError.notFound('Execution not found');
      if (row.project_id !== projectId) throw APIError.forbidden('Project mismatch');
      if (row.user_id !== userId) throw APIError.forbidden('Execution ownership mismatch');
      allChanges = (row.proposed_changes as CodeChange[] | null) ?? [];
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

    // Queue push asynchronously to keep approve fast and avoid UI hangs.
    schedulePushForProject(projectId);

    // Retrieve before screenshot from Redis (best-effort).
    const screenshots = await getScreenshots(executionId).catch(() => ({} as { beforeUrl?: string }));

    if (state) {
      updateExecutionStatus(executionId, 'completed');
      await persistExecution(executionId);
    }

    return successResponse({
      appliedCount,
      total: allChanges.length,
      beforeScreenshotUrl: screenshots.beforeUrl ?? null,
      afterScreenshotUrl: null,
      pushScheduled: appliedCount > 0,
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
