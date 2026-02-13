import { NextRequest } from 'next/server';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { TokenApplicator } from '@/lib/design-tokens/application/token-applicator';

interface RouteParams {
  params: Promise<{ projectId: string; versionId: string }>;
}

/**
 * POST /api/projects/[projectId]/design-tokens/versions/[versionId]/rollback
 *
 * Rolls back the design system to the state before the specified version was applied.
 * Inverts the token changes stored in the version's `changes` payload.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, versionId } = await params;
    await requireProjectAccess(request, projectId);

    if (!versionId) {
      throw APIError.badRequest('versionId is required');
    }

    const applicator = new TokenApplicator();
    await applicator.rollback(projectId, versionId);

    return successResponse({ success: true, message: `Rolled back version ${versionId}` });
  } catch (error) {
    return handleAPIError(error);
  }
}
