import { NextRequest } from 'next/server';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { listVersions } from '@/lib/design-tokens/models/token-model';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/**
 * GET /api/projects/[projectId]/design-tokens/versions
 *
 * Lists all design system versions for a project, newest first.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const versions = await listVersions(projectId);

    return successResponse({ versions });
  } catch (error) {
    return handleAPIError(error);
  }
}
