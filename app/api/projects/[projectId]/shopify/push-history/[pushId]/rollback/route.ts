import { NextRequest } from 'next/server';

import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { rollbackToPush } from '@/lib/shopify/push-history';

interface RouteParams {
  params: Promise<{ projectId: string; pushId: string }>;
}

/**
 * POST /api/projects/[projectId]/shopify/push-history/[pushId]/rollback
 * Restore the preview theme to the state of the given push. Returns { restored, errors? }.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, pushId } = await params;
    await requireProjectAccess(request, projectId);

    if (!pushId) {
      throw APIError.badRequest('pushId is required');
    }

    const result = await rollbackToPush(pushId, projectId);
    return successResponse(result);
  } catch (error) {
    return handleAPIError(error);
  }
}
