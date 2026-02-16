import { NextRequest, NextResponse } from 'next/server';
import { createCheckpoint, listCheckpoints, restoreCheckpoint, deleteCheckpoint } from '@/lib/checkpoints/checkpoint-service';
import { checkIdempotency, recordIdempotencyResponse } from '@/lib/middleware/idempotency';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const checkpoints = await listCheckpoints(projectId);
  return NextResponse.json({ checkpoints });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;

  const idempotencyCheck = await checkIdempotency(req);
  if (idempotencyCheck.isDuplicate) return idempotencyCheck.cachedResponse;

  const body = await req.json();
  const { label, fileIds } = body;

  if (!fileIds?.length) {
    return NextResponse.json({ error: 'fileIds required' }, { status: 400 });
  }

  const checkpoint = await createCheckpoint(projectId, label ?? 'Auto checkpoint', fileIds);
  const response = NextResponse.json({ checkpoint });
  await recordIdempotencyResponse(req, response);
  return response;
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { checkpointId, action } = body;

  if (action === 'restore' && checkpointId) {
    const result = await restoreCheckpoint(checkpointId);
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const checkpointId = searchParams.get('id');

  if (!checkpointId) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  const deleted = await deleteCheckpoint(checkpointId);
  return NextResponse.json({ deleted });
}
