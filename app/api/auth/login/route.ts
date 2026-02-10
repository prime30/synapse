import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { validateBody } from '@/lib/middleware/validation';
import { loginSchema } from '@/lib/api/validation';

/** GET: redirect to Google OAuth; query param callbackUrl = where to send user after sign-in (default /). */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const authErrorUrl = `${origin}/auth/error`;
  try {
    const { searchParams } = new URL(request.url);
    const callbackUrl = searchParams.get('callbackUrl')?.trim() || '/';
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
