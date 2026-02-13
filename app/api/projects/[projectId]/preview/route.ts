import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/middleware/auth';
import { handleAPIError } from '@/lib/errors/handler';
import { ShopifyTokenManager } from '@/lib/shopify/token-manager';

/* ------------------------------------------------------------------ */
/*  In-memory response cache                                           */
/*  Prevents the Shopify storefront's JavaScript (sections rendering,  */
/*  analytics, etc.) from creating a full proxy round-trip on every     */
/*  AJAX call (~1/s).  Full-page HTML is cached for 10 s; fragments    */
/*  (section rendering) for 5 s.                                       */
/* ------------------------------------------------------------------ */

interface CacheEntry {
  body: ArrayBuffer;
  headers: Headers;
  status: number;
  isFullPage: boolean;
  timestamp: number;
  contentType: string;
  etag?: string;
}

const MAX_CACHE_SIZE = 200;

const previewCache = new Map<string, CacheEntry>();

/** Tiered cache TTLs based on content type */
function getCacheTTL(contentType: string): number {
  if (contentType.includes('image/') || contentType.includes('font/') || contentType.includes('woff'))
    return 30 * 60 * 1000; // 30 minutes for images/fonts
  if (contentType.includes('javascript') || contentType.includes('css'))
    return 5 * 60 * 1000; // 5 minutes for JS/CSS
  if (contentType.includes('text/html'))
    return 0; // Never cache HTML (needs fresh script injection)
  return 10 * 1000; // 10 seconds for everything else (section fragments, etc.)
}

function getCacheKey(projectId: string, fullPathWithQuery: string): string {
  return `${projectId}::${fullPathWithQuery}`;
}

function getCachedResponse(key: string): CacheEntry | null {
  const entry = previewCache.get(key);
  if (!entry) return null;
  const ttl = getCacheTTL(entry.contentType);
  if (ttl === 0 || Date.now() - entry.timestamp > ttl) {
    previewCache.delete(key);
    return null;
  }
  return entry;
}

function setCachedResponse(key: string, entry: CacheEntry) {
  // Evict oldest entries (by timestamp) if at capacity
  while (previewCache.size >= MAX_CACHE_SIZE) {
    let oldestKey: string | null = null;
    let oldestTs = Infinity;
    for (const [k, v] of previewCache) {
      if (v.timestamp < oldestTs) {
        oldestTs = v.timestamp;
        oldestKey = k;
      }
    }
    if (oldestKey) previewCache.delete(oldestKey);
    else break;
  }
  previewCache.set(key, entry);
}

/** Invalidate all cached preview responses for a project (e.g. after a push). */
export function invalidatePreviewCache(projectId: string) {
  for (const key of previewCache.keys()) {
    if (key.startsWith(`${projectId}::`)) {
      previewCache.delete(key);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Shared helpers                                                     */
/* ------------------------------------------------------------------ */

const NO_PREVIEW_HTML = (msg: string) =>
  `<html><body style="font-family:system-ui;color:#888;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">${msg}</body></html>`;

/**
 * Auto-retrying preview page shown while the dev theme is being populated.
 * Shopify returns 422 when the theme has no renderable templates.
 */
const SYNCING_PREVIEW_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Synapse Preview</title></head>
<body style="font-family:system-ui;color:#999;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;background:#0a0a0f">
  <div style="text-align:center" id="sync-msg">
    <div style="width:32px;height:32px;border:2px solid #333;border-top-color:#60a5fa;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 16px"></div>
    <p style="font-size:14px;color:#aaa;margin:0 0 4px">Syncing files to preview theme&hellip;</p>
    <p style="font-size:12px;color:#666;margin:0">The parent IDE will refresh this when ready.</p>
  </div>
  <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
  <script>
    (function(){
      // Notify the parent IDE frame that we're waiting for sync
      if(window.parent!==window){
        window.parent.postMessage({type:'synapse-preview-syncing',status:'waiting'},'*');
      }
      // Listen for the parent to tell us to reload (event-driven, no polling)
      window.addEventListener('message',function(e){
        if(e.data&&e.data.type==='synapse-preview-refresh'){
          sessionStorage.removeItem('__synapse_sync_retries');
          location.reload();
        }
      });
      // Fallback: retry with exponential backoff, max 30 attempts (~4 min)
      var key='__synapse_sync_retries';
      var count=parseInt(sessionStorage.getItem(key)||'0',10)+1;
      sessionStorage.setItem(key,String(count));
      if(count>30){
        sessionStorage.removeItem(key);
        document.getElementById('sync-msg').innerHTML=
          '<p style="font-size:14px;color:#f87171;margin:0 0 8px">Preview timed out</p>'+
          '<p style="font-size:12px;color:#666;margin:0 0 12px">The dev theme may still be syncing.</p>'+
          '<button onclick="sessionStorage.removeItem(\\''+key+'\\');location.reload()" style="padding:6px 16px;border:1px solid #444;border-radius:6px;background:transparent;color:#aaa;cursor:pointer;font-size:13px">Retry</button>';
      } else {
        // Exponential backoff: 4s, 5s, 6s... up to 15s max
        var delay=Math.min(4000+count*500,15000);
        setTimeout(function(){location.reload()},delay);
      }
    })();
  </script>
</body></html>`;

async function resolveConnection(userId: string, projectId: string) {
  const tokenManager = new ShopifyTokenManager();
  return tokenManager.getActiveConnection(userId, { projectId });
}

function buildShopifyUrl(storeDomain: string, themeId: string, pathParam: string) {
  const domain = storeDomain.replace(/^https?:\/\//, '');
  const url = new URL(
    pathParam.startsWith('/') ? pathParam : `/${pathParam}`,
    `https://${domain}`
  );
  url.searchParams.set('preview_theme_id', themeId);
  return { url, domain };
}

function stripIframeHeaders(shopifyRes: Response): Headers {
  const headers = new Headers();
  const contentType = shopifyRes.headers.get('content-type') || 'text/html';
  headers.set('Content-Type', contentType);

  // Allow browser caching for static assets (CSS, JS, images, fonts)
  // but keep no-cache for HTML pages that need fresh script injection
  const isStatic =
    contentType.includes('javascript') ||
    contentType.includes('css') ||
    contentType.includes('image/') ||
    contentType.includes('font/') ||
    contentType.includes('woff') ||
    contentType.includes('svg');
  headers.set(
    'Cache-Control',
    isStatic ? 'public, max-age=300, stale-while-revalidate=600' : 'no-store, no-cache, must-revalidate'
  );

  const safe = ['content-language', 'vary', 'etag'];
  for (const key of safe) {
    const val = shopifyRes.headers.get(key);
    if (val) headers.set(key, val);
  }
  // DO NOT copy: x-frame-options, content-security-policy
  return headers;
}

/**
 * Build the inline fetch/XHR/sendBeacon interceptor that routes Shopify AJAX
 * through our proxy so CORS doesn't block dynamic content.
 *
 * Key challenges this handles:
 * 1. Relative URLs like `/cart.js` → proxy
 * 2. Absolute store-domain URLs → proxy
 * 3. Absolute page-origin URLs (window.location.origin + '/cart.js') → proxy
 * 4. URLs built from location.pathname which is the proxy path → reconstruct with original store path
 * 5. navigator.sendBeacon (used by Shopify analytics) → proxy
 * 6. Any URL containing .myshopify.com → proxy (catches alternate domains)
 */
function buildInterceptorScript(projectId: string, storeDomain: string, storePath: string): string {
  const proxyBase = `/api/projects/${projectId}/preview?path=`;
  const proxyPrefix = `/api/projects/${projectId}/preview`;
  const storeOrigin = `https://${storeDomain}`;
  // Escape single quotes in the store path for safe JS string embedding
  const safePath = storePath.replace(/'/g, "\\'");
  return `<script data-synapse-interceptor="1">
(function(){
  var O=window.location.origin;
  var P=O+'${proxyBase}';
  var PP='${proxyPrefix}';
  var S='${storeOrigin}';
  var SP='${safePath}';
  // Analytics/tracking URLs that should NOT be proxied.
  // These are fire-and-forget pings that don't need our server in the middle.
  // URLs that should NOT be proxied — analytics pings and static CDN assets
  var SKIP_RX=/\\/monorail|web-pixel|\\/checkouts\\/internal\\/analytics|\\.myshopify\\.com\\/wpm|\\/cdn\\/wpm|\\/\\.well-known\\/|shopify-perf/;
  // Shopify CDN static assets — bypass proxy for ALL Shopify CDN URLs
  var CDN_RX=/^https?:\\/\\/(cdn\\.shopify\\.com|shopify-assets\\.shopifycdn\\.com)\\//;
  function rw(u){
    if(typeof u!=='string')return u;
    // Skip analytics/tracking and static CDN assets — let them go direct
    if(SKIP_RX.test(u)||CDN_RX.test(u))return u;
    // 0. Query-string-only relative URLs (e.g. '?sections=cart-drawer')
    //    The browser would resolve these against the proxy path, losing the
    //    sections param. Prepend the original store path so the proxy
    //    forwards the query string to Shopify correctly.
    if(u.charAt(0)==='?')return P+encodeURIComponent(SP+u);
    // 1. Absolute URL to page origin (e.g. http://localhost:3000/cart.js)
    //    Strip origin prefix and treat as relative
    if(u.startsWith(O+'/')){
      u=u.slice(O.length);
      // fall through to relative checks below
    }
    // 2. URL contains our proxy path prefix (from location.pathname usage)
    //    e.g. /api/projects/.../preview?sections=cart-drawer
    if(u.startsWith(PP)){
      var rest=u.slice(PP.length);
      // If it already has ?path=, merge any extra query params (like
      // sections=) into the path value so they reach Shopify.
      if(rest.indexOf('path=')===0||rest.indexOf('?path=')!==-1){
        try{
          var pu=new URL(u,O);
          var pp=pu.searchParams.get('path')||SP;
          var extras=[];
          pu.searchParams.forEach(function(v,k){
            if(k!=='path')extras.push(k+'='+encodeURIComponent(v));
          });
          if(extras.length){
            var sep=pp.indexOf('?')!==-1?'&':'?';
            return P+encodeURIComponent(pp+sep+extras.join('&'));
          }
        }catch(e){}
        return O+u;
      }
      // Otherwise reconstruct: use original store path + any query string
      var qs=rest.indexOf('?')!==-1?rest.slice(rest.indexOf('?')):'';
      return P+encodeURIComponent(SP+(qs||''));
    }
    // 3. Relative URL (e.g. /cart.js, /search/suggest?q=foo)
    if(u.startsWith('/')&&!u.startsWith('/api/'))return P+encodeURIComponent(u);
    // 4. Absolute store-domain URL
    if(u.startsWith(S))return P+encodeURIComponent(u.slice(S.length));
    // 5. Any .myshopify.com URL (catches alternate/custom domains)
    var m=u.match(/^https?:\\/\\/[^/]*\\.myshopify\\.com(.*)/);
    if(m)return P+encodeURIComponent(m[1]||'/');
    return u;
  }
  // Intercept fetch
  var _f=window.fetch;
  window.fetch=function(i,o){
    if(typeof i==='string'){i=rw(i);}
    else if(i&&typeof i==='object'&&i.url){
      var nu=rw(i.url);
      if(nu!==i.url){try{i=new Request(nu,i);}catch(e){i=nu;}}
    }
    return _f.call(this,i,o);
  };
  // Intercept XMLHttpRequest
  var _o=XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open=function(m,u){
    if(typeof u==='string')arguments[1]=rw(u);
    return _o.apply(this,arguments);
  };
  // Intercept navigator.sendBeacon (used by Shopify analytics/monorail)
  if(navigator.sendBeacon){
    var _b=navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon=function(u,d){return _b(rw(u),d);};
  }
})();
</script>`;
}

/**
 * Inject scripts into the HTML <head>.
 * Order: base tag (for static assets) → interceptor (for AJAX) → bridge (for IDE).
 *
 * Also strips CSP <meta> tags so our injected scripts aren't blocked by
 * Shopify's nonce-based Content Security Policy.
 */
function injectIntoHTML(
  html: string,
  storeDomain: string,
  projectId: string,
  origin: string,
  storePath: string
): string {
  // --- 1. Strip CSP meta tag(s) so our injected scripts are not blocked ---
  // Shopify embeds nonce-based CSP in <meta http-equiv="Content-Security-Policy">
  // Since we already strip the CSP response header, also strip the inline meta.
  html = html.replace(
    /<meta[^>]*http-equiv\s*=\s*["']?Content-Security-Policy["']?[^>]*>/gi,
    ''
  );

  // --- 2. Extract the nonce used by existing scripts (belt-and-suspenders) ---
  // If a nonce is found, add it to our injected scripts so they match if any
  // other CSP mechanism is in play.
  const nonceMatch = html.match(/\bscript[^>]+nonce="([^"]+)"/i);
  const nonce = nonceMatch ? nonceMatch[1] : '';
  const nonceAttr = nonce ? ` nonce="${nonce}"` : '';

  // --- 3. Build injection payload ---
  const baseTag = `<base href="https://${storeDomain}/">`;
  const interceptor = buildInterceptorScript(projectId, storeDomain, storePath)
    .replace('<script ', `<script${nonceAttr} `);
  const bridgeScript = `<script${nonceAttr} src="${origin}/synapse-bridge.js" data-synapse-bridge="1"></script>`;
  const injection = baseTag + interceptor + bridgeScript;

  if (html.includes('<head>')) {
    return html.replace('<head>', `<head>${injection}`);
  } else if (html.includes('<HEAD>')) {
    return html.replace('<HEAD>', `<HEAD>${injection}`);
  }
  return injection + html;
}

/**
 * Forward-friendly fetch headers from the incoming request to Shopify.
 */
function buildForwardHeaders(request: NextRequest): Record<string, string> {
  const h: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (compatible; SynapsePreview/1.0)',
    'Accept-Language': 'en-US,en;q=0.5',
  };
  // Forward Accept so Shopify can return JSON vs HTML
  const accept = request.headers.get('accept');
  if (accept) {
    h['Accept'] = accept;
  } else {
    h['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
  }
  // Forward Content-Type for POST/PUT
  const ct = request.headers.get('content-type');
  if (ct) h['Content-Type'] = ct;
  // Forward X-Requested-With (Shopify AJAX convention)
  const xrw = request.headers.get('x-requested-with');
  if (xrw) h['X-Requested-With'] = xrw;
  // Forward If-None-Match for conditional requests (ETag)
  const ifNoneMatch = request.headers.get('if-none-match');
  if (ifNoneMatch) h['If-None-Match'] = ifNoneMatch;
  // Forward cookies so Shopify can maintain cart/session state.
  // The browser sends its cookies for our origin; we relay them to Shopify.
  const cookie = request.headers.get('cookie');
  if (cookie) {
    // Only forward Shopify-relevant cookies (cart, session, localization)
    const shopifyCookies = cookie
      .split(';')
      .map(c => c.trim())
      .filter(c => {
        const name = c.split('=')[0]?.toLowerCase() ?? '';
        return (
          name.startsWith('_shopify') ||
          name === 'cart' ||
          name === 'cart_currency' ||
          name === 'localization' ||
          name === 'secure_customer_sig' ||
          name.startsWith('_tracking') ||
          name.startsWith('_y') ||
          name.startsWith('_s')
        );
      })
      .join('; ');
    if (shopifyCookies) h['Cookie'] = shopifyCookies;
  }
  return h;
}

/**
 * Rewrite Set-Cookie headers from Shopify to work on our proxy origin.
 * Strips Domain= so the cookie is set for our origin, and ensures SameSite/Secure
 * are compatible with iframe context.
 */
function rewriteSetCookieHeaders(shopifyRes: Response, headers: Headers): void {
  // getSetCookie() is the standard API; fall back to get('set-cookie') which
  // may concatenate multiple Set-Cookie headers into one (non-standard but common).
  let setCookies: string[] = [];
  if (typeof shopifyRes.headers.getSetCookie === 'function') {
    setCookies = shopifyRes.headers.getSetCookie();
  } else {
    const raw = shopifyRes.headers.get('set-cookie');
    if (raw) setCookies = raw.split(/,(?=\s*\w+=)/);
  }
  for (const raw of setCookies) {
    // Strip Domain= attribute so cookie is set for our proxy origin
    let rewritten = raw.replace(/;\s*domain=[^;]*/gi, '');
    // Strip Secure flag if we're on HTTP (local dev)
    rewritten = rewritten.replace(/;\s*secure/gi, '');
    // Set SameSite=Lax for cross-origin iframe compatibility
    rewritten = rewritten.replace(/;\s*samesite=[^;]*/gi, '');
    rewritten += '; SameSite=Lax';
    headers.append('Set-Cookie', rewritten);
  }
}

/* ------------------------------------------------------------------ */
/*  Route params                                                       */
/* ------------------------------------------------------------------ */

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/* ------------------------------------------------------------------ */
/*  GET /api/projects/[projectId]/preview?path=/                       */
/*  Proxies Shopify storefront pages and static AJAX (sections, etc.)  */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const userId = await requireAuth(request);
    const { projectId } = await params;

    const connection = await resolveConnection(userId, projectId);
    if (!connection?.store_domain) {
      return new NextResponse(NO_PREVIEW_HTML('No preview theme configured.'), {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // Per-project dev theme takes precedence; fall back to connection.theme_id
    let themeId = connection.theme_id;
    try {
      const supabase = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      const { data: proj } = await supabase
        .from('projects')
        .select('dev_theme_id')
        .eq('id', projectId)
        .single();
      if (proj?.dev_theme_id) {
        themeId = proj.dev_theme_id;
      }
    } catch {
      // Fall back to connection.theme_id
    }

    if (!themeId) {
      return new NextResponse(NO_PREVIEW_HTML('No preview theme configured.'), {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    const pathParam = request.nextUrl.searchParams.get('path') || '/';
    const otherParams = new URLSearchParams();
    request.nextUrl.searchParams.forEach((v, k) => {
      if (k !== 'path') otherParams.set(k, v);
    });
    const fullPathWithQuery = otherParams.toString()
      ? (pathParam.includes('?') ? `${pathParam}&${otherParams}` : `${pathParam}?${otherParams}`)
      : pathParam;

    // --- Check in-memory cache before hitting Shopify ---
    const cacheKey = getCacheKey(projectId, fullPathWithQuery);
    const cached = getCachedResponse(cacheKey);
    if (cached) {
      const ifNoneMatch = request.headers.get('if-none-match');
      if (ifNoneMatch && cached.etag && ifNoneMatch.trim() === cached.etag.trim()) {
        return new NextResponse(null, {
          status: 304,
          headers: { 'X-Synapse-Cache': 'HIT', ETag: cached.etag },
        });
      }
      // Clone headers so we don't mutate the cached entry
      const h = new Headers();
      cached.headers.forEach((v, k) => h.set(k, v));
      h.set('X-Synapse-Cache', 'HIT');
      return new NextResponse(cached.body, { status: cached.status, headers: h });
    }

    const { url: shopifyUrl, domain } = buildShopifyUrl(
      connection.store_domain,
      String(themeId),
      fullPathWithQuery
    );

    const shopifyRes = await fetch(shopifyUrl.toString(), {
      headers: buildForwardHeaders(request),
      redirect: 'follow',
    });

    // Forward 304 Not Modified from Shopify
    if (shopifyRes.status === 304) {
      const etag = shopifyRes.headers.get('etag');
      const h = new Headers();
      if (etag) h.set('ETag', etag);
      h.set('X-Synapse-Cache', 'MISS');
      return new NextResponse(null, { status: 304, headers: h });
    }

    if (!shopifyRes.ok) {
      // 422 = theme has no renderable templates yet (dev theme still syncing)
      // 503 = service unavailable — empty dev theme not yet populated
      // Both indicate the background push hasn't finished; show auto-retry page.
      if (shopifyRes.status === 422 || shopifyRes.status === 503) {
        return new NextResponse(SYNCING_PREVIEW_HTML, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }
      return new NextResponse(NO_PREVIEW_HTML(`Shopify returned ${shopifyRes.status}`), {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    const contentType = shopifyRes.headers.get('content-type') || 'text/html';
    const etag = shopifyRes.headers.get('etag');

    // If-None-Match: return 304 when client's ETag matches Shopify's
    const ifNoneMatch = request.headers.get('if-none-match');
    if (ifNoneMatch && etag && ifNoneMatch.trim() === etag.trim()) {
      const h = new Headers();
      h.set('ETag', etag);
      h.set('X-Synapse-Cache', 'MISS');
      return new NextResponse(null, { status: 304, headers: h });
    }

    const body = await shopifyRes.arrayBuffer();
    const headers = stripIframeHeaders(shopifyRes);
    // Forward Shopify cookies to the client (rewritten for our origin)
    rewriteSetCookieHeaders(shopifyRes, headers);

    // HTML responses: only inject into full page documents, NOT section
    // rendering fragments (which are also text/html but lack <head>/<html>).
    // Injecting into fragments corrupts the HTML that theme JS parses for
    // drawer/cart/search content, causing permanent skeleton states.
    if (contentType.includes('text/html')) {
      const html = new TextDecoder().decode(body);
      const isFullPage =
        /<!doctype\s+html/i.test(html) ||
        /<html[\s>]/i.test(html) ||
        /<head[\s>]/i.test(html);

      if (isFullPage) {
        const origin = request.nextUrl.origin;
        const rewritten = injectIntoHTML(html, domain, projectId, origin, pathParam);
        const respBody = new TextEncoder().encode(rewritten);
        headers.set('X-Synapse-Cache', 'MISS');
        // HTML: getCacheTTL returns 0, so we don't cache
        const ttl = getCacheTTL(contentType);
        if (ttl > 0) {
          setCachedResponse(cacheKey, {
            body: respBody.buffer as ArrayBuffer,
            headers,
            status: 200,
            isFullPage: true,
            timestamp: Date.now(),
            contentType,
            etag: etag ?? undefined,
          });
        }
        return new NextResponse(rewritten, { status: 200, headers });
      }

      // HTML fragment (section rendering, etc.) — cache with shorter TTL
      const fragBody = new TextEncoder().encode(html);
      headers.set('X-Synapse-Cache', 'MISS');
      const fragTtl = getCacheTTL(contentType);
      if (fragTtl > 0) {
        setCachedResponse(cacheKey, {
          body: fragBody.buffer as ArrayBuffer,
          headers,
          status: 200,
          isFullPage: false,
          timestamp: Date.now(),
          contentType,
          etag: etag ?? undefined,
        });
      }
      return new NextResponse(html, { status: 200, headers });
    }

    // Non-HTML (JSON, JS, CSS, images) — cache as fragment
    headers.set('X-Synapse-Cache', 'MISS');
    const assetTtl = getCacheTTL(contentType);
    if (assetTtl > 0) {
      setCachedResponse(cacheKey, {
        body,
        headers,
        status: 200,
        isFullPage: false,
        timestamp: Date.now(),
        contentType,
        etag: etag ?? undefined,
      });
    }
    return new NextResponse(body, { status: 200, headers });
  } catch (error) {
    return handleAPIError(error);
  }
}

/* ------------------------------------------------------------------ */
/*  POST /api/projects/[projectId]/preview?path=/cart/add.js           */
/*  Proxies Shopify AJAX mutations (cart, forms, etc.)                 */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const userId = await requireAuth(request);
    const { projectId } = await params;

    const connection = await resolveConnection(userId, projectId);
    if (!connection?.store_domain) {
      return NextResponse.json({ error: 'No preview theme configured' }, { status: 400 });
    }

    // Per-project dev theme takes precedence
    let themeIdPost = connection.theme_id;
    try {
      const supabase = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      const { data: proj } = await supabase
        .from('projects')
        .select('dev_theme_id')
        .eq('id', projectId)
        .single();
      if (proj?.dev_theme_id) {
        themeIdPost = proj.dev_theme_id;
      }
    } catch {
      // Fall back to connection.theme_id
    }

    if (!themeIdPost) {
      return NextResponse.json({ error: 'No preview theme configured' }, { status: 400 });
    }

    const pathParam = request.nextUrl.searchParams.get('path') || '/';
    const { url: shopifyUrl } = buildShopifyUrl(
      connection.store_domain,
      String(themeIdPost),
      pathParam
    );

    // Forward the request body
    const reqBody = await request.arrayBuffer();

    const shopifyRes = await fetch(shopifyUrl.toString(), {
      method: 'POST',
      headers: buildForwardHeaders(request),
      body: reqBody.byteLength > 0 ? reqBody : undefined,
      redirect: 'follow',
    });

    const contentType = shopifyRes.headers.get('content-type') || 'application/json';
    const body = await shopifyRes.arrayBuffer();

    const headers = new Headers();
    headers.set('Content-Type', contentType);
    headers.set('Cache-Control', 'no-store');
    // Forward Shopify cookies (e.g. cart session)
    rewriteSetCookieHeaders(shopifyRes, headers);

    return new NextResponse(body, { status: shopifyRes.status, headers });
  } catch (error) {
    return handleAPIError(error);
  }
}
