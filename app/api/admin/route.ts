import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/auth';
import { handleAPIError } from '@/lib/errors/handler';
import { createServiceClient } from '@/lib/supabase/admin';

/**
 * GET /api/admin — List all admin users.
 * Only accessible by existing admins.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);

    const supabase = createServiceClient();
    const { data: admins, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, avatar_url, is_admin, created_at')
      .eq('is_admin', true)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ admins: admins ?? [] });
  } catch (error) {
    return handleAPIError(error);
  }
}
