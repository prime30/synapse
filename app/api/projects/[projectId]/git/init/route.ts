import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { initRepo } from '@/lib/git/git-service';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/**
 * POST /api/projects/[projectId]/git/init
 * Initialize a git repository for a project.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth(request);
    const { projectId } = await params;

    await initRepo(projectId);

    return successResponse({ initialized: true });
  } catch (error) {
    return handleAPIError(error);
  }
}
