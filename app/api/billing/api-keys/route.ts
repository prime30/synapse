import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/middleware/auth';
import { validateBody } from '@/lib/middleware/validation';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { getOrganizationId } from '@/lib/billing/org-resolver';
import {
  listKeys,
  storeKey,
  verifyKey,
  type AIProvider,
} from '@/lib/billing/api-key-vault';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const storeKeySchema = z.object({
  provider: z.enum(['anthropic', 'openai', 'google']),
  apiKey: z.string().min(1, 'API key is required'),
});

// ---------------------------------------------------------------------------
// GET /api/billing/api-keys
// List stored keys for the user's org (metadata only — never the actual key).
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth(request);

    const orgId = await getOrganizationId(userId);
    if (!orgId) {
      throw APIError.badRequest(
        'You must belong to an organization.',
        'NO_ORGANIZATION',
      );
    }

    const keys = await listKeys(orgId);
    return successResponse({ keys });
  } catch (error) {
    return handleAPIError(error);
  }
}

// ---------------------------------------------------------------------------
// POST /api/billing/api-keys
// Store a new API key. The key is verified before storage.
// Body: { provider: 'anthropic'|'openai'|'google', apiKey: string }
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const body = await validateBody(storeKeySchema)(request);

    const orgId = await getOrganizationId(userId);
    if (!orgId) {
      throw APIError.badRequest(
        'You must belong to an organization.',
        'NO_ORGANIZATION',
      );
    }

    const provider = body.provider as AIProvider;

    // Verify the key is valid before storing
    const isValid = await verifyKey(provider, body.apiKey);
    if (!isValid) {
      throw APIError.badRequest(
        `The ${provider} API key could not be verified. Please check the key and try again.`,
        'KEY_VERIFICATION_FAILED',
      );
    }

    await storeKey(orgId, provider, body.apiKey);

    return successResponse(
      { provider, suffix: body.apiKey.slice(-4), isValid: true },
      201,
    );
  } catch (error) {
    return handleAPIError(error);
  }
}
