import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { validateBody } from '@/lib/middleware/validation';
import { loginSchema } from '@/lib/api/validation';

function getCanonicalOrigin(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      console.warn(
        '[auth/login] Invalid NEXT_PUBLIC_APP_URL, falling back to request origin.'
      );
    }
  }
  return request.nextUrl.origin;
}

function normalizeCallbackUrl(raw: string | null, appOrigin: string): string {
  const fallback = '/onboarding?signed_in=1';
  if (!raw) return fallback;
  const value = raw.trim();
  if (!value) return fallback;

  // Keep relative in-app paths as-is.
  if (value.startsWith('/')) return value;

  // For absolute URLs, only allow same-origin callback targets.
  try {
    const parsed = new URL(value);
    if (parsed.origin !== appOrigin) {
      console.warn(
        `[auth/login] Rejected cross-origin callbackUrl "${value}", using fallback.`
      );
      return fallback;
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    console.warn(
      `[auth/login] Rejected invalid callbackUrl "${value}", using fallback.`
    );
    return fallback;
  }
}

/**
 * GET: redirect to Google OAuth; query param callbackUrl = where to send user after sign-in (default /projects?signed_in=1).
 * Always returns 302 (redirect) so the browser navigates; never 200 with a body.
 */
export async function GET(request: NextRequest) {
  const origin = getCanonicalOrigin(request);
  const authErrorUrl = `${origin}/auth/error`;
  try {
    const { searchParams } = new URL(request.url);
    const callbackUrl = normalizeCallbackUrl(
      searchParams.get('callbackUrl'),
      origin
    );
    const redirectTo = `${origin}/auth/confirm?next=${encodeURIComponent(callbackUrl)}`;

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });

    if (error) {
      const msg = error.message || '';
      const code =
        msg.includes('missing OAuth secret') || msg.includes('Unsupported provider')
          ? 'oauth_not_configured'
          : encodeURIComponent(msg);
      return NextResponse.redirect(`${authErrorUrl}?error=${code}`);
    }
    if (!data?.url) {
      return NextResponse.redirect(`${authErrorUrl}?error=oauth_config`);
    }

    return NextResponse.redirect(data.url);
  } catch {
    return NextResponse.redirect(authErrorUrl);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await validateBody(loginSchema)(request);
    const supabase = await createClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: body.email,
      password: body.password,
    });

    if (error) throw error;
    return successResponse({
      user: data.user,
      session: data.session,
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
