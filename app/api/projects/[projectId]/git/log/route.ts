import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { getLog } from '@/lib/git/git-service';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/**
 * GET /api/projects/[projectId]/git/log
 * Get commit log for a project.
 *
 * Query params:
 *   depth - Number of commits to return (default: 20)
 *   ref - Optional ref/branch to get log for
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth(request);
    const { projectId } = await params;

    const url = new URL(request.url);
    const depthParam = url.searchParams.get('depth');
    const depth = depthParam ? parseInt(depthParam, 10) : 20;
    const ref = url.searchParams.get('ref') || undefined;

    const log = await getLog(projectId, { depth, ref });

    return successResponse(log);
  } catch (error) {
    return handleAPIError(error);
  }
}
