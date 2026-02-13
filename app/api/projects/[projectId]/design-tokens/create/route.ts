import { NextRequest } from 'next/server';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { createToken, findByName } from '@/lib/design-tokens/models/token-model';
import type { TokenCategory } from '@/lib/design-tokens/types';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

const VALID_CATEGORIES: TokenCategory[] = [
  'color',
  'typography',
  'spacing',
  'border',
  'shadow',
  'animation',
];

/**
 * POST /api/projects/[projectId]/design-tokens/create
 *
 * Creates a single design token. Used by the "Create Token from Value" feature
 * where a user promotes a hardcoded value to a named design token.
 *
 * Body: { name: string; value: string; category: TokenCategory; description?: string }
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const body = (await request.json()) as {
      name?: string;
      value?: string;
      category?: string;
      description?: string;
    };

    // Validate required fields
    if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
      throw APIError.badRequest('"name" is required and must be a non-empty string');
    }

    if (!body.value || typeof body.value !== 'string' || body.value.trim().length === 0) {
      throw APIError.badRequest('"value" is required and must be a non-empty string');
    }

    if (!body.category || !VALID_CATEGORIES.includes(body.category as TokenCategory)) {
      throw APIError.badRequest(
        `"category" must be one of: ${VALID_CATEGORIES.join(', ')}`,
      );
    }

    // Sanitize name: lowercase, replace spaces with hyphens
    const sanitizedName = body.name.trim().toLowerCase().replace(/\s+/g, '-');

    // Check for duplicate
    const existing = await findByName(projectId, sanitizedName);
    if (existing) {
      throw APIError.conflict(`A token named "${sanitizedName}" already exists in this project`);
    }

    const token = await createToken({
      project_id: projectId,
      name: sanitizedName,
      category: body.category as TokenCategory,
      value: body.value.trim(),
      description: body.description?.trim() || 'Promoted from hardcoded value',
    });

    return successResponse({ token }, 201);
  } catch (error) {
    return handleAPIError(error);
  }
}
