import { APIError } from '@/lib/errors/handler';
import { ShopifyAdminAPIFactory } from './admin-api-factory';
import { ShopifyTokenManager } from './token-manager';

const DEV_THEME_NAME_PREFIX = 'Synapse Dev';

/**
 * Ensure the project has a dedicated development theme: reuse existing if valid,
 * otherwise create one from the configured theme zip URL and persist theme_id.
 * Returns the theme ID (string) for the connection.
 */
export async function ensureDevTheme(
  connectionId: string,
  options?: { themeName?: string }
): Promise<string> {
  const tokenManager = new ShopifyTokenManager();
  const connection = await tokenManager.getConnectionById(connectionId);

  if (!connection) {
    throw APIError.notFound('Shopify connection not found');
  }

  const api = await ShopifyAdminAPIFactory.create(connectionId);

  // Reuse existing theme if present and still valid on Shopify
  if (connection.theme_id) {
    const themeIdNum = Number(connection.theme_id);
    if (Number.isFinite(themeIdNum)) {
      try {
        await api.getTheme(themeIdNum);
        return connection.theme_id;
      } catch {
        // Theme no longer exists or inaccessible; fall through to create
      }
    }
  }

  const rawZipUrl =
    process.env.SHOPIFY_DEV_THEME_ZIP_URL?.trim() ||
    process.env.SHOPIFY_DEV_THEME_SRC?.trim();
  const zipUrl = rawZipUrl
    ? rawZipUrl.replace(/^['"]+|['"]+$/g, '').trim()
    : '';
  if (!zipUrl) {
    throw new APIError(
      'Dev theme creation requires SHOPIFY_DEV_THEME_ZIP_URL (or SHOPIFY_DEV_THEME_SRC) to be set. Use a public URL to a Shopify theme ZIP.',
      'MISSING_DEV_THEME_ZIP',
      500
    );
  }

  const startsWithHttp = /^https?:\/\//i.test(zipUrl);
  if (!startsWithHttp) {
    throw new APIError(
      'Dev theme source URL must start with http:// or https://',
      'INVALID_DEV_THEME_ZIP_URL',
      500
    );
  }

  const name =
    options?.themeName?.trim() ||
    `${DEV_THEME_NAME_PREFIX} - ${connection.store_domain.replace('.myshopify.com', '')}`;
  try {
    const theme = await api.createTheme(name, zipUrl, 'unpublished');

    await tokenManager.updateThemeId(connectionId, String(theme.id));
    return String(theme.id);
  } catch (error) {
    throw error;
  }
}
