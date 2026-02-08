import { NextRequest } from 'next/server';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { fetchPreviewResources } from '@/lib/preview/resource-fetcher';
import type { PreviewResourceType } from '@/lib/types/preview';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const type = searchParams.get('type') as PreviewResourceType | null;
    const query = searchParams.get('query') ?? '';

    if (!projectId || !type) {
      return successResponse({ resources: [] }, 200);
    }

    await requireProjectAccess(request, projectId);
    const resources = await fetchPreviewResources(projectId, type, query);
    return successResponse({ resources });
  } catch (error) {
    return handleAPIError(error);
  }
}
