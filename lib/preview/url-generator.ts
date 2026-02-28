export type PreviewMode = 'proxy' | 'cli' | 'devstore';

export interface PreviewUrlOptions {
  /** Project ID — used to build the proxy URL */
  projectId: string;
  /** Optional storefront path, e.g. '/' or '/collections/all' */
  path?: string;
  /** When true, append a cache-bust timestamp so the proxy bypasses in-memory cache */
  cacheBust?: boolean;
  /** Enable parity diagnostics in preview proxy responses/logs */
  parityDiagnostic?: boolean;
  /** Preview mode: 'proxy' (TKA storefront proxy), 'cli' (Shopify CLI dev server), or 'devstore' (dev store published theme) */
  mode?: PreviewMode;
}

/**
 * Build a preview URL that goes through our server-side proxy.
 * The proxy fetches the Shopify storefront and strips X-Frame-Options
 * so the page can be rendered inside an iframe.
 */
export function buildPreviewUrl(options: PreviewUrlOptions): string {
  const path = options.path?.startsWith('/') ? options.path : options.path ? `/${options.path}` : '/';
  let url = `/api/projects/${encodeURIComponent(options.projectId)}/preview?path=${encodeURIComponent(path)}`;
  if (options.mode) {
    url += `&mode=${options.mode}`;
  }
  if (options.parityDiagnostic) {
    url += '&diag=1';
  }
  if (options.cacheBust) {
    url += `&_t=${Date.now()}`;
  }
  return url;
}
