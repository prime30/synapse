import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireAuth } from '@/lib/middleware/auth';
import { handleAPIError } from '@/lib/errors/handler';
import { encryptToken } from '@/lib/shopify/token-manager';
import { ShopifyTokenManager } from '@/lib/shopify/token-manager';
import { getStorefrontSessionFromConnection } from '@/lib/shopify/storefront-session';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

const SESSION_COOKIE_TTL_DAYS = 14;

/**
 * POST /api/projects/[projectId]/preview-session
 *
 * Accepts either:
 * - { themeAccessPassword: string } — stores a TKA password (shptka_*)
 * - { cookie: string } — validates and stores a manual session cookie
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const userId = await requireAuth(request);
    const { projectId } = await params;
    const body = await request.json();

    // --- TKA password flow ---
    const tkaPassword = body?.themeAccessPassword?.trim();
    if (tkaPassword) {
      if (!tkaPassword.startsWith('shptka_')) {
        return NextResponse.json(
          { error: 'Invalid password format. Theme Access passwords start with shptka_' },
          { status: 400 },
        );
      }

      const tokenManager = new ShopifyTokenManager();
      const connection = await tokenManager.getActiveConnection(userId, { projectId });

      if (!connection) {
        return NextResponse.json(
          { error: 'No Shopify connection found for this project' },
          { status: 404 },
        );
      }

      const storeDomainClean = connection.store_domain.replace(/^https?:\/\//, '');

      // Validate the TKA password via a direct HTTP request to the TKA endpoint.
      // We fetch the store root — if TKA accepts the password it returns 200 or a
      // store redirect (3xx). A 401 means the password is wrong or the Theme Access
      // app is not installed.
      try {
        const testUrl = `https://theme-kit-access.shopifyapps.com/cli/sfr/?_fd=0&pb=0`;
        const testRes = await fetch(testUrl, {
          redirect: 'manual',
          headers: {
            'X-Shopify-Access-Token': tkaPassword,
            'X-Shopify-Shop': storeDomainClean,
            'User-Agent': 'Shopify CLI; v=synapse',
          },
          signal: AbortSignal.timeout(15_000),
        });
        console.log(`[Preview Session] TKA validation status ${testRes.status} for ${storeDomainClean}`);
        if (testRes.status === 401) {
          return NextResponse.json(
            {
              error: `Theme Access password was rejected by Shopify. ` +
                'Make sure the Theme Access app is installed and the password is correct.',
            },
            { status: 422 },
          );
        }
        // Any non-401 response (200, 302, 303, 404, etc.) means the credentials are accepted.
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`[Preview Session] TKA HTTP validation error: ${msg}`);
        // Network error — save anyway, user will get an error in the preview if wrong
      }

      await tokenManager.storeThemeAccessPassword(connection.id, tkaPassword);

      return NextResponse.json({ status: 'tka', valid: true });
    }

    // --- Manual cookie flow ---
    const rawCookie = body?.cookie?.trim();

    if (!rawCookie) {
      return NextResponse.json(
        { error: 'Missing cookie or themeAccessPassword' },
        { status: 400 },
      );
    }

    // Accept: full Cookie header string ("k1=v1; k2=v2"), a single "name=value",
    // or a bare value (legacy _shopify_fs).
    // We store whatever the user provides and forward it verbatim to Shopify.
    const cookieStr = rawCookie;

    // Resolve the Shopify connection for this project
    const tokenManager = new ShopifyTokenManager();
    const connection = await tokenManager.getActiveConnection(userId, { projectId });

    if (!connection?.store_domain) {
      return NextResponse.json(
        { error: 'No Shopify connection found for this project' },
        { status: 404 },
      );
    }

    // Determine theme ID (same logic as preview route)
    let themeId = connection.theme_id;
    try {
      const supabase = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
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
      return NextResponse.json(
        { error: 'No preview theme configured' },
        { status: 400 },
      );
    }

    // Step 1: Discover the custom domain.
    // Shopify redirects myshopify.com → custom domain. We need to send
    // the cookie to the custom domain directly (cookies are domain-bound).
    const storeDomain = connection.store_domain.replace(/^https?:\/\//, '');
    let effectiveDomain = storeDomain;
    try {
      const disc = await fetch(`https://${storeDomain}/`, {
        redirect: 'manual',
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(5_000),
      });
      const loc = disc.headers.get('location');
      if (loc) {
        effectiveDomain = new URL(loc).hostname;
      }
    } catch { /* fall through, use myshopify domain */ }

    console.log(`[Preview Session] store=${storeDomain} effective=${effectiveDomain} theme=${themeId}`);

    // Step 2: Test the cookie on the effective domain.
    // One single request — no re-appending on redirects. If Shopify
    // strips preview_theme_id (302 back to /), the cookie isn't valid.
    const testUrl = `https://${effectiveDomain}/?preview_theme_id=${themeId}`;
    const testRes = await fetch(testUrl, {
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'text/html',
        Cookie: cookieStr,
      },
      signal: AbortSignal.timeout(15_000),
    });

    // If Shopify redirects (strips the param), the cookie didn't authenticate.
    if (testRes.status >= 300 && testRes.status < 400) {
      const redirectTo = testRes.headers.get('location') || '(unknown)';
      console.log(`[Preview Session] Cookie rejected — Shopify redirected to: ${redirectTo}`);
      return NextResponse.json(
        {
          error: 'Cookie was not accepted by Shopify. It redirected instead of serving the draft theme. Make sure you copied the full Cookie header from the preview tab (not the admin tab).',
          debug: { effectiveDomain, redirectTo, status: testRes.status },
        },
        { status: 422 },
      );
    }

    if (!testRes.ok) {
      return NextResponse.json(
        { error: `Shopify returned ${testRes.status} — cookie may be invalid or expired` },
        { status: 422 },
      );
    }

    // Check if Shopify actually served the draft theme
    const html = await testRes.text();
    const themeIdMatch = html.match(/Shopify\.theme\s*=\s*\{[^}]*"id"\s*:\s*(\d+)/);
    const servedThemeId = themeIdMatch ? themeIdMatch[1] : null;

    if (servedThemeId !== String(themeId)) {
      return NextResponse.json({
        valid: false,
        error: 'Cookie was accepted but Shopify served the published theme, not the draft. The cookie may be for a different store or has expired.',
        served_theme_id: servedThemeId,
        expected_theme_id: String(themeId),
      }, { status: 422 });
    }

    // Cookie is valid — encrypt and store
    const encrypted = encryptToken(cookieStr);
    const expiresAt = new Date(Date.now() + SESSION_COOKIE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { error: updateError } = await supabase
      .from('shopify_connections')
      .update({
        preview_cookie_encrypted: encrypted,
        preview_cookie_expires_at: expiresAt,
      })
      .eq('id', connection.id);

    if (updateError) {
      console.error('[Preview Session] Failed to store cookie:', updateError.message);
      return NextResponse.json(
        { error: 'Cookie validated but failed to save. Try again.' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      valid: true,
      expires_at: expiresAt,
      theme_id: String(themeId),
    });
  } catch (error) {
    return handleAPIError(error);
  }
}

/**
 * GET /api/projects/[projectId]/preview-session
 *
 * Returns the current session status: 'auto', 'active', 'expired', or 'none'.
 * 'auto' means the CLI-style automatic session is working (no manual cookie needed).
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const userId = await requireAuth(request);
    const { projectId } = await params;

    const tokenManager = new ShopifyTokenManager();
    const connection = await tokenManager.getActiveConnection(userId, { projectId });

    if (!connection) {
      return NextResponse.json({ status: 'none' });
    }

    // Priority 0: Theme Kit Access password (check primary, then siblings)
    if (connection.theme_access_password_encrypted) {
      return NextResponse.json({ status: 'tka' });
    }

    // Fallback: the password may be on a sibling connection row for the same store.
    // getThemeAccessPassword checks siblings and auto-migrates if found.
    const tkaFallback = await tokenManager.getThemeAccessPassword(connection.id);
    if (tkaFallback) {
      return NextResponse.json({ status: 'tka' });
    }

    // Priority 1: online (user-scoped) token
    if (connection.online_token_encrypted) {
      const onlineExpires = connection.online_token_expires_at
        ? new Date(connection.online_token_expires_at)
        : null;
      if (!onlineExpires || onlineExpires > new Date()) {
        return NextResponse.json({
          status: 'online',
          expires_at: connection.online_token_expires_at,
          method: 'online_token',
        });
      }
      // Online token exists but is expired — fall through to other methods,
      // but surface the expiry so the UI can prompt re-auth
    }

    // Priority 2: automatic CLI-style session
    if (connection.access_token_encrypted) {
      let themeId = connection.theme_id;
      try {
        const supabase = createServiceClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        );
        const { data: proj } = await supabase
          .from('projects')
          .select('dev_theme_id')
          .eq('id', projectId)
          .single();
        if (proj?.dev_theme_id) themeId = proj.dev_theme_id;
      } catch { /* use connection.theme_id */ }

      if (themeId) {
        const sfrSession = await getStorefrontSessionFromConnection(connection, String(themeId));
        if (sfrSession) {
          return NextResponse.json({ status: 'auto', method: 'token' });
        }
      }
    }

    // Priority 3: check manual cookie
    if (!connection.preview_cookie_encrypted) {
      // If online token was expired, surface that
      if (connection.online_token_encrypted) {
        return NextResponse.json({
          status: 'expired',
          expires_at: connection.online_token_expires_at,
          method: 'online_token',
        });
      }
      return NextResponse.json({ status: 'none' });
    }

    const expires = connection.preview_cookie_expires_at
      ? new Date(connection.preview_cookie_expires_at)
      : null;

    if (expires && expires <= new Date()) {
      return NextResponse.json({ status: 'expired', expires_at: connection.preview_cookie_expires_at });
    }

    return NextResponse.json({
      status: 'active',
      expires_at: connection.preview_cookie_expires_at,
    });
  } catch (error) {
    return handleAPIError(error);
  }
}

/**
 * DELETE /api/projects/[projectId]/preview-session
 *
 * Removes the stored session cookie (disconnect preview session).
 */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const userId = await requireAuth(request);
    const { projectId } = await params;

    const tokenManager = new ShopifyTokenManager();
    const connection = await tokenManager.getActiveConnection(userId, { projectId });

    if (!connection) {
      return NextResponse.json({ ok: true });
    }

    const supabase = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    await supabase
      .from('shopify_connections')
      .update({
        preview_cookie_encrypted: null,
        preview_cookie_expires_at: null,
        theme_access_password_encrypted: null,
      })
      .eq('id', connection.id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleAPIError(error);
  }
}
