/**
 * Shopify Storefront Session Manager
 *
 * Replicates the authentication flow from the Shopify CLI's `theme dev` command.
 * Uses the Admin API token + Storefront API token to obtain a `_shopify_essential`
 * cookie, then sends both the cookie and `Authorization: Bearer {sfToken}` on
 * every proxied storefront request so Shopify honors `preview_theme_id`.
 *
 * Token sources (in priority order):
 * 1. SHOPIFY_STOREFRONT_ACCESS_TOKEN env var (direct configuration)
 * 2. Existing storefront tokens on the store (via Admin REST API list)
 * 3. Create a new one via Admin REST API (requires unauthenticated_* scopes)
 */

import { decryptToken } from './token-manager';

const SESSION_TTL_MS = 25 * 60 * 1000;
const SYNAPSE_SF_TOKEN_TITLE = 'Synapse Preview';
const TKA_DOMAIN = 'theme-kit-access.shopifyapps.com';
const customDomainCache = new Map<string, { domain: string; ts: number }>();
const DOMAIN_CACHE_TTL = 60 * 60 * 1000;

interface StorefrontSession {
  storefrontToken: string;
  essentialCookie: string;
  createdAt: number;
}

export interface TKASessionResult {
  storefrontToken: string;
  cookie: string;
  themeAccessPassword: string;
  storeDomain: string;
  isTKA: true;
}

const sessionCache = new Map<string, StorefrontSession>();

function cacheKey(storeDomain: string, themeId: string): string {
  return `${storeDomain}::${themeId}`;
}

function tkaCacheKey(storeDomain: string, themeId: string): string {
  return `tka:${storeDomain}::${themeId}`;
}

/**
 * Get or create a storefront session for a given store + theme.
 * Returns the auth headers and cookie needed for proxied rendering.
 */
export async function getStorefrontSession(
  storeDomain: string,
  adminAccessToken: string,
  themeId: string,
): Promise<{ storefrontToken: string; cookie: string } | null> {
  const key = cacheKey(storeDomain, themeId);
  const cached = sessionCache.get(key);
  if (cached && Date.now() - cached.createdAt < SESSION_TTL_MS) {
    return { storefrontToken: cached.storefrontToken, cookie: `_shopify_essential=${cached.essentialCookie}` };
  }

  const cleanDomain = storeDomain.replace(/^https?:\/\//, '');

  try {
    const sfToken = await resolveStorefrontToken(cleanDomain, adminAccessToken);
    if (!sfToken) {
      console.log('[SFR Session] No storefront token available — draft preview will not work');
      return null;
    }

    const essential = await fetchEssentialCookie(cleanDomain, themeId, adminAccessToken, sfToken);
    if (!essential) {
      console.log('[SFR Session] Could not obtain _shopify_essential cookie');
      return null;
    }

    const session: StorefrontSession = {
      storefrontToken: sfToken,
      essentialCookie: essential,
      createdAt: Date.now(),
    };
    sessionCache.set(key, session);

    console.log(`[SFR Session] Established session for ${cleanDomain} theme ${themeId} (cookie_len=${essential.length}, cookie_prefix=${essential.slice(0, 30)})`);
    return {
      storefrontToken: sfToken,
      cookie: `_shopify_essential=${essential}`,
    };
  } catch (err) {
    console.error('[SFR Session] Failed to establish session:', err instanceof Error ? err.message : err);
    return null;
  }
}

export function invalidateStorefrontSession(storeDomain: string, themeId: string): void {
  sessionCache.delete(cacheKey(storeDomain, themeId));
  sessionCache.delete(tkaCacheKey(storeDomain, themeId));
}

// ---------------------------------------------------------------------------
// Theme Kit Access (TKA) session
// ---------------------------------------------------------------------------

/**
 * Establish a session through the Theme Kit Access proxy.
 * This mirrors how Shopify CLI's `theme dev` works with --password (shptka_*).
 */
export async function getTKASession(
  storeDomain: string,
  themeId: string,
  themeAccessPassword: string,
  adminToken: string,
): Promise<TKASessionResult | null> {
  const cleanDomain = storeDomain.replace(/^https?:\/\//, '');
  const key = tkaCacheKey(cleanDomain, themeId);
  const cached = sessionCache.get(key);
  if (cached && Date.now() - cached.createdAt < SESSION_TTL_MS) {
    return {
      storefrontToken: cached.storefrontToken,
      cookie: `_shopify_essential=${cached.essentialCookie}`,
      themeAccessPassword,
      storeDomain: cleanDomain,
      isTKA: true,
    };
  }

  try {
    const sfToken = await resolveStorefrontToken(cleanDomain, adminToken);
    if (!sfToken) {
      console.log('[TKA Session] No storefront token available');
      return null;
    }

    const essential = await fetchTKAEssentialCookie(cleanDomain, themeId, themeAccessPassword, sfToken);
    if (!essential) {
      console.log('[TKA Session] Could not obtain _shopify_essential cookie from TKA');
      return null;
    }

    const session: StorefrontSession = {
      storefrontToken: sfToken,
      essentialCookie: essential,
      createdAt: Date.now(),
    };
    sessionCache.set(key, session);

    console.log(`[TKA Session] Established TKA session for ${cleanDomain} theme ${themeId}`);
    return {
      storefrontToken: sfToken,
      cookie: `_shopify_essential=${essential}`,
      themeAccessPassword,
      storeDomain: cleanDomain,
      isTKA: true,
    };
  } catch (err) {
    console.error('[TKA Session] Failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

async function fetchTKAEssentialCookie(
  storeDomain: string,
  themeId: string,
  themeAccessPassword: string,
  storefrontToken: string,
  retries = 0,
): Promise<string | null> {
  const params = new URLSearchParams({
    preview_theme_id: themeId,
    _fd: '0',
    pb: '0',
  });

  const url = `https://${TKA_DOMAIN}/cli/sfr?${params}`;

  const res = await fetch(url, {
    method: 'HEAD',
    redirect: 'manual',
    headers: {
      'User-Agent': 'Shopify CLI; v=synapse',
      'X-Shopify-Shop': storeDomain,
      'X-Shopify-Access-Token': themeAccessPassword,
      'Authorization': `Bearer ${storefrontToken}`,
    },
    signal: AbortSignal.timeout(10_000),
  });

  const rawSetCookies = res.headers.getSetCookie?.() ?? [];
  console.log(`[TKA Session] HEAD ${url} -> ${res.status}, Set-Cookie count: ${rawSetCookies.length}`);

  let essential = extractCookieValue(rawSetCookies, '_shopify_essential');

  if (!essential && res.status >= 300 && res.status < 400) {
    const location = res.headers.get('location');
    if (location) {
      const redirectUrl = new URL(location, `https://${TKA_DOMAIN}`);
      redirectUrl.searchParams.set('preview_theme_id', themeId);
      redirectUrl.searchParams.set('_fd', '0');
      redirectUrl.searchParams.set('pb', '0');

      const res2 = await fetch(redirectUrl.toString(), {
        method: 'HEAD',
        redirect: 'manual',
        headers: {
          'User-Agent': 'Shopify CLI; v=synapse',
          'X-Shopify-Shop': storeDomain,
          'X-Shopify-Access-Token': themeAccessPassword,
          'Authorization': `Bearer ${storefrontToken}`,
        },
        signal: AbortSignal.timeout(10_000),
      });
      const setCookies2 = res2.headers.getSetCookie?.() ?? [];
      essential = extractCookieValue(setCookies2, '_shopify_essential');
    }
  }

  if (!essential && retries < 2) {
    await new Promise(r => setTimeout(r, (retries + 1) * 1000));
    return fetchTKAEssentialCookie(storeDomain, themeId, themeAccessPassword, storefrontToken, retries + 1);
  }

  return essential;
}

// ---------------------------------------------------------------------------
// Storefront API access token resolution
// ---------------------------------------------------------------------------

async function resolveStorefrontToken(domain: string, adminToken: string): Promise<string | null> {
  // Priority 1: env var (simplest, always works)
  const envToken = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN;
  if (envToken) {
    console.log('[SFR Session] Using SHOPIFY_STOREFRONT_ACCESS_TOKEN from env');
    return envToken;
  }

  // Priority 2: list existing tokens on the store
  const apiBase = `https://${domain}/admin/api/2025-10`;

  try {
    const listRes = await fetch(`${apiBase}/storefront_access_tokens.json`, {
      headers: { 'X-Shopify-Access-Token': adminToken },
      signal: AbortSignal.timeout(10_000),
    });

    if (listRes.ok) {
      const data = await listRes.json() as { storefront_access_tokens?: { title: string; access_token: string }[] };
      const tokens = data.storefront_access_tokens ?? [];
      if (tokens.length > 0) {
        const ours = tokens.find(t => t.title === SYNAPSE_SF_TOKEN_TITLE);
        const picked = ours ?? tokens[0]!;
        console.log(`[SFR Session] Using storefront token "${picked.title}" from store`);
        return picked.access_token;
      }
    }
  } catch { /* fall through */ }

  // Priority 3: create one (requires unauthenticated_* scopes on the app)
  try {
    const createRes = await fetch(`${apiBase}/storefront_access_tokens.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': adminToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ storefront_access_token: { title: SYNAPSE_SF_TOKEN_TITLE } }),
      signal: AbortSignal.timeout(10_000),
    });

    if (createRes.ok) {
      const created = await createRes.json() as { storefront_access_token?: { access_token: string } };
      if (created.storefront_access_token?.access_token) {
        console.log('[SFR Session] Created new storefront access token');
        return created.storefront_access_token.access_token;
      }
    }
  } catch { /* fall through */ }

  console.log('[SFR Session] Set SHOPIFY_STOREFRONT_ACCESS_TOKEN in .env.local to enable draft preview');
  return null;
}

// ---------------------------------------------------------------------------
// Custom domain resolution (myshopify.com → custom domain)
// ---------------------------------------------------------------------------

async function resolveStorefrontDomain(myshopifyDomain: string): Promise<string> {
  const clean = myshopifyDomain.replace(/^https?:\/\//, '');
  const cached = customDomainCache.get(clean);
  if (cached && Date.now() - cached.ts < DOMAIN_CACHE_TTL) return cached.domain;

  try {
    const res = await fetch(`https://${clean}/`, {
      redirect: 'manual',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SynapsePreview/1.0)' },
      signal: AbortSignal.timeout(5_000),
    });
    const location = res.headers.get('location');
    if (location) {
      const resolved = new URL(location).hostname;
      customDomainCache.set(clean, { domain: resolved, ts: Date.now() });
      console.log(`[SFR Session] Resolved custom domain: ${clean} → ${resolved}`);
      return resolved;
    }
  } catch { /* fall through */ }

  return clean;
}

// ---------------------------------------------------------------------------
// _shopify_essential cookie (mirrors CLI's sessionEssentialCookie)
// ---------------------------------------------------------------------------

async function fetchEssentialCookie(
  myshopifyDomain: string,
  themeId: string,
  adminToken: string,
  storefrontToken: string,
  retries = 0,
): Promise<string | null> {
  // Use .myshopify.com directly — matches Shopify CLI behavior
  const domain = myshopifyDomain.replace(/^https?:\/\//, '');

  const params = new URLSearchParams({
    preview_theme_id: themeId,
    _fd: '0',
    pb: '0',
  });

  const url = `https://${domain}?${params}`;

  const res = await fetch(url, {
    method: 'HEAD',
    redirect: 'manual',
    headers: {
      'User-Agent': 'Shopify CLI; v=synapse',
      'X-Shopify-Shop': myshopifyDomain.replace(/^https?:\/\//, ''),
      'X-Shopify-Access-Token': adminToken,
      'Authorization': `Bearer ${storefrontToken}`,
    },
    signal: AbortSignal.timeout(10_000),
  });

  const location = res.headers.get('location');
  const rawSetCookies = res.headers.getSetCookie?.() ?? [];
  console.log(`[SFR Session] HEAD ${url} → ${res.status}, Location: ${location ?? 'none'}, Set-Cookie: ${rawSetCookies.map(c => c.slice(0, 60)).join(' | ')}`);

  let setCookies = rawSetCookies;
  let essential = extractCookieValue(setCookies, '_shopify_essential');

  // If redirected, follow manually and check the redirect target too
  if (!essential && location && (res.status === 301 || res.status === 302)) {
    const redirectUrl = new URL(location, `https://${domain}`);
    redirectUrl.searchParams.set('preview_theme_id', themeId);
    redirectUrl.searchParams.set('_fd', '0');
    redirectUrl.searchParams.set('pb', '0');

    const res2 = await fetch(redirectUrl.toString(), {
      method: 'HEAD',
      redirect: 'manual',
      headers: {
        'User-Agent': 'Shopify CLI; v=synapse',
        'X-Shopify-Shop': myshopifyDomain.replace(/^https?:\/\//, ''),
        'X-Shopify-Access-Token': adminToken,
        'Authorization': `Bearer ${storefrontToken}`,
      },
      signal: AbortSignal.timeout(10_000),
    });
    console.log(`[SFR Session] HEAD (follow) ${redirectUrl} → ${res2.status}, Set-Cookie count: ${res2.headers.getSetCookie?.()?.length ?? 0}`);
    setCookies = res2.headers.getSetCookie?.() ?? [];
    essential = extractCookieValue(setCookies, '_shopify_essential');
  }

  if (!essential && retries < 2) {
    await new Promise(r => setTimeout(r, (retries + 1) * 1000));
    return fetchEssentialCookie(myshopifyDomain, themeId, adminToken, storefrontToken, retries + 1);
  }

  return essential;
}

function extractCookieValue(setCookies: string[], name: string): string | null {
  for (const sc of setCookies) {
    const parts = sc.split(';')[0]?.split('=');
    if (parts && parts[0]?.trim() === name) {
      return parts.slice(1).join('=');
    }
  }
  return null;
}

export type StorefrontSessionResult =
  | { storefrontToken: string; cookie: string; adminToken: string; isTKA?: false }
  | (TKASessionResult & { adminToken: string });

/**
 * Decrypt the admin access token from a connection and attempt to
 * establish a storefront session. Returns null on any failure.
 *
 * If the connection has a Theme Kit Access password, uses the TKA proxy
 * (theme-kit-access.shopifyapps.com) which properly honors preview_theme_id.
 * Otherwise falls back to the standard CLI-style session.
 */
export async function getStorefrontSessionFromConnection(
  connection: {
    store_domain: string;
    access_token_encrypted: string;
    theme_access_password_encrypted?: string | null;
    online_token_encrypted?: string | null;
    online_token_expires_at?: string | null;
  },
  themeId: string,
): Promise<StorefrontSessionResult | null> {
  try {
    const adminToken = decryptToken(connection.access_token_encrypted);

    // Priority 1: Theme Kit Access password (shptka_*)
    if (connection.theme_access_password_encrypted) {
      try {
        const tkaPassword = decryptToken(connection.theme_access_password_encrypted);
        const tkaSession = await getTKASession(
          connection.store_domain,
          String(themeId),
          tkaPassword,
          adminToken,
        );
        if (tkaSession) {
          return { ...tkaSession, adminToken };
        }
      } catch {
        // TKA failed — fall through to standard session
      }
    }

    // Priority 2: Standard CLI-style session
    const session = await getStorefrontSession(connection.store_domain, adminToken, String(themeId));
    if (!session) return null;
    return { ...session, adminToken };
  } catch {
    return null;
  }
}
