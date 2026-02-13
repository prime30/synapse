import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { getOrganizationId } from '@/lib/billing/org-resolver';
import { reverifyStoredKey, type AIProvider } from '@/lib/billing/api-key-vault';

const VALID_PROVIDERS = new Set<string>(['anthropic', 'openai', 'google']);

// ---------------------------------------------------------------------------
// POST /api/billing/api-keys/[provider]/verify
// Re-verify an existing stored API key. Updates is_valid and last_verified_at.
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  try {
    const userId = await requireAuth(request);
    const { provider } = await params;

    if (!VALID_PROVIDERS.has(provider)) {
      throw APIError.badRequest(
        `Invalid provider "${provider}". Must be one of: anthropic, openai, google.`,
        'INVALID_PROVIDER',
      );
    }

    const orgId = await getOrganizationId(userId);
    if (!orgId) {
      throw APIError.badRequest(
        'You must belong to an organization.',
        'NO_ORGANIZATION',
      );
    }

    const valid = await reverifyStoredKey(orgId, provider as AIProvider);

    return successResponse({ valid });
  } catch (error) {
    return handleAPIError(error);
  }
}
