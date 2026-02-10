import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { validateBody } from '@/lib/middleware/validation';
import { forgotPasswordSchema } from '@/lib/api/validation';

export async function POST(request: NextRequest) {
  try {
    const body = await validateBody(forgotPasswordSchema)(request);
    const supabase = await createClient();

    const origin = new URL(request.url).origin;
    const redirectTo = `${origin}/auth/confirm?next=/auth/reset-password`;

    // Ensure this exact redirect URL (or a wildcard) is allowed in Supabase Dashboard:
    // Authentication → URL Configuration → Redirect URLs
    const { error } = await supabase.auth.resetPasswordForEmail(body.email, {
      redirectTo,
    });

    if (error) throw error;

    return successResponse({ message: 'Password reset email sent' });
  } catch (error) {
    return handleAPIError(error);
  }
}
