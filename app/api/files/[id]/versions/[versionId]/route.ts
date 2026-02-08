import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { VersionService } from '@/lib/versions/version-service';

interface RouteParams {
  params: Promise<{ id: string; versionId: string }>;
}

const versionService = new VersionService();

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth(request);
    const { versionId } = await params;

    const version = await versionService.getVersion(versionId);

    if (!version) {
      throw APIError.notFound('Version not found');
    }

    return successResponse(version);
  } catch (error) {
    return handleAPIError(error);
  }
}
