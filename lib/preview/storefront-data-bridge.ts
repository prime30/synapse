/**
 * Storefront Data Bridge — fetches real product data for preview rendering.
 * EPIC 10: Connects preview iframe to live store data.
 */
import { ShopifyAdminAPIFactory } from '@/lib/shopify/admin-api-factory';
import type { ShopifyProduct } from '@/lib/shopify/admin-api';

export interface StorefrontData {
  products: ShopifyProduct[];
  fetchedAt: string;
}

export async function fetchStorefrontData(connectionId: string, limit = 10): Promise<StorefrontData> {
  const api = await ShopifyAdminAPIFactory.create(connectionId);
  const products = await api.listProductsForPreview(limit);
  return { products, fetchedAt: new Date().toISOString() };
}
