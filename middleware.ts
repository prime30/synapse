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

  // Shopify preview pixel requests sometimes embed our preview API path inside
  // a /web-pixels... prefix. Rewrite those to the canonical API route so they
  // don't 404/retry in tight loops.
  if (pathname.startsWith('/web-pixels')) {
    const embeddedApiIndex = pathname.indexOf('/api/projects/');
    if (embeddedApiIndex >= 0) {
      const embeddedApiPath = pathname.slice(embeddedApiIndex);
      const url = new URL(`${embeddedApiPath}${request.nextUrl.search}`, request.url);
      return NextResponse.rewrite(url);
    }
  }

  // Skip static assets, internal Next.js routes, and all API routes
  // (API routes handle their own auth via requireAuth in lib/middleware/auth.ts)
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/api/') ||
    // Shopify preview pixel requests should never be auth-redirected.
    // They are script/worker resource fetches and may be prefixed paths.
    pathname.startsWith('/web-pixels') ||
    pathname.startsWith('/.well-known/shopify/')
  ) {
    return NextResponse.next();
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

  // Allow public paths through without hitting Supabase auth
  if (isPublicPath(pathname)) {
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
      request.nextUrl.searchParams.get('callbackUrl') ?? '/onboarding';
    return NextResponse.redirect(new URL(callbackUrl, request.url));
  }

  // Redirect unauthenticated users to sign-in
  if (!isAuthenticated) {
    const redirectUrl = getRedirectUrl(pathname);
    return NextResponse.redirect(new URL(redirectUrl, request.url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt, ai.txt (metadata / crawler files)
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|ai.txt|manifest.webmanifest).*)',
  ],
};
