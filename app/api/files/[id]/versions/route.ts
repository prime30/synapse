import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { VersionService } from '@/lib/versions/version-service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const versionService = new VersionService();

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth(request);
    const { id: fileId } = await params;

    const { searchParams } = request.nextUrl;
    const limit = parseInt(searchParams.get('limit') ?? '20', 10);
    const offset = parseInt(searchParams.get('offset') ?? '0', 10);

    const versions = await versionService.getVersionChain(fileId, limit, offset);

    return successResponse(versions);
  } catch (error) {
    return handleAPIError(error);
  }
}
