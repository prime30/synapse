import { NextRequest } from 'next/server';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/**
 * POST /api/projects/[projectId]/sync-to-disk
 *
 * Stub: local sync-to-disk is not implemented. Returns enabled: false
 * so useLocalSync treats the feature as disabled and does not 404.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    await requireProjectAccess(request, (await params).projectId);
    return successResponse({
      enabled: false,
      localPath: null,
      fileCount: 0,
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
