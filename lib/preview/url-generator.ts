export interface PreviewUrlOptions {
  /** Project ID — used to build the proxy URL */
  projectId: string;
  /** Optional storefront path, e.g. '/' or '/collections/all' */
  path?: string;
}

/**
 * Build a preview URL that goes through our server-side proxy.
 * The proxy fetches the Shopify storefront and strips X-Frame-Options
 * so the page can be rendered inside an iframe.
 */
export function buildPreviewUrl(options: PreviewUrlOptions): string {
  const path = options.path?.startsWith('/') ? options.path : options.path ? `/${options.path}` : '/';
  return `/api/projects/${encodeURIComponent(options.projectId)}/preview?path=${encodeURIComponent(path)}`;
}
