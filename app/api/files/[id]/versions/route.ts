import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { VersionService } from '@/lib/versions/version-service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const versionService = new VersionService();

const PREVIEW_TAB_ID = '__preview__';

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: fileId } = await params;

    if (fileId === PREVIEW_TAB_ID || !fileId) {
      return successResponse([]);
    }

    await requireAuth(request);

    const { searchParams } = request.nextUrl;
    const limit = parseInt(searchParams.get('limit') ?? '20', 10);
    const offset = parseInt(searchParams.get('offset') ?? '0', 10);

    let versions;
    try {
      versions = await versionService.getVersionChain(fileId, limit, offset);
    } catch {
      // File may not exist or have no versions — return empty instead of 500
      return successResponse([]);
    }

    return successResponse(versions);
  } catch (error) {
    return handleAPIError(error);
  }
}
