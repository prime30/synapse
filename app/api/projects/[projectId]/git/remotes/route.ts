import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { validateBody } from '@/lib/middleware/validation';
import { listRemotes, addRemote } from '@/lib/git/github-sync';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

const addRemoteSchema = z.object({
  name: z.string().min(1, 'Remote name is required'),
  url: z.string().url('Invalid remote URL'),
});

/**
 * GET /api/projects/[projectId]/git/remotes
 * List all remotes for the repository
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const remotes = await listRemotes(projectId);

    return successResponse(remotes);
  } catch (error) {
    return handleAPIError(error);
  }
}

/**
 * POST /api/projects/[projectId]/git/remotes
 * Add a new remote to the repository
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const body = await validateBody(addRemoteSchema)(request);

    await addRemote({
      projectId,
      remoteName: body.name,
      url: body.url,
    });

    return successResponse({ added: true });
  } catch (error) {
    return handleAPIError(error);
  }
}
