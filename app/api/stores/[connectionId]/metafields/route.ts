import { NextRequest } from 'next/server';

import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { ShopifyTokenManager } from '@/lib/shopify/token-manager';

const SHOPIFY_API_VERSION = '2024-01';

interface RouteParams {
  params: Promise<{ connectionId: string }>;
}

/**
 * Resolve Shopify API credentials for a connection, verifying ownership.
 */
async function resolveConnection(connectionId: string, userId: string) {
  const tokenManager = new ShopifyTokenManager();
  const connection = await tokenManager.getConnectionById(connectionId);

  if (!connection) {
    throw APIError.notFound('Store connection not found');
  }
  const ownerMatch =
    connection.user_id === userId ||
    (!connection.user_id && connection.project_id);
  if (!ownerMatch) {
    throw APIError.notFound('Store connection not found');
  }

  const accessToken = await tokenManager.getDecryptedToken(connectionId);
  const storeDomain = connection.store_domain.replace(/^https?:\/\//, '');
  const apiBase = `https://${storeDomain}/admin/api/${SHOPIFY_API_VERSION}`;

  return { accessToken, storeDomain, apiBase };
}

/**
 * Make an authenticated request to the Shopify Admin API.
 */
async function shopifyFetch<T>(
  apiBase: string,
  accessToken: string,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${apiBase}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message =
      body?.errors ??
      body?.error ??
      `Shopify API error: ${res.status} ${res.statusText}`;
    throw new APIError(
      typeof message === 'string' ? message : JSON.stringify(message),
      'SHOPIFY_API_ERROR',
      res.status >= 500 ? 502 : res.status
    );
  }

  // DELETE returns 200 with empty body sometimes
  const text = await res.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

// ─── GET /api/stores/[connectionId]/metafields ─────────────────────────────

/**
 * GET /api/stores/[connectionId]/metafields
 * List metafields. Optional query params:
 *   - namespace: filter by namespace
 *   - owner_resource: filter by owner resource type (e.g. "shop")
 *   - owner_id: filter by owner id
 *   - limit: number of results (default 50, max 250)
 *   - since_id: pagination cursor
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(request);
    const { connectionId } = await params;
    const { accessToken, apiBase } = await resolveConnection(connectionId, userId);

    const searchParams = request.nextUrl.searchParams;
    const queryParts: string[] = [];

    const namespace = searchParams.get('namespace');
    if (namespace) queryParts.push(`namespace=${encodeURIComponent(namespace)}`);

    const ownerResource = searchParams.get('owner_resource');
    if (ownerResource) queryParts.push(`metafield[owner_resource]=${encodeURIComponent(ownerResource)}`);

    const ownerId = searchParams.get('owner_id');
    if (ownerId) queryParts.push(`metafield[owner_id]=${encodeURIComponent(ownerId)}`);

    const limit = searchParams.get('limit');
    queryParts.push(`limit=${limit ? Math.min(Number(limit), 250) : 50}`);

    const sinceId = searchParams.get('since_id');
    if (sinceId) queryParts.push(`since_id=${encodeURIComponent(sinceId)}`);

    const query = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
    const data = await shopifyFetch<{ metafields: unknown[] }>(
      apiBase,
      accessToken,
      `/metafields.json${query}`
    );

    return successResponse({ metafields: data.metafields ?? [] });
  } catch (error) {
    return handleAPIError(error);
  }
}

// ─── POST /api/stores/[connectionId]/metafields ────────────────────────────

/**
 * POST /api/stores/[connectionId]/metafields
 * Create a new metafield.
 * Body: { namespace, key, value, type }
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(request);
    const { connectionId } = await params;
    const { accessToken, apiBase } = await resolveConnection(connectionId, userId);

    const body = await request.json().catch(() => ({}));
    const { namespace, key, value, type } = body;

    if (!namespace || typeof namespace !== 'string') {
      throw APIError.badRequest('namespace (string) is required');
    }
    if (!key || typeof key !== 'string') {
      throw APIError.badRequest('key (string) is required');
    }
    if (value === undefined || value === null) {
      throw APIError.badRequest('value is required');
    }
    if (!type || typeof type !== 'string') {
      throw APIError.badRequest('type (string) is required');
    }

    const data = await shopifyFetch<{ metafield: unknown }>(
      apiBase,
      accessToken,
      '/metafields.json',
      {
        method: 'POST',
        body: JSON.stringify({
          metafield: {
            namespace,
            key,
            value: String(value),
            type,
          },
        }),
      }
    );

    return successResponse({ metafield: data.metafield }, 201);
  } catch (error) {
    return handleAPIError(error);
  }
}

// ─── PUT /api/stores/[connectionId]/metafields ─────────────────────────────

/**
 * PUT /api/stores/[connectionId]/metafields
 * Update an existing metafield's value.
 * Body: { id, value }
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(request);
    const { connectionId } = await params;
    const { accessToken, apiBase } = await resolveConnection(connectionId, userId);

    const body = await request.json().catch(() => ({}));
    const { id, value } = body;

    if (!id || (typeof id !== 'number' && typeof id !== 'string')) {
      throw APIError.badRequest('id (number) is required');
    }
    if (value === undefined || value === null) {
      throw APIError.badRequest('value is required');
    }

    const data = await shopifyFetch<{ metafield: unknown }>(
      apiBase,
      accessToken,
      `/metafields/${id}.json`,
      {
        method: 'PUT',
        body: JSON.stringify({
          metafield: { value: String(value) },
        }),
      }
    );

    return successResponse({ metafield: data.metafield });
  } catch (error) {
    return handleAPIError(error);
  }
}

// ─── DELETE /api/stores/[connectionId]/metafields ──────────────────────────

/**
 * DELETE /api/stores/[connectionId]/metafields?id=123
 * Delete a metafield by ID.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(request);
    const { connectionId } = await params;
    const { accessToken, apiBase } = await resolveConnection(connectionId, userId);

    const metafieldId = request.nextUrl.searchParams.get('id');
    if (!metafieldId) {
      throw APIError.badRequest('id query parameter is required');
    }

    await shopifyFetch(
      apiBase,
      accessToken,
      `/metafields/${metafieldId}.json`,
      { method: 'DELETE' }
    );

    return successResponse({ deleted: true });
  } catch (error) {
    return handleAPIError(error);
  }
}
