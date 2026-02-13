import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { getOrganizationId } from '@/lib/billing/org-resolver';
import { deleteKey, type AIProvider } from '@/lib/billing/api-key-vault';

const VALID_PROVIDERS = new Set<string>(['anthropic', 'openai', 'google']);

// ---------------------------------------------------------------------------
// DELETE /api/billing/api-keys/[provider]
// Remove a stored API key for the given provider.
// ---------------------------------------------------------------------------

export async function DELETE(
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

    await deleteKey(orgId, provider as AIProvider);

    return successResponse({ deleted: true });
  } catch (error) {
    return handleAPIError(error);
  }
}
