import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { validateBody } from '@/lib/middleware/validation';
import { loginSchema } from '@/lib/api/validation';

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
