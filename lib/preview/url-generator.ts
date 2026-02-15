export interface PreviewUrlOptions {
  /** Project ID — used to build the proxy URL */
  projectId: string;
  /** Optional storefront path, e.g. '/' or '/collections/all' */
  path?: string;
  /** When true, append a cache-bust timestamp so the proxy bypasses in-memory cache */
  cacheBust?: boolean;
}

/**
 * Build a preview URL that goes through our server-side proxy.
 * The proxy fetches the Shopify storefront and strips X-Frame-Options
 * so the page can be rendered inside an iframe.
 */
export function buildPreviewUrl(options: PreviewUrlOptions): string {
  const path = options.path?.startsWith('/') ? options.path : options.path ? `/${options.path}` : '/';
  let url = `/api/projects/${encodeURIComponent(options.projectId)}/preview?path=${encodeURIComponent(path)}`;
  if (options.cacheBust) {
    url += `&_t=${Date.now()}`;
  }
  return url;
}
