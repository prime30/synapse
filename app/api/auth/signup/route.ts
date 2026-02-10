import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { validateBody } from '@/lib/middleware/validation';
import { signUpSchema } from '@/lib/api/validation';

export async function POST(request: NextRequest) {
  try {
    const body = await validateBody(signUpSchema)(request);
    const supabase = await createClient();

    const { data, error } = await supabase.auth.signUp({
      email: body.email,
      password: body.password,
      options: {
        data: { full_name: body.full_name },
      },
    });

    if (error) throw error;
    return successResponse(
      {
        user: data.user,
        session: data.session,
        needsEmailConfirmation: !data.session,
      },
      201
    );
  } catch (error) {
    return handleAPIError(error);
  }
}
