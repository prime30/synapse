import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { getExecution, persistExecution, updateExecutionStatus } from '@/lib/agents/execution-store';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth(request);
    const { id: executionId } = await params;

    const state = await getExecution(executionId);
    if (!state) {
      return successResponse({ dismissed: true });
    }

    updateExecutionStatus(executionId, 'failed');
    await persistExecution(executionId);

    return successResponse({ dismissed: true });
  } catch (error) {
    return handleAPIError(error);
  }
}
