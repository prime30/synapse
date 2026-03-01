'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { GoogleSignInButton } from '@/components/features/auth/GoogleSignInButton';
import { isElectron } from '@/lib/utils/environment';

const IS_DEV = process.env.NODE_ENV === 'development';

type SignInState = 'idle' | 'submitting' | 'error';

function SignInContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const callbackUrl = searchParams.get('callbackUrl') ?? '/projects';
  const errorParam = searchParams.get('error');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState<SignInState>('idle');
  const [errorMessage, setErrorMessage] = useState(errorParam ?? '');
  const [devLoading, setDevLoading] = useState(false);
  const [desktopApp, setDesktopApp] = useState(false);
  useEffect(() => { setDesktopApp(isElectron()); }, []);

  const handleLogin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!email.trim() || !password) return;

      setState('submitting');
      setErrorMessage('');

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), password }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? 'Invalid email or password');
        }

        const target =
          callbackUrl + (callbackUrl.includes('?') ? '&' : '?') + 'signed_in=1';
        router.push(target);
        router.refresh();
      } catch (err) {
        setState('error');
        setErrorMessage(
          err instanceof Error ? err.message : 'Something went wrong'
        );
      }
    },
    [email, password, callbackUrl, router]
  );

  const handleDevLogin = useCallback(
    async () => {
      if (!email.trim() || !password) {
        setErrorMessage('Enter email and password above, then click Dev Quick Login.');
        setState('error');
        return;
      }

      setDevLoading(true);
      setErrorMessage('');

      try {
        const res = await fetch('/api/auth/dev-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email.trim(),
            password,
            callbackUrl,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error ?? 'Dev login failed');
        }

        router.push(data.redirectTo ?? callbackUrl);
        router.refresh();
      } catch (err) {
        setState('error');
        setErrorMessage(
          err instanceof Error ? err.message : 'Dev login failed'
        );
      } finally {
        setDevLoading(false);
      }
    },
    [email, password, callbackUrl, router]
  );

  return (
    <div className="flex min-h-screen items-center justify-center ide-surface px-4">
      <div className="w-full max-w-sm">
        {/* Back to home — hidden in desktop app (no marketing site) */}
        {!desktopApp && (
          <div className="mb-6">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-sm ide-text-muted hover:text-stone-900 dark:hover:text-white transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to home
            </Link>
          </div>
        )}

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
            Sign in to Synapse
          </h1>
          <p className="mt-2 text-sm ide-text-muted">
            AI-powered Shopify theme development
          </p>
        </div>

        {/* Error banner */}
        {errorMessage && (
          <div
            className="mb-6 rounded-lg border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-300"
            role="alert"
          >
            {errorMessage === 'OAuthAccountNotLinked'
              ? 'This email is already associated with another account.'
              : errorMessage}
          </div>
        )}

        {/* Sign-in card */}
        <div className="rounded-xl border ide-border ide-surface-panel p-6">
          <GoogleSignInButton
            callbackUrl={
              callbackUrl === '/projects'
                ? '/projects?signed_in=1'
                : callbackUrl.includes('?')
                  ? callbackUrl + '&signed_in=1'
                  : callbackUrl + '?signed_in=1'
            }
            className="mb-4"
          />
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t ide-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="ide-surface-panel px-2 ide-text-muted">or continue with email</span>
            </div>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-sm font-medium ide-text"
              >
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
                disabled={state === 'submitting' || devLoading}
                className="ide-input w-full rounded-lg px-4 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="block text-sm font-medium ide-text"
                >
                  Password
                </label>
                <Link
                  href="/auth/forgot-password"
                  className="text-xs text-sky-500 dark:text-sky-400 hover:text-sky-400 dark:hover:text-sky-300 transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                disabled={state === 'submitting' || devLoading}
                className="ide-input w-full rounded-lg px-4 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>

            <button
              type="submit"
              disabled={state === 'submitting' || devLoading || !email.trim() || !password}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-500 px-6 py-3 text-sm font-medium text-white transition-all duration-150 hover:bg-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-[oklch(0.145_0_0)] dark:focus:ring-offset-[oklch(0.145_0_0)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {state === 'submitting' ? (
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
                'Sign in'
              )}
            </button>
          </form>

          {/* Dev Quick Login - only shown in development */}
          {IS_DEV && (
            <div className="mt-4 border-t ide-border pt-4">
              <button
                type="button"
                onClick={handleDevLogin}
                disabled={devLoading || state === 'submitting'}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-amber-700/50 bg-amber-900/20 px-6 py-2.5 text-sm font-medium text-amber-300 transition-all duration-150 hover:bg-amber-900/40 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-[oklch(0.145_0_0)] dark:focus:ring-offset-[oklch(0.145_0_0)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {devLoading ? (
                  <>
                    <svg
                      className="h-4 w-4 animate-spin"
                      fill="none"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Provisioning &amp; signing in...
                  </>
                ) : (
                  'Dev Quick Login (auto-create account)'
                )}
              </button>
              <p className="mt-2 text-center text-xs ide-text-quiet">
                Creates the account if it doesn&apos;t exist. Requires SUPABASE_SERVICE_ROLE_KEY.
              </p>
            </div>
          )}
        </div>

        {/* Sign up link */}
        <p className="mt-6 text-center text-sm ide-text-muted">
          Don&apos;t have an account?{' '}
          <Link
            href="/signup"
            className="text-sky-500 dark:text-sky-400 hover:text-sky-400 dark:hover:text-sky-300 transition-colors"
          >
            Create one for free
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center ide-surface">
          <div className="h-8 w-8 animate-spin rounded-full border-2 ide-border border-t-sky-500" />
        </div>
      }
    >
      <SignInContent />
    </Suspense>
  );
}
