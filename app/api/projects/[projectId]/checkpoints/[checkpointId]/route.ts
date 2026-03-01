import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { handleAPIError } from '@/lib/errors/handler';
import { restoreCheckpoint, deleteCheckpoint } from '@/lib/checkpoints/checkpoint-service';

interface RouteParams {
  params: Promise<{ projectId: string; checkpointId: string }>;
}

/**
 * POST /api/projects/[projectId]/checkpoints/[checkpointId]
 *
 * Restore or delete a checkpoint.
 * Body: { action: 'restore' | 'delete' }
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth(request);
    const { checkpointId } = await params;
    const body = await request.json();
    const action = body?.action;

    if (action === 'restore' || action === 'revert') {
      const result = await restoreCheckpoint(checkpointId);
      return NextResponse.json({ success: result.errors.length === 0, restored: result.restored, errors: result.errors });
    }

    if (action === 'delete') {
      const ok = await deleteCheckpoint(checkpointId);
      return NextResponse.json({ success: ok });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return handleAPIError(error);
  }
}
