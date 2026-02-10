import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Dev-only auto-login endpoint.
 *
 * Accepts email + password. If the account doesn't exist, auto-provisions it
 * using the service role key (creates + confirms). If it exists but the password
 * doesn't match, resets the password. Then signs in and sets session cookies.
 *
 * Only available when NODE_ENV === 'development'.
 */
export async function POST(request: NextRequest) {
  // Hard gate: only works in development
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json(
      { error: 'Dev login is only available in development mode' },
      { status: 403 }
    );
  }

  try {
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const callbackUrl =
      typeof body.callbackUrl === 'string' && body.callbackUrl
        ? body.callbackUrl
        : '/';

    const emailFromBody =
      typeof body.email === 'string' ? body.email.trim() : '';
    const passwordFromBody =
      typeof body.password === 'string' ? body.password : '';

    const email = emailFromBody || process.env.DEV_AUTO_LOGIN_EMAIL || '';
    const password = passwordFromBody || process.env.DEV_AUTO_LOGIN_PASSWORD || '';

    if (!email || !password) {
      return NextResponse.json(
        {
          error:
            'Dev login requires email and password. Provide them in the form ' +
            'or set DEV_AUTO_LOGIN_EMAIL and DEV_AUTO_LOGIN_PASSWORD in .env.local.',
        },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters.' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Try signing in first
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (!error) {
      // Login succeeded on first try
      return NextResponse.json({ success: true, redirectTo: callbackUrl });
    }

    const authError = error as { code?: string; message?: string };

    // If credentials are invalid, try to auto-provision/fix the account
    if (authError.code === 'invalid_credentials' || authError.code === 'email_not_confirmed') {
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

      if (!serviceRoleKey) {
        return NextResponse.json(
          {
            error:
              'Login failed and auto-provisioning is unavailable. ' +
              'Add SUPABASE_SERVICE_ROLE_KEY to .env.local to enable auto-provisioning, ' +
              'or create the account manually in the Supabase dashboard.',
            detail: `Original error: ${authError.code}`,
          },
          { status: 401 }
        );
      }

      if (!supabaseUrl) {
        return NextResponse.json(
          { error: 'NEXT_PUBLIC_SUPABASE_URL is not configured.' },
          { status: 500 }
        );
      }

      // Use admin API to create or fix the account
      const admin = createSupabaseClient(supabaseUrl, serviceRoleKey);
      const { data: usersData, error: listError } = await admin.auth.admin.listUsers();

      if (listError) {
        return NextResponse.json(
          {
            error: `Admin API failed: ${listError.message}. Check that SUPABASE_SERVICE_ROLE_KEY is valid.`,
          },
          { status: 500 }
        );
      }

      const existingUser = usersData.users.find(
        (u) => u.email?.toLowerCase() === email.toLowerCase()
      );

      if (existingUser) {
        // User exists but password/confirmation is wrong — reset password and confirm
        const { error: updateError } = await admin.auth.admin.updateUserById(existingUser.id, {
          password,
          email_confirm: true,
        });
        if (updateError) {
          return NextResponse.json(
            { error: `Failed to update user: ${updateError.message}` },
            { status: 500 }
          );
        }
      } else {
        // User doesn't exist — create with auto-confirm
        const { error: createError } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });
        if (createError) {
          return NextResponse.json(
            { error: `Failed to create user: ${createError.message}` },
            { status: 500 }
          );
        }
      }

      // Retry login after admin fix
      const retry = await supabase.auth.signInWithPassword({ email, password });
      if (retry.error) {
        return NextResponse.json(
          {
            error: `Account was provisioned but login still failed: ${retry.error.message}. ` +
              'Try again in a few seconds, or check the Supabase dashboard.',
          },
          { status: 401 }
        );
      }

      return NextResponse.json({
        success: true,
        redirectTo: callbackUrl,
        provisioned: !existingUser ? 'created' : 'updated',
      });
    }

    // Other auth errors (rate limit, etc.)
    return NextResponse.json(
      { error: `Login failed: ${authError.message ?? 'Unknown error'}` },
      { status: 401 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: `Dev login error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      },
      { status: 500 }
    );
  }
}
