import { NextRequest } from 'next/server';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { listProjectFiles } from '@/lib/services/files';
import type { FileType } from '@/lib/types/files';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const searchParams = request.nextUrl.searchParams;
    const fileType = searchParams.get('file_type') as FileType | null;
    const search = searchParams.get('search');

    const files = await listProjectFiles(projectId, {
      file_type: fileType ?? undefined,
      search: search ?? undefined,
    });

    return successResponse(files);
  } catch (error) {
    return handleAPIError(error);
  }
}
