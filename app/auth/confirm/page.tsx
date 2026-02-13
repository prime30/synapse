'use client';

import { Suspense, useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

function normalizeNextPath(raw: string | null): string {
  const fallback = '/onboarding?signed_in=1';
  if (!raw) return fallback;
  const value = raw.trim();
  if (!value) return fallback;
  if (value.startsWith('/')) return value;

  // If an absolute URL sneaks in, only allow same-origin destinations.
  try {
    const parsed = new URL(value);
    if (typeof window !== 'undefined' && parsed.origin === window.location.origin) {
      return `${parsed.pathname}${parsed.search}`;
    }
    console.warn(
      `[auth/confirm] Rejected cross-origin next "${value}", using fallback.`
    );
  } catch {
    console.warn(
      `[auth/confirm] Rejected invalid next "${value}", using fallback.`
    );
  }
  return fallback;
}

/**
 * Auth confirmation page for email verification and password recovery.
 *
 * Supabase redirects here with tokens in the URL hash (fragment). The server
 * never receives the hash, so we must handle it client-side. We give the
 * Supabase client a chance to process the URL via getSession() (which runs
 * initialize() and detects session in URL), and also handle hash/query manually.
 */
function ConfirmContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    const next = normalizeNextPath(searchParams.get('next'));

    async function run() {
      // Capture type from URL before anything else (client may clear hash)
      const hash = typeof window !== 'undefined' ? window.location.hash : '';
      const hashParams = hash ? new URLSearchParams(hash.replace(/^#/, '')) : null;
      const typeFromHash = hashParams?.get('type') ?? null;
      const typeFromQuery = searchParams.get('type') as 'magiclink' | 'email' | 'recovery' | null;
      const type = typeFromHash ?? typeFromQuery;

      // 1) Tokens in hash – set session manually (in case client.init hasn't run yet)
      const access_token = hashParams?.get('access_token');
      const refresh_token = hashParams?.get('refresh_token');
      if (access_token && refresh_token) {
        handled.current = true;
        try {
          const supabase = createClient();
          await supabase.auth.setSession({ access_token, refresh_token });
          const redirectTo = type === 'recovery' ? '/auth/reset-password' : next;
          router.replace(redirectTo);
          router.refresh();
        } catch {
          router.replace('/auth/error?error=Verification');
        }
        return;
      }

      // 2) Tokens in query string (some Supabase configs use query instead of hash)
      const accessTokenQuery = searchParams.get('access_token');
      const refreshTokenQuery = searchParams.get('refresh_token');
      const typeFromQueryStr = searchParams.get('type');
      if (accessTokenQuery && refreshTokenQuery) {
        handled.current = true;
        try {
          const supabase = createClient();
          await supabase.auth.setSession({
            access_token: accessTokenQuery,
            refresh_token: refreshTokenQuery,
          });
          const redirectTo = typeFromQueryStr === 'recovery' ? '/auth/reset-password' : next;
          router.replace(redirectTo);
          router.refresh();
        } catch {
          router.replace('/auth/error?error=Verification');
        }
        return;
      }

      // 3) Query params token_hash + type (verifyOtp)
      const token_hash = searchParams.get('token_hash');
      const typeForOtp = searchParams.get('type') as 'magiclink' | 'email' | 'recovery' | null;
      if (token_hash && typeForOtp) {
        handled.current = true;
        try {
          const supabase = createClient();
          const { error } = await supabase.auth.verifyOtp({ token_hash, type: typeForOtp });
          if (error) {
            router.replace(`/auth/error?error=${encodeURIComponent(error.message)}`);
            return;
          }
          const redirectTo = typeForOtp === 'recovery' ? '/auth/reset-password' : next;
          router.replace(redirectTo);
          router.refresh();
        } catch {
          router.replace('/auth/error?error=Verification');
        }
        return;
      }

      // 4) Let Supabase client detect session from URL (e.g. hash available after hydration)
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        handled.current = true;
        const redirectTo = type === 'recovery' ? '/auth/reset-password' : next;
        router.replace(redirectTo);
        router.refresh();
        return;
      }

      // 5) Brief delay then re-check hash (in case it wasn't ready on first paint)
      await new Promise((r) => setTimeout(r, 100));
      const hashAgain = typeof window !== 'undefined' ? window.location.hash : '';
      if (hashAgain) {
        const paramsAgain = new URLSearchParams(hashAgain.replace(/^#/, ''));
        const at = paramsAgain.get('access_token');
        const rt = paramsAgain.get('refresh_token');
        const t = paramsAgain.get('type');
        if (at && rt) {
          handled.current = true;
          try {
            const supabase2 = createClient();
            await supabase2.auth.setSession({ access_token: at, refresh_token: rt });
            const redirectTo = t === 'recovery' ? '/auth/reset-password' : next;
            router.replace(redirectTo);
            router.refresh();
          } catch {
            router.replace('/auth/error?error=Verification');
          }
          return;
        }
      }

      // 6) No tokens found
      handled.current = true;
      setStatus('error');
      router.replace('/auth/error?error=missing_token');
    }

    run();
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center ide-surface">
      <div className="text-center">
        {status === 'loading' && (
          <>
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 ide-border border-t-sky-500" />
            <p className="mt-4 text-sm ide-text-muted">Confirming your request...</p>
          </>
        )}
        {status === 'error' && (
          <p className="text-sm ide-text-muted">Redirecting...</p>
        )}
      </div>
    </div>
  );
}

export default function AuthConfirmPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center ide-surface">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 ide-border border-t-sky-500" />
        </div>
      }
    >
      <ConfirmContent />
    </Suspense>
  );
}
