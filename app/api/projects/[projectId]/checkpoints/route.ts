import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/middleware/auth';
import { validateBody } from '@/lib/middleware/validation';
import { handleAPIError } from '@/lib/errors/handler';
import {
  createCheckpoint,
  listCheckpoints,
} from '@/lib/checkpoints/checkpoint-service';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/**
 * GET /api/projects/[projectId]/checkpoints
 *
 * List checkpoints for the project, newest first.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth(request);
    const { projectId } = await params;

    const checkpoints = await listCheckpoints(projectId);

    return NextResponse.json({
      checkpoints: checkpoints.map((cp) => ({
        id: cp.id,
        label: cp.label,
        createdAt: cp.created_at,
        fileCount: cp.file_snapshots?.length ?? 0,
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
  ).default([]),
});

/**
 * POST /api/projects/[projectId]/checkpoints
 *
 * Create a checkpoint. If `files` are provided they are stored as snapshots;
 * otherwise an empty checkpoint (named marker) is created.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth(request);
    const { projectId } = await params;
    const body = await validateBody(createSchema)(request);

    const preloaded = body.files.map((f) => ({
      fileId: f.fileId,
      fileName: f.path,
      content: f.content,
    }));

    const cp = await createCheckpoint(
      projectId,
      body.label,
      body.files.map((f) => f.fileId),
      preloaded,
    );

    if (!cp) {
      return NextResponse.json(
        { error: 'Failed to create checkpoint' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      checkpoint: {
        id: cp.id,
        label: cp.label,
        createdAt: cp.created_at,
        fileCount: cp.file_snapshots?.length ?? 0,
      },
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
