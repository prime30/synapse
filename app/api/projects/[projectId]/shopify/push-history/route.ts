import { NextRequest } from 'next/server';

import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { listPushHistory } from '@/lib/shopify/push-history';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/**
 * GET /api/projects/[projectId]/shopify/push-history
 * List recent push history for the project's Shopify connection (no snapshot body).
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const list = await listPushHistory(projectId, 25);
    return successResponse(list);
  } catch (error) {
    return handleAPIError(error);
  }
}
