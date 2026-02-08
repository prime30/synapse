import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { isPublicPath, getRedirectUrl } from '@/lib/auth/route-guard';

/**
 * Next.js middleware for route protection - REQ-8 TASK-3
 *
 * Checks Supabase Auth session for every request.
 * - Public paths (sign-in, auth API, static assets) pass through.
 * - Protected paths redirect unauthenticated users to /auth/signin.
 * - Authenticated users visiting /auth/signin are redirected to /.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static assets and internal Next.js routes
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/api/auth/')
  ) {
    return NextResponse.next();
  }

  // Create a Supabase client that reads/writes cookies on the response
  let response = NextResponse.next({ request });

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

  // Refresh session (important for token refresh to work)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthenticated = !!user;

  // Redirect authenticated users away from sign-in page
  if (isAuthenticated && pathname === '/auth/signin') {
    const callbackUrl =
      request.nextUrl.searchParams.get('callbackUrl') ?? '/';
    return NextResponse.redirect(new URL(callbackUrl, request.url));
  }

  // Allow public paths through
  if (isPublicPath(pathname)) {
    return response;
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
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
};
