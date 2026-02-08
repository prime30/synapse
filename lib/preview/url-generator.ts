export interface PreviewUrlOptions {
  storeDomain: string;
  themeId: string | number;
  path?: string;
}

/**
 * Build a Shopify preview URL for a development theme.
 * Shopify renders the preview when the preview_theme_id query is present.
 */
export function buildPreviewUrl(options: PreviewUrlOptions): string {
  const base = `https://${options.storeDomain.replace(/^https?:\/\//, '')}`;
  const path = options.path?.startsWith('/') ? options.path : options.path ? `/${options.path}` : '/';
  const url = new URL(path, base);
  url.searchParams.set('preview_theme_id', String(options.themeId));
  return url.toString();
}
