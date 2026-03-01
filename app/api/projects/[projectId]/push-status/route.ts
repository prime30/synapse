import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { getLastPushTimestamp, hasPendingPush } from '@/lib/shopify/push-queue';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/**
 * GET /api/projects/[projectId]/push-status
 * Returns the last push completion timestamp and whether a push is pending.
 * Reads from in-memory maps -- no DB query, designed for fast polling.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth(request);
    const { projectId } = await params;

    return successResponse({
      lastPushAt: getLastPushTimestamp(projectId),
      hasPendingPush: hasPendingPush(projectId),
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
