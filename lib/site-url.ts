/**
 * Single source of truth for the public-facing site URL.
 *
 * In production set NEXT_PUBLIC_APP_URL=https://synapse.shop (no trailing slash).
 * Locally it defaults to http://localhost:3000 via .env or .env.local.
 */

const DEFAULT_SITE_URL = 'https://synapse.shop';

/** Returns the canonical site URL with no trailing slash. */
export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  return raw || DEFAULT_SITE_URL;
}
