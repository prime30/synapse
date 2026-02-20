import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/middleware/auth';
import { validateBody } from '@/lib/middleware/validation';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import {
  createCheckpoint,
  listCheckpoints,
} from '@/lib/services/checkpoints';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/**
 * GET /api/projects/[projectId]/checkpoints
 *
 * List checkpoints for the project. Optional `?sessionId=` filter.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth(request);
    const { projectId } = await params;

    const sessionId = request.nextUrl.searchParams.get('sessionId') ?? undefined;
    const checkpoints = listCheckpoints(projectId, sessionId);

    return successResponse({
      checkpoints: checkpoints.map((cp) => ({
        id: cp.id,
        label: cp.label,
        createdAt: cp.createdAt,
        fileCount: cp.files.size,
      })),
    });
  } catch (error) {
    return handleAPIError(error);
  }
}

const createSchema = z.object({
  sessionId: z.string().min(1),
  label: z.string().min(1).max(200),
  files: z.array(
    z.object({
      fileId: z.string().min(1),
      path: z.string().min(1),
      content: z.string(),
    }),
  ).min(1),
});

/**
 * POST /api/projects/[projectId]/checkpoints
 *
 * Create a checkpoint snapshot of the supplied files.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth(request);
    const { projectId } = await params;
    const body = await validateBody(createSchema)(request);

    const cp = createCheckpoint(projectId, body.sessionId, body.label, body.files);

    return successResponse({
      checkpoint: {
        id: cp.id,
        label: cp.label,
        createdAt: cp.createdAt,
        fileCount: cp.files.size,
      },
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
