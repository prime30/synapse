import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );
}

/**
 * Create a Supabase client that uses the request's auth.
 * When the request has an Authorization: Bearer token (e.g. from MCP), uses that
 * so RLS sees the authenticated user. Otherwise uses cookie-based auth.
 */
export async function createClientFromRequest(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    return createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: { getAll() { return []; }, setAll() {} },
        global: { headers: { Authorization: `Bearer ${token}` } },
      }
    );
  }
  return createClient();
}

/**
 * Create a Supabase client pointing to the read replica.
 *
 * Uses SUPABASE_READ_URL if set (Supabase Pro read replica via Supavisor).
 * Falls back to the primary URL when the env var is not configured,
 * so callers don't need conditional logic.
 */
export async function createReadClient() {
  const cookieStore = await cookies();
  const readUrl = process.env.SUPABASE_READ_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;

  return createServerClient(
    readUrl,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component context — safe to ignore
          }
        },
      },
    }
  );
}
