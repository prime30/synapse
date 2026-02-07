import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { validateBody } from '@/lib/middleware/validation';
import { magicLinkSchema } from '@/lib/api/validation';

export async function POST(request: NextRequest) {
  try {
    const body = await validateBody(magicLinkSchema)(request);
    const supabase = await createClient();

    const { error } = await supabase.auth.signInWithOtp({
      email: body.email,
    });

    if (error) throw error;
    return successResponse({ message: 'Magic link sent' });
  } catch (error) {
    return handleAPIError(error);
  }
}
