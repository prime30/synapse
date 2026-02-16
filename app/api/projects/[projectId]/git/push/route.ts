import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { validateBody } from '@/lib/middleware/validation';
import { pushToRemote } from '@/lib/git/github-sync';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

const pushSchema = z.object({
  remoteName: z.string().optional(),
  branch: z.string().optional(),
  token: z.string().min(1, 'Token is required'),
  force: z.boolean().optional().default(false),
});

/**
 * POST /api/projects/[projectId]/git/push
 * Push commits to a remote repository
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const body = await validateBody(pushSchema)(request);

    const result = await pushToRemote({
      projectId,
      remoteName: body.remoteName,
      branch: body.branch,
      token: body.token,
      force: body.force,
    });

    if (!result.ok) {
      throw APIError.badRequest(
        result.errors?.join(', ') || 'Push failed',
        'PUSH_FAILED'
      );
    }

    return successResponse(result);
  } catch (error) {
    return handleAPIError(error);
  }
}
