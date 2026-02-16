import { createClient } from '@/lib/supabase/server';
import type { AuthUser } from '@/lib/types/auth';

export async function getSession() {
  const supabase = await createClient();
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) return null;
  return session;
}

export async function getUserFromSession(): Promise<AuthUser | null> {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  return {
    id: user.id,
    email: user.email ?? '',
    profile: profile ?? null,
  };
}

export async function requireUser(): Promise<AuthUser> {
  const user = await getUserFromSession();
  if (!user) {
    throw new Error('AUTH_REQUIRED');
  }
  return user;
}

/**
 * Checks if the current session user is an application-level admin.
 * Returns true if admin, false otherwise (including when not logged in).
 */
export async function isAdmin(): Promise<boolean> {
  const user = await getUserFromSession();
  return user?.profile?.is_admin === true;
}

/**
 * Returns the current session user if they are an admin.
 * Throws AUTH_REQUIRED if not logged in, FORBIDDEN if not admin.
 */
export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireUser();
  if (!user.profile?.is_admin) {
    throw new Error('FORBIDDEN');
  }
  return user;
}
