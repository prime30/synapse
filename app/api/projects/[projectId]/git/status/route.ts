import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { getStatus } from '@/lib/git/git-service';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/**
 * GET /api/projects/[projectId]/git/status
 * Get the git status (file changes) for a project.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth(request);
    const { projectId } = await params;

    const status = await getStatus(projectId);

    return successResponse(status);
  } catch (error) {
    return handleAPIError(error);
  }
}
