import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/middleware/auth';
import { handleAPIError } from '@/lib/errors/handler';
import { ShopifyTokenManager, decryptToken } from '@/lib/shopify/token-manager';
import { registerPreviewCacheInvalidator } from '@/lib/preview/preview-cache';
import { getStorefrontSessionFromConnection, type StorefrontSessionResult } from '@/lib/shopify/storefront-session';
import { cliPreviewManager } from '@/lib/preview/cli-manager';

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
    return 30 * 1000; // 30 seconds — short enough that pushes reflect quickly
  if (contentType.includes('text/html'))
    return 3 * 1000; // 3 seconds — prevents duplicate fetches on rapid navigation/back-nav
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
function invalidatePreviewCache(projectId: string) {
  for (const key of previewCache.keys()) {
    if (key.startsWith(`${projectId}::`)) {
      previewCache.delete(key);
    }
  }
}

registerPreviewCacheInvalidator(invalidatePreviewCache);

/* ------------------------------------------------------------------ */
/*  Shared helpers                                                     */
/* ------------------------------------------------------------------ */

const NO_PREVIEW_HTML = (msg: string) =>
  `<html><body style="font-family:system-ui;color:oklch(0.637 0 0);display:flex;align-items:center;justify-content:center;height:100vh;margin:0">${msg}</body></html>`;

/**
 * Empty state shown when no Theme Access password is configured.
 * Contains a "Connect Theme Access" button that posts a message to the
 * parent frame so PreviewPanel can open the session modal.
 */
const CONNECT_PREVIEW_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Synapse Preview</title></head>
<body style="font-family:system-ui;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;background:#0a0a0a;color:#a1a1aa">
  <div style="text-align:center;max-width:480px;padding:0 24px">
    <div style="width:72px;height:72px;border-radius:18px;background:rgba(56,189,248,.08);border:1px solid rgba(56,189,248,.15);display:flex;align-items:center;justify-content:center;margin:0 auto 28px">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
    </div>
    <p style="font-size:20px;font-weight:700;color:#f4f4f5;margin:0 0 12px;letter-spacing:-0.01em">Connect Theme Access</p>
    <p style="font-size:14px;line-height:1.6;color:#71717a;margin:0 0 32px">
      To preview your draft theme in this panel, connect a Theme Access password from your Shopify store.
    </p>
    <button onclick="window.parent.postMessage({type:'synapse-open-session-modal'},'*')"
      style="padding:14px 36px;border:none;border-radius:10px;background:#28CD56;color:#fff;font-size:15px;font-weight:600;cursor:pointer;transition:background .15s;letter-spacing:-0.01em"
      onmouseover="this.style.background='#22b84a'" onmouseout="this.style.background='#28CD56'">
      Connect Theme Access
    </button>
    <p style="font-size:12px;color:#52525b;margin:20px 0 0">
      Install the <a href="https://apps.shopify.com/theme-access" target="_blank" rel="noopener" style="color:#38bdf8;text-decoration:underline">Theme Access app</a> in your Shopify admin to get a password.
    </p>
  </div>
</body></html>`;

/**
 * Error state shown when TKA password exists but is rejected by Shopify.
 */
const TKA_INVALID_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Synapse Preview</title></head>
<body style="font-family:system-ui;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;background:#0a0a0a;color:#a1a1aa">
  <div style="text-align:center;max-width:340px">
    <div style="width:48px;height:48px;border-radius:12px;background:rgba(239,68,68,.08);display:flex;align-items:center;justify-content:center;margin:0 auto 20px">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
      </svg>
    </div>
    <p style="font-size:15px;font-weight:600;color:#e4e4e7;margin:0 0 8px">Theme Access Disconnected</p>
    <p style="font-size:13px;line-height:1.5;color:#71717a;margin:0 0 24px">
      The stored password was not accepted by Shopify. It may have been revoked or expired.
    </p>
    <button onclick="window.parent.postMessage({type:'synapse-open-session-modal'},'*')"
      style="padding:10px 24px;border:none;border-radius:8px;background:#28CD56;color:#fff;font-size:13px;font-weight:600;cursor:pointer;transition:background .15s">
      Reconnect
    </button>
  </div>
</body></html>`;

/**
 * Shown when TKA is configured but the CLI dev server isn't running yet.
 * Prompts the user to click "Start Preview" in the toolbar.
 */
const START_CLI_PREVIEW_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Synapse Preview</title></head>
<body style="font-family:system-ui;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;background:#0a0a0a;color:#a1a1aa">
  <div style="text-align:center;max-width:480px;padding:0 24px">
    <div style="width:72px;height:72px;border-radius:18px;background:rgba(56,189,248,.08);border:1px solid rgba(56,189,248,.15);display:flex;align-items:center;justify-content:center;margin:0 auto 28px">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="5 3 19 12 5 21 5 3"/>
      </svg>
    </div>
    <p style="font-size:20px;font-weight:700;color:#f4f4f5;margin:0 0 12px;letter-spacing:-0.01em">Start CLI Preview</p>
    <p style="font-size:14px;line-height:1.6;color:#71717a;margin:0 0 32px">
      Theme Access is connected. Click <strong style="color:#38bdf8;font-weight:600">Start Preview</strong> in the toolbar above, or press the button below to launch the Shopify CLI dev server and preview your draft theme.
    </p>
    <button onclick="window.parent.postMessage({type:'synapse-start-cli-preview'},'*')"
      style="padding:14px 36px;border:none;border-radius:10px;background:#28CD56;color:#fff;font-size:15px;font-weight:600;cursor:pointer;transition:background .15s;letter-spacing:-0.01em"
      onmouseover="this.style.background='#22b84a'" onmouseout="this.style.background='#28CD56'">
      Start Preview
    </button>
  </div>
</body></html>`;

/**
 * Auto-retrying preview page shown while the dev theme is being populated.
 * Shopify returns 422 when the theme has no renderable templates.
 * Retries a few times with long delays, then shows a clear message + manual Retry.
 */
const SYNCING_PREVIEW_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Synapse Preview</title></head>
<body style="font-family:system-ui;color:oklch(0.685 0 0);display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;background:oklch(0.145 0.003 285)">
  <div style="text-align:center" id="sync-msg">
    <div style="width:32px;height:32px;border:2px solid oklch(0.32 0 0);border-top-color:oklch(0.718 0.158 248);border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 16px"></div>
    <p style="font-size:14px;color:oklch(0.734 0 0);margin:0 0 4px">Syncing files to preview theme&hellip;</p>
    <p style="font-size:12px;color:oklch(0.49 0 0);margin:0">Checking again in <span id="countdown">10</span>s</p>
  </div>
  <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
  <script>
    (function(){
      if(window.parent!==window){
        window.parent.postMessage({type:'synapse-preview-syncing',status:'waiting'},'*');
      }
      window.addEventListener('message',function(e){
        if(e.data&&e.data.type==='synapse-preview-refresh'){
          sessionStorage.removeItem('__synapse_sync_retries');
          location.reload();
        }
      });
      var key='__synapse_sync_retries';
      var count=parseInt(sessionStorage.getItem(key)||'0',10)+1;
      sessionStorage.setItem(key,String(count));
      var maxAttempts=6;
      var delay=10000;
      if(count>maxAttempts){
        sessionStorage.removeItem(key);
        document.getElementById('sync-msg').innerHTML=
          '<p style="font-size:14px;color:oklch(0.734 0 0);margin:0 0 8px">Preview theme isn\'t ready</p>'+
          '<p style="font-size:12px;color:oklch(0.49 0 0);margin:0 0 12px">Sync your theme from the project, or try again in a moment.</p>'+
          '<button onclick="sessionStorage.removeItem(\\''+key+'\\');location.reload()" style="padding:8px 20px;border:1px solid oklch(0.368 0 0);border-radius:6px;background:transparent;color:oklch(0.734 0 0);cursor:pointer;font-size:13px">Retry</button>';
      } else {
        var el=document.getElementById('countdown');
        var n=Math.floor(delay/1000);
        var iv=setInterval(function(){
          n--;
          if(el)el.textContent=n;
        },1000);
        setTimeout(function(){clearInterval(iv);location.reload();},delay);
      }
    })();
  </script>
</body></html>`;

async function resolveConnection(userId: string, projectId: string) {
  const tokenManager = new ShopifyTokenManager();
  return tokenManager.getActiveConnection(userId, { projectId });
}

const TKA_DOMAIN = 'theme-kit-access.shopifyapps.com';

function buildShopifyUrl(storeDomain: string, themeId: string, pathParam: string, useTKA = false) {
  const domain = storeDomain.replace(/^https?:\/\//, '');
  const basePath = pathParam.startsWith('/') ? pathParam : `/${pathParam}`;

  const baseUrl = useTKA
    ? `https://${TKA_DOMAIN}/cli/sfr${basePath}`
    : `https://${domain}${basePath}`;

  const url = new URL(baseUrl);
  url.searchParams.set('preview_theme_id', themeId);
  url.searchParams.set('_fd', '0');
  url.searchParams.set('pb', '0');
  return { url, domain };
}

/* ------------------------------------------------------------------ */
/*  Custom-domain resolution                                           */
/*  Shopify redirects myshopify.com → custom domain. Cookies captured  */
/*  from the custom domain are stripped by Node fetch on cross-origin   */
/*  redirects. We discover the real domain once and cache it for 1 h.  */
/* ------------------------------------------------------------------ */
const customDomainCache = new Map<string, { domain: string; ts: number }>();
const DOMAIN_CACHE_TTL = 60 * 60 * 1000;

async function resolveCustomDomain(myshopifyDomain: string): Promise<string> {
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
      return resolved;
    }
  } catch { /* fall through */ }

  return clean;
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
    isStatic ? 'public, max-age=30, stale-while-revalidate=60' : 'no-store, no-cache, must-revalidate'
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
  // Third-party telemetry endpoint that fails CORS inside localhost iframe.
  // Treat it as best-effort and no-op so theme boot code doesn't get noisy rejections.
  var COLLECT_RX=/^https?:\\/\\/dropdeadextensions\\.com\\/api\\/collect(?:[/?#]|$)/i;
  function isCollectUrl(u){
    return typeof u==='string' && COLLECT_RX.test(u);
  }
  function rw(u){
    if(typeof u!=='string')return u;
    // Skip analytics/tracking and static CDN assets — let them go direct
    if(SKIP_RX.test(u)||CDN_RX.test(u))return u;
    // Preserve hash fragment — must stay outside the encoded path param
    var hi=u.indexOf('#'),hash='';
    if(hi!==-1){hash=u.slice(hi);u=u.slice(0,hi);}
    // 0. Query-string-only relative URLs (e.g. '?sections=cart-drawer')
    if(u.charAt(0)==='?'){
      var sep0=SP.indexOf('?')!==-1?'&':'';
      return P+encodeURIComponent(SP+(sep0?sep0+u.slice(1):u))+hash;
    }
    // 1. Absolute URL to page origin (e.g. http://localhost:3000/cart.js)
    if(u.startsWith(O+'/')){u=u.slice(O.length);}
    // 2. URL contains our proxy path prefix (from location.pathname usage)
    if(u.startsWith(PP)){
      var rest=u.slice(PP.length);
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
            return P+encodeURIComponent(pp+sep+extras.join('&'))+hash;
          }
        }catch(e){}
        return O+u+hash;
      }
      var qs=rest.indexOf('?')!==-1?rest.slice(rest.indexOf('?')):'';
      if(qs&&SP.indexOf('?')!==-1)qs='&'+qs.slice(1);
      return P+encodeURIComponent(SP+(qs||''))+hash;
    }
    // 3. Relative URL (e.g. /cart.js, /search/suggest?q=foo)
    if(u.startsWith('/')&&!u.startsWith('/api/'))return P+encodeURIComponent(u)+hash;
    // 4. Absolute store-domain URL
    if(u.startsWith(S))return P+encodeURIComponent(u.slice(S.length))+hash;
    // 5. Any .myshopify.com URL (catches alternate/custom domains)
    var m=u.match(/^https?:\\/\\/[^/]*\\.myshopify\\.com(.*)/);
    if(m)return P+encodeURIComponent(m[1]||'/')+hash;
    return u+hash;
  }
  // Intercept fetch
  var _f=window.fetch;
  window.fetch=function(i,o){
    if(typeof i==='string' && isCollectUrl(i)){
      return Promise.resolve(new Response(null,{status:204,statusText:'No Content'}));
    }
    if(i&&typeof i==='object'&&i.url&&isCollectUrl(i.url)){
      return Promise.resolve(new Response(null,{status:204,statusText:'No Content'}));
    }
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
    navigator.sendBeacon=function(u,d){
      if(isCollectUrl(u))return true;
      return _b(rw(u),d);
    };
  }
  // Intercept <a> link clicks for in-iframe navigation
  document.addEventListener('click',function(e){
    if(e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;
    var el=e.target;
    while(el&&el.tagName!=='A')el=el.parentElement;
    if(!el||!el.href)return;
    var raw=el.getAttribute('href');
    if(!raw||raw.charAt(0)==='#')return;
    if(/^(javascript|mailto|tel):/i.test(el.href))return;
    if(el.hasAttribute('download'))return;
    var tgt=(el.getAttribute('target')||'').toLowerCase();
    if(tgt==='_blank')return;
    var rewritten=rw(el.href);
    if(rewritten!==el.href){
      e.preventDefault();
      window.location.href=rewritten;
    }
  },true);
  // Intercept form submissions
  document.addEventListener('submit',function(e){
    var form=e.target;
    if(!form||!form.action)return;
    var rewritten=rw(form.action);
    if(rewritten!==form.action){form.action=rewritten;}
  },true);
  // Intercept location.assign / location.replace
  try{
    var _la=Location.prototype.assign;
    var _lr=Location.prototype.replace;
    Location.prototype.assign=function(u){return _la.call(this,rw(u));};
    Location.prototype.replace=function(u){return _lr.call(this,rw(u));};
  }catch(e){}
  // Intercept location.href setter
  try{
    var desc=Object.getOwnPropertyDescriptor(Location.prototype,'href');
    if(desc&&desc.set){
      var _hs=desc.set;
      Object.defineProperty(Location.prototype,'href',{
        set:function(v){return _hs.call(this,rw(v));},
        get:desc.get,
        configurable:true
      });
    }
  }catch(e){}
  // Intercept history.pushState / replaceState.
  // Some themes navigate with relative paths (e.g. "/collections/all"),
  // so rewrite those through the proxy as well.
  var _ps=history.pushState;
  var _rs=history.replaceState;
  function rwNav(u){
    if(typeof u!=='string')return u;
    if(
      u.startsWith(S) ||
      /^https?:\\/\\/[^/]*\\.myshopify\\.com/.test(u) ||
      u.startsWith(O + '/') ||
      u.startsWith(PP) ||
      u.startsWith('/') ||
      u.startsWith('?')
    ) return rw(u);
    return u;
  }
  history.pushState=function(s,t,u){return _ps.call(this,s,t,u!=null?rwNav(String(u)):u);};
  history.replaceState=function(s,t,u){return _rs.call(this,s,t,u!=null?rwNav(String(u)):u);};
})();
</script>`;
}

/**
 * Inject scripts into the HTML <head>.
 * Order: block CORS-failing third-party requests → base tag → interceptor → bridge.
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

interface ForwardHeaderOptions {
  sessionCookie?: string;
  storefrontToken?: string;
  /** Theme Kit Access: store .myshopify.com domain for X-Shopify-Shop */
  tkaStoreDomain?: string;
  /** Theme Kit Access: shptka_* password for X-Shopify-Access-Token */
  tkaPassword?: string;
}

/**
 * Forward-friendly fetch headers from the incoming request to Shopify.
 *
 * Standard session: Authorization: Bearer {storefrontToken} + Cookie
 * TKA session: adds X-Shopify-Shop + X-Shopify-Access-Token: shptka_*
 */
function buildForwardHeaders(
  request: NextRequest,
  opts: ForwardHeaderOptions = {},
): Record<string, string> {
  const { sessionCookie, storefrontToken, tkaStoreDomain, tkaPassword } = opts;
  const h: Record<string, string> = {
    'User-Agent': 'Shopify CLI; v=synapse',
    'Accept-Language': 'en-US,en;q=0.5',
  };
  const accept = request.headers.get('accept');
  if (accept) {
    h['Accept'] = accept;
  } else {
    h['Accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
  }
  const ct = request.headers.get('content-type');
  if (ct) h['Content-Type'] = ct;
  const xrw = request.headers.get('x-requested-with');
  if (xrw) h['X-Requested-With'] = xrw;
  const ifNoneMatch = request.headers.get('if-none-match');
  if (ifNoneMatch) h['If-None-Match'] = ifNoneMatch;

  const cookie = request.headers.get('cookie');
  if (cookie) {
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
          name.startsWith('_s') ||
          name.startsWith('_orig_referrer') ||
          name.startsWith('_landing_page')
        );
      })
      .join('; ');
    if (shopifyCookies) h['Cookie'] = shopifyCookies;
  }

  if (sessionCookie) {
    h['Cookie'] = h['Cookie'] ? `${h['Cookie']}; ${sessionCookie}` : sessionCookie;
  }

  if (storefrontToken) {
    h['Authorization'] = `Bearer ${storefrontToken}`;
  }

  // TKA headers — Shopify CLI sends these when using a theme access password
  if (tkaPassword) {
    h['X-Shopify-Access-Token'] = tkaPassword;
  }
  if (tkaStoreDomain) {
    h['X-Shopify-Shop'] = tkaStoreDomain.replace(/^https?:\/\//, '');
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
/*  Manual redirect following (preserves auth headers + preview_theme_id) */
/* ------------------------------------------------------------------ */

async function fetchWithManualRedirects(
  url: string,
  headers: Record<string, string>,
  themeId: string,
  opts?: { isTKA?: boolean },
  maxRedirects = 5,
): Promise<Response> {
  let currentUrl = url;
  const isTKA = opts?.isTKA ?? false;
  console.log(`[Preview Fetch] START url=${currentUrl} isTKA=${isTKA}`);
  for (let i = 0; i < maxRedirects; i++) {
    const res = await fetch(currentUrl, {
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(25_000),
    });

    console.log(`[Preview Fetch] Step ${i}: ${res.status} url=${currentUrl}`);
    if (res.status < 300 || res.status >= 400) return res;

    const location = res.headers.get('location');
    if (!location) return res;

    const nextUrl = new URL(location, currentUrl);

    // If TKA redirects us to the store domain, the TKA password is invalid.
    // Return a synthetic 401 instead of following (which would serve the published theme).
    if (isTKA && nextUrl.hostname !== TKA_DOMAIN) {
      console.log(`[Preview Fetch] TKA redirected to store domain ${nextUrl.hostname} — password invalid`);
      return new Response('Theme Access password not accepted by Shopify', { status: 401 });
    }

    if (!nextUrl.searchParams.has('preview_theme_id')) {
      nextUrl.searchParams.set('preview_theme_id', themeId);
    }
    console.log(`[Preview Fetch] Redirect → ${nextUrl.toString()}`);
    currentUrl = nextUrl.toString();
  }
  return fetch(currentUrl, { headers, redirect: 'follow', signal: AbortSignal.timeout(25_000) });
}

type ParityIssueCategory = 'auth-cookie' | 'missing-local-file' | 'app-endpoint' | 'proxy-rewrite' | 'upstream-other';

function isParityDiagnosticEnabled(request: NextRequest): boolean {
  const qp = request.nextUrl.searchParams.get('diag');
  return qp === '1' || process.env.PREVIEW_PARITY_DIAG === '1';
}

function classifyParityIssue(status: number, pathParam: string): { category: ParityIssueCategory; reason: string } {
  const pathOnly = pathParam.split('?')[0] || '/';
  const isAsset =
    /\.(?:js|css|map|json|svg|png|jpe?g|gif|webp|ico|woff2?|ttf|eot)$/i.test(pathOnly);
  const isAppEndpoint =
    /^\/(?:apps|app_proxy|tools|a\/|api\/)/i.test(pathOnly) ||
    /shopify|checkout|wpm|monorail|analytics/i.test(pathParam);

  if (status === 401 || status === 403) {
    return { category: 'auth-cookie', reason: 'Upstream rejected session or auth context' };
  }
  if (status === 404 && isAsset) {
    return { category: 'missing-local-file', reason: 'Asset not found in local CLI theme output' };
  }
  if (isAppEndpoint) {
    return { category: 'app-endpoint', reason: 'Third-party/app endpoint mismatch in proxied context' };
  }
  if (status === 404) {
    return { category: 'proxy-rewrite', reason: 'Page path likely escaped rewrite or upstream route mismatch' };
  }
  return { category: 'upstream-other', reason: `Unhandled upstream status ${status}` };
}

/* ------------------------------------------------------------------ */
/*  CLI dev server proxy                                               */
/*  When the Shopify CLI `theme dev` is running, we proxy through it.  */
/*  This gives us correct draft-theme rendering because the CLI uses   */
/*  the replace_templates API internally.                               */
/* ------------------------------------------------------------------ */

async function proxyCLIDevServer(
  request: NextRequest,
  projectId: string,
  cliPort: number,
  storeDomain: string,
): Promise<NextResponse> {
  const pathParam = request.nextUrl.searchParams.get('path') || '/';
  const cliUrl = `http://127.0.0.1:${cliPort}${pathParam}`;
  const domain = storeDomain.replace(/^https?:\/\//, '');
  const parityDiag = isParityDiagnosticEnabled(request);

  try {
    const fwdHeaders: Record<string, string> = {};
    const accept = request.headers.get('accept');
    if (accept) fwdHeaders['Accept'] = accept;
    const cookie = request.headers.get('cookie');
    if (cookie) fwdHeaders['Cookie'] = cookie;
    const ct = request.headers.get('content-type');
    if (ct) fwdHeaders['Content-Type'] = ct;
    const xrw = request.headers.get('x-requested-with');
    if (xrw) fwdHeaders['X-Requested-With'] = xrw;

    const cliRes = await fetch(cliUrl, {
      headers: fwdHeaders,
      redirect: 'follow',
      signal: AbortSignal.timeout(25_000),
    });

    const contentType = cliRes.headers.get('content-type') || 'text/html';
    const body = await cliRes.arrayBuffer();
    const headers = stripIframeHeaders(cliRes);
    rewriteSetCookieHeaders(cliRes, headers);
    headers.set('X-Synapse-Preview-Session', 'cli');
    if (parityDiag && cliRes.status >= 400) {
      const issue = classifyParityIssue(cliRes.status, pathParam);
      headers.set('X-Synapse-Preview-Diag', issue.category);
      console.warn(
        `[Preview Parity] GET ${pathParam} -> ${cliRes.status} (${issue.category}) reason="${issue.reason}" contentType="${contentType}"`
      );
    }

    if (contentType.includes('text/html')) {
      const html = new TextDecoder().decode(body);
      const isFullPage =
        /<!doctype\s+html/i.test(html) ||
        /<html[\s>]/i.test(html) ||
        /<head[\s>]/i.test(html);

      if (isFullPage) {
        const origin = request.nextUrl.origin;
        const rewritten = injectIntoHTML(html, domain, projectId, origin, pathParam);
        return new NextResponse(rewritten, { status: cliRes.status, headers });
      }
    }

    return new NextResponse(body, { status: cliRes.status, headers });
  } catch (error) {
    const isTimeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    if (isTimeout) {
      return new NextResponse(
        NO_PREVIEW_HTML('CLI preview timed out. The dev server may be starting up — try refreshing.'),
        { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
      );
    }
    console.error(`[CLI Preview Proxy] Error:`, error instanceof Error ? error.message : error);
    return new NextResponse(
      NO_PREVIEW_HTML('CLI preview server is not responding. It may have stopped.'),
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Dev store proxy                                                     */
/*  Proxies the published theme on a secondary dev store. No            */
/*  preview_theme_id needed — the theme is published, so Shopify        */
/*  renders it by default. TKA is only used to bypass storefront        */
/*  password protection.                                                */
/* ------------------------------------------------------------------ */

async function proxyDevStoreStorefront(
  request: NextRequest,
  projectId: string,
): Promise<NextResponse> {
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: project } = await supabase
    .from('projects')
    .select('preview_connection_id')
    .eq('id', projectId)
    .single();

  if (!project?.preview_connection_id) {
    return new NextResponse(
      NO_PREVIEW_HTML('Connect a dev store in Settings to enable embedded preview.'),
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }

  const { data: conn } = await supabase
    .from('shopify_connections')
    .select('store_domain, theme_access_password_encrypted')
    .eq('id', project.preview_connection_id)
    .single();

  if (!conn?.store_domain) {
    return new NextResponse(
      NO_PREVIEW_HTML('Dev store connection not found. Please reconnect.'),
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }

  const domain = conn.store_domain.replace(/^https?:\/\//, '');
  const pathParam = request.nextUrl.searchParams.get('path') || '/';

  const fullPathWithQuery = `devstore::${pathParam}${request.nextUrl.search || ''}`;
  const cacheKey = getCacheKey(projectId, fullPathWithQuery);
  const cached = getCachedResponse(cacheKey);
  if (cached) {
    const headers = new Headers();
    cached.headers.forEach((v, k) => headers.set(k, v));
    headers.set('X-Synapse-Preview-Session', 'devstore');
    headers.set('X-Synapse-Cache', 'HIT');
    if (cached.isFullPage && cached.contentType.includes('text/html')) {
      const html = new TextDecoder().decode(cached.body);
      const origin = request.nextUrl.origin;
      const rewritten = injectIntoHTML(html, domain, projectId, origin, pathParam);
      return new NextResponse(rewritten, { status: cached.status, headers });
    }
    return new NextResponse(cached.body, { status: cached.status, headers });
  }

  try {
    const basePath = pathParam.startsWith('/') ? pathParam : `/${pathParam}`;
    const url = new URL(`https://${domain}${basePath}`);
    url.searchParams.set('_fd', '0');
    url.searchParams.set('pb', '0');

    const fwdHeaders = buildForwardHeaders(request, {
      tkaStoreDomain: domain,
      tkaPassword: conn.theme_access_password_encrypted
        ? decryptToken(conn.theme_access_password_encrypted)
        : undefined,
    });

    const shopifyRes = await fetchWithManualRedirects(
      url.toString(),
      fwdHeaders,
      undefined,
      { isTKA: false },
    );

    if (shopifyRes.status === 401) {
      return new NextResponse(
        NO_PREVIEW_HTML('Dev store authentication failed. Check that the Theme Access app is installed.'),
        { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
      );
    }

    const contentType = shopifyRes.headers.get('content-type') || 'text/html';
    const body = await shopifyRes.arrayBuffer();
    const headers = stripIframeHeaders(shopifyRes);
    rewriteSetCookieHeaders(shopifyRes, headers);
    headers.set('X-Synapse-Preview-Session', 'devstore');

    if (contentType.includes('text/html')) {
      const html = new TextDecoder().decode(body);
      const isFullPage =
        /<!doctype\s+html/i.test(html) ||
        /<html[\s>]/i.test(html) ||
        /<head[\s>]/i.test(html);

      setCachedResponse(cacheKey, {
        body, headers, status: shopifyRes.status, isFullPage,
        timestamp: Date.now(), contentType,
        etag: shopifyRes.headers.get('etag') ?? undefined,
      });

      if (isFullPage) {
        const origin = request.nextUrl.origin;
        const rewritten = injectIntoHTML(html, domain, projectId, origin, pathParam);
        return new NextResponse(rewritten, { status: shopifyRes.status, headers });
      }
    } else {
      setCachedResponse(cacheKey, {
        body, headers, status: shopifyRes.status, isFullPage: false,
        timestamp: Date.now(), contentType,
        etag: shopifyRes.headers.get('etag') ?? undefined,
      });
    }

    return new NextResponse(body, { status: shopifyRes.status, headers });
  } catch (error) {
    console.error('[Dev Store Proxy] Error:', error instanceof Error ? error.message : error);
    return new NextResponse(
      NO_PREVIEW_HTML('Dev store preview error. Try refreshing.'),
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }
}

async function proxyDevStorePost(
  request: NextRequest,
  projectId: string,
): Promise<NextResponse> {
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: project } = await supabase
    .from('projects')
    .select('preview_connection_id')
    .eq('id', projectId)
    .single();

  if (!project?.preview_connection_id) {
    return NextResponse.json({ error: 'No dev store connected' }, { status: 503 });
  }

  const { data: conn } = await supabase
    .from('shopify_connections')
    .select('store_domain, theme_access_password_encrypted')
    .eq('id', project.preview_connection_id)
    .single();

  if (!conn?.store_domain) {
    return NextResponse.json({ error: 'Dev store connection not found' }, { status: 503 });
  }

  const domain = conn.store_domain.replace(/^https?:\/\//, '');
  const pathParam = request.nextUrl.searchParams.get('path') || '/';
  const basePath = pathParam.startsWith('/') ? pathParam : `/${pathParam}`;
  const url = new URL(`https://${domain}${basePath}`);
  url.searchParams.set('_fd', '0');
  url.searchParams.set('pb', '0');

  const fwdHeaders = buildForwardHeaders(request, {
    tkaStoreDomain: domain,
    tkaPassword: conn.theme_access_password_encrypted
      ? decryptToken(conn.theme_access_password_encrypted)
      : undefined,
  });

  const reqBody = await request.arrayBuffer();
  const shopifyRes = await fetch(url.toString(), {
    method: 'POST',
    headers: fwdHeaders,
    body: reqBody.byteLength > 0 ? reqBody : undefined,
    redirect: 'follow',
    signal: AbortSignal.timeout(25_000),
  });

  const contentType = shopifyRes.headers.get('content-type') || 'application/json';
  const body = await shopifyRes.arrayBuffer();
  const headers = new Headers();
  headers.set('Content-Type', contentType);
  headers.set('Cache-Control', 'no-store');
  rewriteSetCookieHeaders(shopifyRes, headers);

  return new NextResponse(body, { status: shopifyRes.status, headers });
}

/* ------------------------------------------------------------------ */
/*  TKA storefront proxy                                               */
/*  When the CLI is not running, proxy directly through the TKA        */
/*  endpoint (theme-kit-access.shopifyapps.com). This uses Shopify's   */
/*  native Liquid renderer and requires no local tooling.              */
/* ------------------------------------------------------------------ */

interface ShopifyConnectionForProxy {
  store_domain: string;
  access_token_encrypted: string;
  theme_access_password_encrypted?: string | null;
  online_token_encrypted?: string | null;
  online_token_expires_at?: string | null;
}

async function proxyShopifyStorefront(
  request: NextRequest,
  projectId: string,
  connection: ShopifyConnectionForProxy,
  themeId: string,
): Promise<NextResponse> {
  const pathParam = request.nextUrl.searchParams.get('path') || '/';
  const parityDiag = isParityDiagnosticEnabled(request);
  const domain = connection.store_domain.replace(/^https?:\/\//, '');

  // Check in-memory cache first
  const fullPathWithQuery = pathParam + (request.nextUrl.search || '');
  const cacheKey = getCacheKey(projectId, fullPathWithQuery);
  const cached = getCachedResponse(cacheKey);
  if (cached) {
    const headers = new Headers();
    cached.headers.forEach((v, k) => headers.set(k, v));
    headers.set('X-Synapse-Preview-Session', 'proxy');
    headers.set('X-Synapse-Cache', 'HIT');
    if (cached.isFullPage && cached.contentType.includes('text/html')) {
      const html = new TextDecoder().decode(cached.body);
      const origin = request.nextUrl.origin;
      const rewritten = injectIntoHTML(html, domain, projectId, origin, pathParam);
      return new NextResponse(rewritten, { status: cached.status, headers });
    }
    return new NextResponse(cached.body, { status: cached.status, headers });
  }

  try {
    const session = await getStorefrontSessionFromConnection(connection, themeId);
    if (!session) {
      return new NextResponse(
        NO_PREVIEW_HTML('Could not establish a preview session with Shopify. Check your Theme Access password.'),
        { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
      );
    }

    const isTKA = 'isTKA' in session && session.isTKA === true;
    const { url } = buildShopifyUrl(domain, themeId, pathParam, isTKA);

    const fwdHeaders = buildForwardHeaders(request, {
      sessionCookie: session.cookie,
      storefrontToken: session.storefrontToken,
      tkaStoreDomain: isTKA ? domain : undefined,
      tkaPassword: isTKA ? (session as { themeAccessPassword: string }).themeAccessPassword : undefined,
    });

    const shopifyRes = await fetchWithManualRedirects(
      url.toString(),
      fwdHeaders,
      themeId,
      { isTKA },
    );

    if (shopifyRes.status === 401) {
      return new NextResponse(TKA_INVALID_HTML, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'X-Synapse-Preview-Session': 'invalid',
        },
      });
    }

    if (shopifyRes.status === 422) {
      return new NextResponse(SYNCING_PREVIEW_HTML, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    const contentType = shopifyRes.headers.get('content-type') || 'text/html';
    const body = await shopifyRes.arrayBuffer();
    const headers = stripIframeHeaders(shopifyRes);
    rewriteSetCookieHeaders(shopifyRes, headers);
    headers.set('X-Synapse-Preview-Session', isTKA ? 'tka' : 'storefront');

    if (parityDiag && shopifyRes.status >= 400) {
      const issue = classifyParityIssue(shopifyRes.status, pathParam);
      headers.set('X-Synapse-Preview-Diag', issue.category);
    }

    if (contentType.includes('text/html')) {
      const html = new TextDecoder().decode(body);
      const isFullPage =
        /<!doctype\s+html/i.test(html) ||
        /<html[\s>]/i.test(html) ||
        /<head[\s>]/i.test(html);

      // Cache the raw HTML before injection
      setCachedResponse(cacheKey, {
        body,
        headers,
        status: shopifyRes.status,
        isFullPage,
        timestamp: Date.now(),
        contentType,
        etag: shopifyRes.headers.get('etag') ?? undefined,
      });

      if (isFullPage) {
        const origin = request.nextUrl.origin;
        const rewritten = injectIntoHTML(html, domain, projectId, origin, pathParam);
        return new NextResponse(rewritten, { status: shopifyRes.status, headers });
      }
    } else {
      setCachedResponse(cacheKey, {
        body,
        headers,
        status: shopifyRes.status,
        isFullPage: false,
        timestamp: Date.now(),
        contentType,
        etag: shopifyRes.headers.get('etag') ?? undefined,
      });
    }

    return new NextResponse(body, { status: shopifyRes.status, headers });
  } catch (error) {
    const isTimeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    if (isTimeout) {
      return new NextResponse(
        NO_PREVIEW_HTML('Preview request timed out. The store may be slow — try refreshing.'),
        { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
      );
    }
    console.error('[TKA Proxy] Error:', error instanceof Error ? error.message : error);
    return new NextResponse(
      NO_PREVIEW_HTML('Preview proxy error. Try refreshing.'),
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
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

    const requestedMode = request.nextUrl.searchParams.get('mode');

    // ── Dev store proxy ──────────────────────────────────────────
    // When mode=devstore, proxy through the dev store's published theme.
    // No preview_theme_id needed since the theme is published on the dev store.
    if (requestedMode === 'devstore') {
      return proxyDevStoreStorefront(request, projectId);
    }

    // ── CLI dev server proxy ─────────────────────────────────────
    // Only proxy through CLI when explicitly requested via mode=cli.
    // This prevents CLI from silently hijacking the TKA proxy when both are available.
    const cliPort = cliPreviewManager.getPort(projectId);
    if (cliPort && requestedMode === 'cli') {
      return proxyCLIDevServer(request, projectId, cliPort, connection.store_domain);
    }

    // No TKA password → show connect empty state
    if (!connection.theme_access_password_encrypted) {
      return new NextResponse(CONNECT_PREVIEW_HTML, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'X-Synapse-Preview-Session': 'none',
        },
      });
    }

    // mode=cli was requested but CLI isn't running → prompt to start it
    if (requestedMode === 'cli') {
      return new NextResponse(START_CLI_PREVIEW_HTML, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'X-Synapse-Preview-Session': 'tka',
        },
      });
    }

    // Default: proxy through Shopify's TKA endpoint (no CLI needed)
    return proxyShopifyStorefront(request, projectId, connection, String(themeId));
  } catch (error) {
    const isTimeout =
      error instanceof Error &&
      (error.name === 'TimeoutError' || error.name === 'AbortError');
    if (isTimeout) {
      return new NextResponse(
        NO_PREVIEW_HTML('Preview request timed out. The store may be slow — try refreshing.'),
        { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }
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

    // Proxy POST through CLI dev server only when mode=cli is requested
    const cliPort = cliPreviewManager.getPort(projectId);
    const postMode = request.nextUrl.searchParams.get('mode');
    if (cliPort && postMode === 'cli') {
      const pathParam = request.nextUrl.searchParams.get('path') || '/';
      const cliUrl = `http://127.0.0.1:${cliPort}${pathParam}`;
      const parityDiag = isParityDiagnosticEnabled(request);
      const reqBody = await request.arrayBuffer();

      const fwdHeaders: Record<string, string> = {};
      const accept = request.headers.get('accept');
      if (accept) fwdHeaders['Accept'] = accept;
      const cookie = request.headers.get('cookie');
      if (cookie) fwdHeaders['Cookie'] = cookie;
      const ct = request.headers.get('content-type');
      if (ct) fwdHeaders['Content-Type'] = ct;

      const cliRes = await fetch(cliUrl, {
        method: 'POST',
        headers: fwdHeaders,
        body: reqBody.byteLength > 0 ? reqBody : undefined,
        redirect: 'follow',
        signal: AbortSignal.timeout(25_000),
      });

      const contentType = cliRes.headers.get('content-type') || 'application/json';
      const body = await cliRes.arrayBuffer();
      const headers = new Headers();
      headers.set('Content-Type', contentType);
      headers.set('Cache-Control', 'no-store');
      rewriteSetCookieHeaders(cliRes, headers);
      if (parityDiag && cliRes.status >= 400) {
        const issue = classifyParityIssue(cliRes.status, pathParam);
        headers.set('X-Synapse-Preview-Diag', issue.category);
        console.warn(
          `[Preview Parity] POST ${pathParam} -> ${cliRes.status} (${issue.category}) reason="${issue.reason}" contentType="${contentType}"`
        );
      }
      return new NextResponse(body, { status: cliRes.status, headers });
    }

    // Dev store POST proxy
    const requestedMode = request.nextUrl.searchParams.get('mode');
    if (requestedMode === 'devstore') {
      return proxyDevStorePost(request, projectId);
    }

    // CLI not running — try proxying POST through TKA
    const connection = await resolveConnection(userId, projectId);
    if (!connection?.store_domain || !connection.theme_access_password_encrypted) {
      return NextResponse.json({ error: 'No preview session available' }, { status: 503 });
    }

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
      if (proj?.dev_theme_id) themeId = proj.dev_theme_id;
    } catch { /* fall back to connection.theme_id */ }

    if (!themeId) {
      return NextResponse.json({ error: 'No theme configured' }, { status: 503 });
    }

    const session = await getStorefrontSessionFromConnection(connection, String(themeId));
    if (!session) {
      return NextResponse.json({ error: 'Could not establish preview session' }, { status: 503 });
    }

    const pathParam = request.nextUrl.searchParams.get('path') || '/';
    const isTKA = 'isTKA' in session && session.isTKA === true;
    const domain = connection.store_domain.replace(/^https?:\/\//, '');
    const { url } = buildShopifyUrl(domain, String(themeId), pathParam, isTKA);

    const fwdHeaders = buildForwardHeaders(request, {
      sessionCookie: session.cookie,
      storefrontToken: session.storefrontToken,
      tkaStoreDomain: isTKA ? domain : undefined,
      tkaPassword: isTKA ? (session as { themeAccessPassword: string }).themeAccessPassword : undefined,
    });

    const reqBody = await request.arrayBuffer();
    const shopifyRes = await fetch(url.toString(), {
      method: 'POST',
      headers: fwdHeaders,
      body: reqBody.byteLength > 0 ? reqBody : undefined,
      redirect: 'follow',
      signal: AbortSignal.timeout(25_000),
    });

    const contentType = shopifyRes.headers.get('content-type') || 'application/json';
    const body = await shopifyRes.arrayBuffer();
    const headers = new Headers();
    headers.set('Content-Type', contentType);
    headers.set('Cache-Control', 'no-store');
    rewriteSetCookieHeaders(shopifyRes, headers);

    return new NextResponse(body, { status: shopifyRes.status, headers });
  } catch (error) {
    return handleAPIError(error);
  }
}
