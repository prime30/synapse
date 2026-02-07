import { createClient } from '@/lib/supabase/server';
import { successResponse, errorResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return errorResponse('Not authenticated', 'AUTH_REQUIRED', 401);
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    return successResponse({ user, profile });
  } catch (error) {
    return handleAPIError(error);
  }
}
