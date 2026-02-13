import { APIError } from '@/lib/errors/handler';
import { ShopifyAdminAPIFactory } from './admin-api-factory';
import { ShopifyTokenManager } from './token-manager';

const DEV_THEME_NAME_PREFIX = 'Synapse Dev';

/**
 * Ensure the project has a dedicated development theme: reuse existing if valid,
 * otherwise create a new one and persist the theme_id.
 *
 * When `sourceThemeId` is provided (import workflow), the source theme is
 * duplicated via GraphQL `themeDuplicate` — Shopify copies all files
 * server-side in seconds, making the dev theme immediately renderable.
 * Falls back to creating an empty theme if duplication fails.
 *
 * When no `sourceThemeId` is given, the theme is seeded from the configured
 * SHOPIFY_DEV_THEME_ZIP_URL so it's immediately usable for new projects.
 *
 * Returns the theme ID (string) for the connection.
 */
export async function ensureDevTheme(
  connectionId: string,
  options?: { themeName?: string; sourceThemeId?: number }
): Promise<string> {
  const tokenManager = new ShopifyTokenManager();
  const connection = await tokenManager.getConnectionById(connectionId);

  if (!connection) {
    throw APIError.notFound('Shopify connection not found');
  }

  const api = await ShopifyAdminAPIFactory.create(connectionId);

  const name =
    options?.themeName?.trim() ||
    `${DEV_THEME_NAME_PREFIX} - ${connection.store_domain.replace('.myshopify.com', '')}`;

  // ── Import workflow ─────────────────────────────────────────────────────
  // Duplicate the source theme via GraphQL — Shopify copies ALL files
  // server-side in one API call. The resulting theme is immediately
  // renderable, eliminating the 5+ minute sequential push wait.
  if (options?.sourceThemeId) {
    // Strategy 1: GraphQL themeDuplicate (instant, API 2025-10+)
    try {
      const duplicated = await api.duplicateTheme(options.sourceThemeId, name);
      await tokenManager.updateThemeId(connectionId, String(duplicated.id));
      return String(duplicated.id);
    } catch (dupError) {
      console.warn(
        '[ensureDevTheme] themeDuplicate failed, falling back to empty theme:',
        dupError instanceof Error ? dupError.message : dupError
      );
    }

    // Strategy 2: Create empty theme (fallback — requires subsequent push)
    try {
      const theme = await api.createTheme(name, undefined, 'unpublished');
      await tokenManager.updateThemeId(connectionId, String(theme.id));
      return String(theme.id);
    } catch {
      // Fall through to ZIP-based creation
    }
  }

  // ── Non-import workflow (manual dev theme setup) ────────────────────────
  // Reuse existing theme if present and still valid on Shopify.
  if (!options?.sourceThemeId && connection.theme_id) {
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

  // Default workflow: seed from the configured Dawn ZIP URL
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

  const theme = await api.createTheme(name, zipUrl, 'unpublished');
  await tokenManager.updateThemeId(connectionId, String(theme.id));
  return String(theme.id);
}
