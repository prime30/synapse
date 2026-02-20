/**
 * POST /api/internal/agent-dispatch
 *
 * Fast dispatch endpoint for agent execution jobs.
 * Called by:
 *   - Vercel Cron (every 1 minute) via /api/internal/cron
 *   - Self-invoked fetch from the stream route for immediate dispatch
 *
 * Protected by CRON_SECRET Bearer token.
 *
 * Picks up pending agent_execution jobs from background_tasks,
 * runs the coordinator, and updates job status.
 */

import { NextRequest, NextResponse } from 'next/server';
import { claimNextAgentJob, completeAgentJob, failAgentJob } from '@/lib/tasks/agent-job-queue';
import { AgentCoordinator } from '@/lib/agents/coordinator';
import { createServiceClient } from '@/lib/supabase/admin';
import { loadProjectFiles } from '@/lib/supabase/file-loader';

export const maxDuration = 300; // 5 minutes max for Vercel Pro

export async function POST(request: NextRequest) {
  // Verify CRON_SECRET
  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.replace('Bearer ', '');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && token !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const maxJobs = 3; // Process up to 3 jobs per invocation
  const results: Array<{ jobId: string; executionId: string; status: string }> = [];

  for (let i = 0; i < maxJobs; i++) {
    const job = await claimNextAgentJob();
    if (!job) break; // No more pending jobs

    try {
      const { executionId, projectId, userId, userRequest, options } = job.payload;

      // Load project files
      const serviceClient = createServiceClient();
      const { allFiles: fileContexts } = await loadProjectFiles(projectId, serviceClient);

      // Load user preferences
      const { data: preferences } = await serviceClient
        .from('user_preferences')
        .select('id, user_id, category, key, value, file_type, confidence, first_observed, last_reinforced, observation_count, metadata, created_at, updated_at')
        .eq('user_id', userId);

      // Run coordinator
      const coordinator = new AgentCoordinator();
      const result = await coordinator.execute(
        executionId,
        projectId,
        userId,
        userRequest,
        fileContexts,
        (preferences ?? []) as import('@/lib/types/agent').UserPreference[],
        {
          action: (options?.action as 'analyze' | 'generate' | 'review' | 'fix') ?? 'generate',
          model: options?.model as string | undefined,
        },
      );

      if (result.success) {
        await completeAgentJob(job.id);
        results.push({ jobId: job.id, executionId, status: 'completed' });
      } else {
        await failAgentJob(job.id, result.error?.message ?? 'Agent execution failed');
        results.push({ jobId: job.id, executionId, status: 'failed' });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await failAgentJob(job.id, message);
      results.push({ jobId: job.id, executionId: job.executionId, status: 'error' });
    }
  }

  return NextResponse.json({
    dispatched: results.length,
    results,
  });
}
