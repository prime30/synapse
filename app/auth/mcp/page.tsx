'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type AuthState = 'checking' | 'login' | 'submitting' | 'redirecting' | 'success' | 'error';

function MCPAuthContent() {
  const searchParams = useSearchParams();
  const redirectPort = searchParams.get('redirect_port');
  const state = searchParams.get('state');

  const [authState, setAuthState] = useState<AuthState>('checking');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const supabase = createClient();

  // Validate redirect_port
  const port = redirectPort ? parseInt(redirectPort, 10) : NaN;
  const isValidPort = !isNaN(port) && port >= 1024 && port <= 65535;

  const redirectToMCP = useCallback(
    (accessToken: string, userId: string, userEmail: string, expiresAt: string) => {
      setAuthState('redirecting');
      const callbackUrl = new URL(`http://localhost:${port}/auth/callback`);
      callbackUrl.searchParams.set('token', accessToken);
      callbackUrl.searchParams.set('user_id', userId);
      callbackUrl.searchParams.set('email', userEmail);
      callbackUrl.searchParams.set('expires_at', expiresAt);
      if (state) callbackUrl.searchParams.set('state', state);

      window.location.href = callbackUrl.toString();
      // Show success after a short delay (in case redirect is slow)
      setTimeout(() => setAuthState('success'), 1500);
    },
    [port, state],
  );

  // Check for existing session on mount
  useEffect(() => {
    if (!isValidPort) {
      setAuthState('error');
      setErrorMessage('Invalid or missing redirect_port parameter.');
      return;
    }

    let cancelled = false;

    async function checkSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;

        if (session?.access_token && session.user) {
          const expiresAt = session.expires_at
            ? new Date(session.expires_at * 1000).toISOString()
            : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

          redirectToMCP(
            session.access_token,
            session.user.id,
            session.user.email ?? '',
            expiresAt,
          );
        } else {
          setAuthState('login');
        }
      } catch {
        if (!cancelled) setAuthState('login');
      }
    }

    checkSession();
    return () => { cancelled = true; };
  }, [isValidPort, supabase.auth, redirectToMCP]);

  const handleLogin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!email.trim() || !password) return;

      setAuthState('submitting');
      setErrorMessage('');

      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) throw error;

        if (!data.session?.access_token || !data.user) {
          throw new Error('Authentication succeeded but no session was returned.');
        }

        const expiresAt = data.session.expires_at
          ? new Date(data.session.expires_at * 1000).toISOString()
          : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

        redirectToMCP(
          data.session.access_token,
          data.user.id,
          data.user.email ?? '',
          expiresAt,
        );
      } catch (err) {
        setAuthState('error');
        setErrorMessage(err instanceof Error ? err.message : 'Authentication failed.');
      }
    },
    [email, password, supabase.auth, redirectToMCP],
  );

  // --- Invalid port ---
  if (!isValidPort) {
    return (
      <div className="flex min-h-screen items-center justify-center ide-surface px-4">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
            <svg className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold ide-text">Invalid Request</h1>
          <p className="mt-2 text-sm ide-text-muted">{errorMessage || 'Missing or invalid redirect_port parameter.'}</p>
          <p className="mt-4 text-xs ide-text-quiet">This page should be opened by the Synapse MCP server in Cursor.</p>
        </div>
      </div>
    );
  }

  // --- Checking existing session ---
  if (authState === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center ide-surface">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 ide-border border-t-sky-500" />
          <p className="mt-4 text-sm ide-text-muted">Checking session...</p>
        </div>
      </div>
    );
  }

  // --- Redirecting / Success ---
  if (authState === 'redirecting' || authState === 'success') {
    return (
      <div className="flex min-h-screen items-center justify-center ide-surface px-4">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
            <svg className="h-6 w-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold ide-text">Authenticated</h1>
          <p className="mt-2 text-sm ide-text-muted">
            Redirecting back to Cursor...
          </p>
          <p className="mt-4 text-xs ide-text-quiet">
            You can close this tab once Cursor confirms the connection.
          </p>
        </div>
      </div>
    );
  }

  // --- Login form ---
  return (
    <div className="flex min-h-screen items-center justify-center ide-surface px-4">
      <div className="w-full max-w-sm">
        {/* Logo / Brand */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500">
            <svg
              className="h-7 w-7 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight ide-text">
            Synapse MCP
          </h1>
          <p className="mt-2 text-sm ide-text-muted">
            Sign in to connect Cursor to your Synapse workspace
          </p>
        </div>

        {/* Error banner */}
        {errorMessage && (
          <div
            className="mb-6 rounded-lg border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-300"
            role="alert"
          >
            {errorMessage}
          </div>
        )}

        {/* Sign-in card */}
        <div className="rounded-xl border ide-border ide-surface-panel p-6">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label
                htmlFor="mcp-email"
                className="mb-1.5 block text-sm font-medium ide-text"
              >
                Email address
              </label>
              <input
                id="mcp-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
                disabled={authState === 'submitting'}
                className="ide-input w-full rounded-lg px-4 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>

            <div>
              <label
                htmlFor="mcp-password"
                className="mb-1.5 block text-sm font-medium ide-text"
              >
                Password
              </label>
              <input
                id="mcp-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                disabled={authState === 'submitting'}
                className="ide-input w-full rounded-lg px-4 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>

            <button
              type="submit"
              disabled={authState === 'submitting' || !email.trim() || !password}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-500 px-6 py-3 text-sm font-medium text-white transition-all duration-150 hover:bg-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-[oklch(0.145_0_0)] dark:focus:ring-offset-[oklch(0.145_0_0)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {authState === 'submitting' ? (
                <>
                  <svg
                    className="h-4 w-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Signing in...
                </>
              ) : (
                'Sign in & connect to Cursor'
              )}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs ide-text-quiet">
          This page was opened by the Synapse MCP server in Cursor.
        </p>
      </div>
    </div>
  );
}

export default function MCPAuthPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center ide-surface">
          <div className="h-8 w-8 animate-spin rounded-full border-2 ide-border border-t-sky-500" />
        </div>
      }
    >
      <MCPAuthContent />
    </Suspense>
  );
}
