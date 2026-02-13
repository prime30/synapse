import { NextRequest } from 'next/server';

import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { ShopifyTokenManager } from '@/lib/shopify/token-manager';
import { ShopifyAdminAPIFactory } from '@/lib/shopify/admin-api-factory';

interface RouteParams {
  params: Promise<{ connectionId: string }>;
}

/**
 * GET /api/stores/[connectionId]/pages
 * List all pages for a Shopify store.
 * Returns: { pages: ShopifyPage[] }
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(request);
    const { connectionId } = await params;

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

    const api = await ShopifyAdminAPIFactory.create(connectionId);
    const pages = await api.listPages();

    return successResponse({ pages });
  } catch (error) {
    return handleAPIError(error);
  }
}

/**
 * POST /api/stores/[connectionId]/pages
 * Create a new page.
 * Body: { title: string, body_html: string, published?: boolean }
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(request);
    const { connectionId } = await params;

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

    const body = await request.json().catch(() => ({}));
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const body_html = typeof body.body_html === 'string' ? body.body_html : '';
    const published = typeof body.published === 'boolean' ? body.published : undefined;

    if (!title) {
      throw APIError.badRequest('title (string) is required');
    }

    const api = await ShopifyAdminAPIFactory.create(connectionId);
    const page = await api.createPage({ title, body_html, published });

    return successResponse({ page }, 201);
  } catch (error) {
    return handleAPIError(error);
  }
}

/**
 * PATCH /api/stores/[connectionId]/pages
 * Update an existing page.
 * Body: { pageId: number, title?, body_html?, handle?, template_suffix?, published? }
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(request);
    const { connectionId } = await params;

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

    const body = await request.json().catch(() => ({}));
    const pageId = typeof body.pageId === 'number' ? body.pageId : null;

    if (!pageId) {
      throw APIError.badRequest('pageId (number) is required');
    }

    // Extract updatable fields
    const fields: Record<string, unknown> = {};
    if (typeof body.title === 'string') fields.title = body.title;
    if (typeof body.body_html === 'string') fields.body_html = body.body_html;
    if (typeof body.handle === 'string') fields.handle = body.handle;
    if (typeof body.template_suffix === 'string') fields.template_suffix = body.template_suffix;
    if (typeof body.published === 'boolean') fields.published = body.published;

    if (Object.keys(fields).length === 0) {
      throw APIError.badRequest('At least one field to update is required');
    }

    const api = await ShopifyAdminAPIFactory.create(connectionId);
    const page = await api.updatePage(pageId, fields);

    return successResponse({ page });
  } catch (error) {
    return handleAPIError(error);
  }
}

/**
 * DELETE /api/stores/[connectionId]/pages
 * Delete a page.
 * Body: { pageId: number }
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(request);
    const { connectionId } = await params;

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

    const body = await request.json().catch(() => ({}));
    const pageId = typeof body.pageId === 'number' ? body.pageId : null;

    if (!pageId) {
      throw APIError.badRequest('pageId (number) is required');
    }

    const api = await ShopifyAdminAPIFactory.create(connectionId);
    await api.deletePage(pageId);

    return successResponse({ deleted: true, pageId });
  } catch (error) {
    return handleAPIError(error);
  }
}
