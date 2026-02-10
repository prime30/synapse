import { NextRequest } from 'next/server';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { DriftDetector } from '@/lib/design-tokens/drift/drift-detector';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/**
 * POST /api/projects/[projectId]/design-tokens/drift
 *
 * Analyse a file for design-token drift — hardcoded values that should use
 * existing tokens, near-matches, and tokenisation suggestions.
 *
 * Body: `{ filePath: string, content: string }`
 * Returns: `DriftResult`
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const body = (await request.json()) as {
      filePath?: string;
      content?: string;
    };

    if (!body.filePath || typeof body.filePath !== 'string') {
      throw APIError.badRequest('Request body must include a "filePath" string');
    }
    if (!body.content || typeof body.content !== 'string') {
      throw APIError.badRequest('Request body must include a "content" string');
    }

    const detector = new DriftDetector();
    const result = await detector.detectDrift(
      projectId,
      body.content,
      body.filePath,
    );

    return successResponse(result);
  } catch (error) {
    return handleAPIError(error);
  }
}
