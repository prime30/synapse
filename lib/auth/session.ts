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
