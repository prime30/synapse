import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { listBranches, createBranch } from '@/lib/git/git-service';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

const createBranchSchema = z.object({
  name: z.string().min(1),
  startPoint: z.string().optional(),
});

/**
 * GET /api/projects/[projectId]/git/branches
 * List all branches and get the current branch.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth(request);
    const { projectId } = await params;

    const branches = await listBranches(projectId);

    return successResponse(branches);
  } catch (error) {
    return handleAPIError(error);
  }
}

/**
 * POST /api/projects/[projectId]/git/branches
 * Create a new branch.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth(request);
    const { projectId } = await params;

    const body = await request.json().catch(() => ({}));
    const parsed = createBranchSchema.safeParse(body);

    if (!parsed.success) {
      throw APIError.badRequest('Invalid request body');
    }

    const { name, startPoint } = parsed.data;

    await createBranch(projectId, name, startPoint);

    return successResponse({ created: true, name });
  } catch (error) {
    return handleAPIError(error);
  }
}
