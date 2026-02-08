import { NextRequest } from 'next/server';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { cleanupOldVersions } from '@/lib/versions/cleanup-job';

interface RouteParams {
  params: Promise<{ workspace_id: string }>;
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { workspace_id } = await params;
    await requireProjectAccess(request, workspace_id);
    await cleanupOldVersions();
    return successResponse({ cleaned: true });
  } catch (error) {
    return handleAPIError(error);
  }
}
