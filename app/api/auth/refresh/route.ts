import { createClient } from '@/lib/supabase/server';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';

export async function POST() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.refreshSession();
    if (error) throw error;
    return successResponse({ session: data.session });
  } catch (error) {
    return handleAPIError(error);
  }
}
