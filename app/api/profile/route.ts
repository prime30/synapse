import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { successResponse, errorResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { requireAuth } from '@/lib/middleware/auth';

export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const supabase = await createClient();

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, avatar_url, created_at, updated_at')
      .eq('id', userId)
      .single();

    if (error || !profile) {
      return errorResponse('Profile not found', 'NOT_FOUND', 404);
    }

    return successResponse(profile);
  } catch (error) {
    return handleAPIError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const supabase = await createClient();

    const body = await request.json().catch(() => ({}));
    const full_name =
      typeof body.full_name === 'string' ? body.full_name.trim() || null : undefined;
    const avatar_url =
      body.avatar_url === null || (typeof body.avatar_url === 'string' && body.avatar_url.trim() === '')
        ? null
        : typeof body.avatar_url === 'string'
          ? body.avatar_url.trim()
          : undefined;

    const updates: { full_name?: string | null; avatar_url?: string | null } = {};
    if (full_name !== undefined) updates.full_name = full_name;
    if (avatar_url !== undefined) updates.avatar_url = avatar_url;

    if (Object.keys(updates).length === 0) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, email, full_name, avatar_url, created_at, updated_at')
        .eq('id', userId)
        .single();
      return successResponse(profile ?? {});
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select('id, email, full_name, avatar_url, created_at, updated_at')
      .single();

    if (error) throw error;
    return successResponse(profile);
  } catch (error) {
    return handleAPIError(error);
  }
}
