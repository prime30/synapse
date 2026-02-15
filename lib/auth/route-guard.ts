/**
 * Route protection configuration and helpers - REQ-8 TASK-3
 *
 * Provides path-matching utilities for determining which routes
 * are publicly accessible vs. require authentication.
 */

export interface ProtectedRouteConfig {
  /** Exact public page paths (e.g. '/', '/auth/signin') */
  publicPaths: string[];
  /** API path prefixes that are publicly accessible (e.g. '/api/auth/') */
  apiPublicPaths: string[];
}

export const DEFAULT_ROUTE_CONFIG: ProtectedRouteConfig = {
  publicPaths: ['/', '/auth/signin', '/auth/confirm', '/auth/error', '/auth/forgot-password', '/auth/reset-password', '/auth/mcp', '/pricing', '/signup', '/welcome', '/docs', '/blog'],
  apiPublicPaths: ['/api/auth/', '/api/health'],
};

/**
 * Check whether a pathname is publicly accessible.
 *
 * - For `publicPaths`: exact match is required.
 * - For `apiPublicPaths`: prefix match is used so all sub-routes are included
 *   (e.g. '/api/auth/' matches '/api/auth/login', '/api/auth/callback', etc.).
 */
export function isPublicPath(
  pathname: string,
  config: ProtectedRouteConfig = DEFAULT_ROUTE_CONFIG,
): boolean {
  // Exact match against public page paths
  if (config.publicPaths.includes(pathname)) {
    return true;
  }

  // Prefix match against public API paths
  if (config.apiPublicPaths.some((prefix) => pathname.startsWith(prefix))) {
    return true;
  }

  // Marketing subpaths (docs/*, blog/*)
  if (pathname.startsWith('/docs/') || pathname.startsWith('/blog/')) {
    return true;
  }

  return false;
}

/**
 * Build the redirect URL for unauthenticated users.
 * Encodes the original pathname as a callbackUrl query parameter
 * so users return to their intended destination after sign-in.
 */
export function getRedirectUrl(pathname: string): string {
  return `/auth/signin?callbackUrl=${encodeURIComponent(pathname)}`;
}
