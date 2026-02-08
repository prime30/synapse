import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { VersionService } from '@/lib/versions/version-service';
import { generateUnifiedDiff } from '@/lib/versions/diff-generator';

interface RouteParams {
  params: Promise<{ file_path: string; version_id: string }>;
}

const versionService = new VersionService();

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth(request);
    const { version_id } = await params;

    const version = await versionService.getVersion(version_id);
    if (!version) {
      throw APIError.notFound('Version not found');
    }

    const previous = version.parent_version_id
      ? await versionService.getVersion(version.parent_version_id)
      : null;

    const diff = generateUnifiedDiff(
      previous?.content ?? '',
      version.content ?? ''
    );

    return successResponse(diff);
  } catch (error) {
    return handleAPIError(error);
  }
}
