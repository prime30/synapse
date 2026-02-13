import { createClient } from '@supabase/supabase-js';

/**
 * Supabase client with the service-role key.
 * Bypasses RLS — use only in trusted server-side code (API routes, background jobs).
 *
 * NOTE: Do NOT import this from client components or middleware that runs at the edge.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'createServiceClient requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}
