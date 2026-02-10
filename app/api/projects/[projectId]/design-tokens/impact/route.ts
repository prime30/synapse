import { NextRequest } from 'next/server';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { TokenApplicator } from '@/lib/design-tokens/application/token-applicator';
import type { TokenChange } from '@/lib/design-tokens/application/types';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/**
 * POST /api/projects/[projectId]/design-tokens/impact
 *
 * Dry-run impact analysis: shows which files would be affected and how many
 * instances would be changed, without actually modifying anything.
 *
 * Body: `{ changes: TokenChange[] }`
 * Returns: `ImpactAnalysis`
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const body = (await request.json()) as { changes?: TokenChange[] };

    if (!body.changes || !Array.isArray(body.changes) || body.changes.length === 0) {
      throw APIError.badRequest('Request body must include a non-empty "changes" array');
    }

    for (const change of body.changes) {
      if (!change.type || !change.tokenName) {
        throw APIError.badRequest('Each change must have "type" and "tokenName"');
      }
    }

    const applicator = new TokenApplicator();
    const analysis = await applicator.analyzeImpact(projectId, body.changes);

    return successResponse(analysis);
  } catch (error) {
    return handleAPIError(error);
  }
}
