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

  // Skip static assets, internal Next.js routes, and all API routes
  // (API routes handle their own auth via requireAuth in lib/middleware/auth.ts)
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/api/') ||
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
