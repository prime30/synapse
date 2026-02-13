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
 * GET /api/stores/[connectionId]/inventory
 * List products, locations, and inventory levels for a Shopify store.
 * Returns: { products, locations, levels }
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

    const [products, locations] = await Promise.all([
      api.listProducts(),
      api.listLocations(),
    ]);

    // Fetch inventory levels for each location in parallel
    const levelsPerLocation = await Promise.all(
      locations.map((loc) => api.getInventoryLevels(loc.id))
    );
    const levels = levelsPerLocation.flat();

    return successResponse({ products, locations, levels });
  } catch (error) {
    return handleAPIError(error);
  }
}

/**
 * PATCH /api/stores/[connectionId]/inventory
 * Set inventory level for an item at a location.
 * Body: { inventoryItemId: number, locationId: number, quantity: number }
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
    const inventoryItemId = typeof body.inventoryItemId === 'number' ? body.inventoryItemId : null;
    const locationId = typeof body.locationId === 'number' ? body.locationId : null;
    const quantity = typeof body.quantity === 'number' ? body.quantity : null;

    if (!inventoryItemId || !locationId || quantity === null) {
      throw APIError.badRequest('inventoryItemId (number), locationId (number), and quantity (number) are required');
    }

    const api = await ShopifyAdminAPIFactory.create(connectionId);
    await api.setInventoryLevel(inventoryItemId, locationId, quantity);

    return successResponse({ updated: true, inventoryItemId, locationId, quantity });
  } catch (error) {
    return handleAPIError(error);
  }
}
