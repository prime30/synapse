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
 * POST /api/projects/[projectId]/design-tokens/apply
 *
 * Apply token changes atomically across all project files.
 *
 * Body: `{ changes: TokenChange[] }`
 * Returns: `DeploymentResult`
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    const userId = await requireProjectAccess(request, projectId);

    const body = (await request.json()) as { changes?: TokenChange[] };

    if (!body.changes || !Array.isArray(body.changes) || body.changes.length === 0) {
      throw APIError.badRequest('Request body must include a non-empty "changes" array');
    }

    // Validate each change has required fields
    for (const change of body.changes) {
      if (!change.type || !change.tokenName) {
        throw APIError.badRequest('Each change must have "type" and "tokenName"');
      }
      if (!['replace', 'rename', 'delete'].includes(change.type)) {
        throw APIError.badRequest(
          `Invalid change type "${change.type}". Must be one of: replace, rename, delete`,
        );
      }
      if (change.type === 'replace' && !change.oldValue) {
        throw APIError.badRequest('Replace changes require "oldValue"');
      }
    }

    const applicator = new TokenApplicator();
    const result = await applicator.applyTokenChanges(projectId, body.changes, userId);

    return successResponse(result);
  } catch (error) {
    return handleAPIError(error);
  }
}
