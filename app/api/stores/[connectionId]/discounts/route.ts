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
 * GET /api/stores/[connectionId]/discounts
 * List price rules and their discount codes.
 * Returns: { priceRules: Array<PriceRule & { discountCodes: DiscountCode[] }> }
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
    const priceRules = await api.listPriceRules();

    // Fetch discount codes for each price rule in parallel
    const priceRulesWithCodes = await Promise.all(
      priceRules.map(async (rule) => {
        const discountCodes = await api.listDiscountCodes(rule.id);
        return { ...rule, discountCodes };
      })
    );

    return successResponse({ priceRules: priceRulesWithCodes });
  } catch (error) {
    return handleAPIError(error);
  }
}

/**
 * POST /api/stores/[connectionId]/discounts
 * Create a price rule and its discount code.
 * Body: { rule: Partial<ShopifyPriceRule>, code: string }
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
    const rule = body.rule;
    const code = typeof body.code === 'string' ? body.code.trim() : '';

    if (!rule || typeof rule !== 'object') {
      throw APIError.badRequest('rule object is required');
    }
    if (!code) {
      throw APIError.badRequest('code (string) is required');
    }

    const api = await ShopifyAdminAPIFactory.create(connectionId);
    const priceRule = await api.createPriceRule(rule);
    const discountCode = await api.createDiscountCode(priceRule.id, code);

    return successResponse({ priceRule, discountCode }, 201);
  } catch (error) {
    return handleAPIError(error);
  }
}

/**
 * DELETE /api/stores/[connectionId]/discounts
 * Delete a price rule (and its associated discount codes).
 * Body: { priceRuleId: number }
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
    const priceRuleId = typeof body.priceRuleId === 'number' ? body.priceRuleId : null;

    if (!priceRuleId) {
      throw APIError.badRequest('priceRuleId (number) is required');
    }

    const api = await ShopifyAdminAPIFactory.create(connectionId);
    await api.deletePriceRule(priceRuleId);

    return successResponse({ deleted: true, priceRuleId });
  } catch (error) {
    return handleAPIError(error);
  }
}
