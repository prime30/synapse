import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { getDiff } from '@/lib/git/git-service';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/**
 * GET /api/projects/[projectId]/git/diff
 * Get diff between two refs.
 *
 * Query params:
 *   ref1 - First ref (optional)
 *   ref2 - Second ref (optional)
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth(request);
    const { projectId } = await params;

    const url = new URL(request.url);
    const ref1 = url.searchParams.get('ref1') || undefined;
    const ref2 = url.searchParams.get('ref2') || undefined;

    const diff = await getDiff(projectId, { ref1, ref2 });

    return successResponse(diff);
  } catch (error) {
    return handleAPIError(error);
  }
}
