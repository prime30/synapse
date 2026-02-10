import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { UndoRedoManager } from '@/lib/versions/undo-redo';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface UndoBody {
  current_version_number: number;
}

const undoRedoManager = new UndoRedoManager();

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth(request);
    const { id: fileId } = await params;
    const body = (await request.json().catch(() => ({}))) as UndoBody;

    if (body.current_version_number === undefined) {
      throw APIError.badRequest('current_version_number is required');
    }

    const version = await undoRedoManager.undo(fileId, body.current_version_number);

    return successResponse(version);
  } catch (error) {
    const msg = error instanceof Error ? error.message : '';
    if (msg.includes('No more undo') || msg.includes('undo available')) {
      return handleAPIError(APIError.badRequest(msg || 'No more undo available'));
    }
    return handleAPIError(error);
  }
}
