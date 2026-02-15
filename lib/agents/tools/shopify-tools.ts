/**
 * Shopify operation helpers for AI agent tools.
 * Uses ShopifyAdminAPIFactory to resolve credentials from projectId + userId.
 */

import { ShopifyAdminAPIFactory } from '@/lib/shopify/admin-api-factory';
import type { ShopifyAdminAPI } from '@/lib/shopify/admin-api';

/**
 * Lazily resolve a ShopifyAdminAPI instance from project + user context.
 * Returns null (with error message) if no connection exists.
 */
export async function getShopifyAPI(
  projectId: string,
  userId: string,
): Promise<{ api: ShopifyAdminAPI } | { error: string }> {
  try {
    const api = await ShopifyAdminAPIFactory.fromProjectId(projectId, userId);
    return { api };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('not found') || message.includes('No active')) {
      return { error: 'No active Shopify store connection for this project. Connect a store first.' };
    }
    return { error: `Shopify connection error: ${message}` };
  }
}

/**
 * Format a list of themes for LLM consumption.
 */
export function formatThemeList(
  themes: Array<{ id: number; name: string; role: string; created_at?: string }>,
): string {
  if (themes.length === 0) return 'No themes found.';
  return themes
    .map(
      (t) =>
        `- ${t.name} (ID: ${t.id}, role: ${t.role}${t.created_at ? `, created: ${t.created_at}` : ''})`,
    )
    .join('\n');
}
