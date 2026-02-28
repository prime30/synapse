import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { createReadClient } from '@/lib/supabase/server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/agents/executions/[id]/status
 *
 * Lightweight poll endpoint for background agent task status.
 * Returns the current status of the background_task row for a given execution.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth(request);
    const { id: executionId } = await params;
    const supabase = await createReadClient();

    const { data } = await supabase
      .from('background_tasks')
      .select('id, status, error, completed_at')
      .eq('task_name', 'agent_execution')
      .eq('payload->>executionId', executionId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!data) {
      return successResponse({ status: 'not_found' });
    }

    return successResponse({
      status: data.status,
      error: data.error ?? null,
      completedAt: data.completed_at ?? null,
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
