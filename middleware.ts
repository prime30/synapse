import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { isPublicPath, getRedirectUrl } from '@/lib/auth/route-guard';

/**
 * Next.js middleware for route protection - REQ-8 TASK-3
 *
 * Checks Supabase Auth session for every request.
 * - Public paths (sign-in, auth API, static assets) pass through.
 * - Protected paths redirect unauthenticated users to /auth/signin.
 * - Authenticated users visiting /auth/signin are redirected to /projects.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Shopify web-pixel scripts from the preview iframe hit our server instead of
  // Shopify's CDN. They 404 and prevent the store page from fully initializing.
  // Return an empty JS module so the page's script loader doesn't hang.
  if (pathname.startsWith('/web-pixels')) {
    return new NextResponse('/* noop */', {
      status: 200,
      headers: { 'Content-Type': 'application/javascript', 'Cache-Control': 'public, max-age=3600' },
    });
  }

  // CORS preflight for API routes
  if (pathname.startsWith('/api/') && request.method === 'OPTIONS') {
    const origin = request.headers.get('origin');
    const allowedOrigin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin === allowedOrigin ? origin : '',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // Skip static assets, internal Next.js routes, and all API routes
  // (API routes handle their own auth via requireAuth in lib/middleware/auth.ts)
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/.well-known/shopify/')
  ) {
    const response = NextResponse.next();
    // Add CORS headers to API responses
    if (pathname.startsWith('/api/')) {
      const origin = request.headers.get('origin');
      const allowedOrigin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      if (origin === allowedOrigin) {
        response.headers.set('Access-Control-Allow-Origin', origin);
      }
    }
    return response;
  }

  // Create a Supabase client that reads/writes cookies on the response
  const response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // PKCE code exchange: when OAuth redirects back to /auth/confirm with ?code=,
  // the code must be exchanged server-side (the code_verifier is in an httpOnly cookie).
  // Without this, the client-side confirm page can't establish a session.
  if (pathname === '/auth/confirm') {
    const code = request.nextUrl.searchParams.get('code');
    if (code) {
      await supabase.auth.exchangeCodeForSession(code);
    }
    return response;
  }

  // Allow public paths through without hitting Supabase auth —
  // except /auth/signin which needs the auth check to redirect logged-in users.
  if (isPublicPath(pathname) && pathname !== '/auth/signin') {
    return response;
  }

  // Only call Supabase auth for protected routes (avoids network round-trip on marketing pages)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthenticated = !!user;

  // Redirect authenticated users away from sign-in page
  if (isAuthenticated && pathname === '/auth/signin') {
    const callbackUrl =
      request.nextUrl.searchParams.get('callbackUrl') ?? '/projects';
    return NextResponse.redirect(new URL(callbackUrl, request.url));
  }

  // Unauthenticated users on the sign-in page stay there
  if (!isAuthenticated && pathname === '/auth/signin') {
    return response;
  }

  // Redirect unauthenticated users to sign-in
  if (!isAuthenticated) {
    const redirectUrl = getRedirectUrl(pathname);
    return NextResponse.redirect(new URL(redirectUrl, request.url));
  }

  return response;
}

export const runtime = 'nodejs';

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt, ai.txt (metadata / crawler files)
     * - api/ routes (handle their own auth)
     * - web-pixels (Shopify preview scripts)
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|ai.txt|manifest.webmanifest|api/|.well-known/).*)',
  ],
};
