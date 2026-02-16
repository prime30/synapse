import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/auth';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { createServiceClient } from '@/lib/supabase/admin';

/**
 * POST /api/admin/invite — Promote a user to admin.
 * Only accessible by existing admins.
 *
 * Body: { email: string }
 */
export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request);

    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== 'string') {
      throw APIError.badRequest('Email is required');
    }

    const normalizedEmail = email.trim().toLowerCase();

    const supabase = createServiceClient();

    // Find the user by email
    const { data: profile, error: findError } = await supabase
      .from('profiles')
      .select('id, email, full_name, is_admin')
      .eq('email', normalizedEmail)
      .single();

    if (findError || !profile) {
      throw APIError.notFound(
        `No user found with email "${normalizedEmail}". They must sign up first.`,
      );
    }

    if (profile.is_admin) {
      return NextResponse.json(
        { message: `${normalizedEmail} is already an admin.`, profile },
        { status: 200 },
      );
    }

    // Promote to admin
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ is_admin: true })
      .eq('id', profile.id);

    if (updateError) throw updateError;

    return NextResponse.json({
      message: `${normalizedEmail} has been promoted to admin.`,
      profile: { ...profile, is_admin: true },
    });
  } catch (error) {
    return handleAPIError(error);
  }
}

/**
 * DELETE /api/admin/invite — Remove admin status from a user.
 * Only accessible by existing admins.
 * Cannot remove your own admin status.
 *
 * Body: { email: string }
 */
export async function DELETE(request: NextRequest) {
  try {
    const adminUserId = await requireAdmin(request);

    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== 'string') {
      throw APIError.badRequest('Email is required');
    }

    const normalizedEmail = email.trim().toLowerCase();

    const supabase = createServiceClient();

    // Find the target user
    const { data: profile, error: findError } = await supabase
      .from('profiles')
      .select('id, email, full_name, is_admin')
      .eq('email', normalizedEmail)
      .single();

    if (findError || !profile) {
      throw APIError.notFound(`No user found with email "${normalizedEmail}".`);
    }

    // Prevent self-demotion
    if (profile.id === adminUserId) {
      throw APIError.badRequest('You cannot remove your own admin status.');
    }

    if (!profile.is_admin) {
      return NextResponse.json(
        { message: `${normalizedEmail} is not an admin.`, profile },
        { status: 200 },
      );
    }

    // Remove admin status
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ is_admin: false })
      .eq('id', profile.id);

    if (updateError) throw updateError;

    return NextResponse.json({
      message: `${normalizedEmail} has been removed from admin.`,
      profile: { ...profile, is_admin: false },
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
