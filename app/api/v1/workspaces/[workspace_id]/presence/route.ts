import { NextRequest } from 'next/server';
import { requireAuth, requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { validateBody } from '@/lib/middleware/validation';
import { presenceUpdateSchema } from '@/lib/api/validation';
import { listPresence, upsertPresence } from '@/lib/collaboration/presence-manager';

interface RouteParams {
  params: Promise<{ workspace_id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { workspace_id } = await params;
    await requireProjectAccess(request, workspace_id);
    const presence = await listPresence(workspace_id);
    return successResponse({ presence });
  } catch (error) {
    return handleAPIError(error);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { workspace_id } = await params;
    await requireProjectAccess(request, workspace_id);
    const userId = await requireAuth(request);
    const body = await validateBody(presenceUpdateSchema)(request);
    const presence = await upsertPresence({
      project_id: workspace_id,
      user_id: userId,
      file_path: body.file_path,
      cursor_position: body.cursor_position,
      state: body.state,
    });
    return successResponse(presence);
  } catch (error) {
    return handleAPIError(error);
  }
}
