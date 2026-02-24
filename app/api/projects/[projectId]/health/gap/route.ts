import { NextRequest } from 'next/server';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { listProjectFilesWithContent } from '@/lib/services/files';
import { detectThemeGaps } from '@/lib/ai/theme-gap-detector';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/**
 * GET /api/projects/[projectId]/health/gap
 *
 * Returns ThemeGapResult (present, missing, partial CX patterns).
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const files = await listProjectFilesWithContent(projectId);
    const fileContents = new Map<string, string>();
    for (const f of files) {
      if (f.content) fileContents.set(f.path, f.content);
    }

    const result = await detectThemeGaps(fileContents);
    return successResponse(result);
  } catch (error) {
    return handleAPIError(error);
  }
}
