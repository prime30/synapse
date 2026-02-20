import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/middleware/auth';
import { validateBody } from '@/lib/middleware/validation';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import {
  getCheckpoint,
  revertToCheckpoint,
  deleteCheckpoint,
} from '@/lib/services/checkpoints';

interface RouteParams {
  params: Promise<{ projectId: string; checkpointId: string }>;
}

/**
 * GET /api/projects/[projectId]/checkpoints/[checkpointId]
 *
 * Get full checkpoint details including file list.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth(request);
    const { checkpointId } = await params;

    const cp = getCheckpoint(checkpointId);
    if (!cp) throw APIError.notFound('Checkpoint not found');

    return successResponse({
      checkpoint: {
        id: cp.id,
        label: cp.label,
        createdAt: cp.createdAt,
        sessionId: cp.sessionId,
        files: Array.from(cp.files.values()).map((f) => ({
          fileId: f.fileId,
          path: f.path,
        })),
      },
    });
  } catch (error) {
    return handleAPIError(error);
  }
}

const revertSchema = z.object({
  action: z.literal('revert'),
});

/**
 * POST /api/projects/[projectId]/checkpoints/[checkpointId]
 *
 * Perform an action on a checkpoint. Currently supports `{ action: 'revert' }`.
 * Returns the full file contents so the caller can restore them.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth(request);
    const { checkpointId } = await params;
    await validateBody(revertSchema)(request);

    const files = revertToCheckpoint(checkpointId);
    if (!files) throw APIError.notFound('Checkpoint not found');

    return successResponse({ files });
  } catch (error) {
    return handleAPIError(error);
  }
}

/**
 * DELETE /api/projects/[projectId]/checkpoints/[checkpointId]
 *
 * Remove a checkpoint from memory.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth(request);
    const { checkpointId } = await params;

    const deleted = deleteCheckpoint(checkpointId);
    if (!deleted) throw APIError.notFound('Checkpoint not found');

    return successResponse({ deleted: true });
  } catch (error) {
    return handleAPIError(error);
  }
}
