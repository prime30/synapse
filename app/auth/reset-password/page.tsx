'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserClient } from '@supabase/ssr';

type FormState = 'idle' | 'submitting' | 'success' | 'error';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [state, setState] = useState<FormState>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (password.length < 8) {
        setErrorMessage('Password must be at least 8 characters.');
        setState('error');
        return;
      }

      if (password !== confirmPassword) {
        setErrorMessage('Passwords do not match.');
        setState('error');
        return;
      }

      setState('submitting');
      setErrorMessage('');

      try {
        const supabase = createBrowserClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

        const { error } = await supabase.auth.updateUser({
          password,
        });

        if (error) throw error;

        setState('success');

        // Redirect to home after a brief delay
        setTimeout(() => {
          router.push('/');
          router.refresh();
        }, 2000);
      } catch (err) {
        setState('error');
        setErrorMessage(
          err instanceof Error ? err.message : 'Failed to update password'
        );
      }
    },
    [password, confirmPassword, router]
  );

  return (
    <div className="flex min-h-screen items-center justify-center ide-surface px-4">
      <div className="w-full max-w-sm">
        {/* Back to sign in */}
        <div className="mb-6">
          <Link
            href="/auth/signin"
            className="inline-flex items-center gap-1.5 text-sm ide-text-muted hover:text-stone-900 dark:hover:text-white transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to sign in
          </Link>
        </div>

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
            Set a new password
          </h1>
          <p className="mt-2 text-sm ide-text-muted">
            Choose a strong password for your account.
          </p>
        </div>

        {/* Error banner */}
        {errorMessage && state === 'error' && (
          <div
            className="mb-6 rounded-lg border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-300"
            role="alert"
          >
            {errorMessage}
          </div>
        )}

        {/* Card */}
        <div className="rounded-xl border ide-border ide-surface-panel p-6">
          {state === 'success' ? (
            <div className="text-center py-2">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-900/50">
                <svg
                  className="h-6 w-6 text-emerald-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h2 className="text-lg font-semibold ide-text mb-1">
                Password updated
              </h2>
              <p className="text-sm ide-text-muted">
                Your password has been changed. Redirecting you now...
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="password"
                  className="mb-1.5 block text-sm font-medium ide-text"
                >
                  New password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  required
                  minLength={8}
                  autoFocus
                  disabled={state === 'submitting'}
                  className="ide-input w-full rounded-lg px-4 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>

              <div>
                <label
                  htmlFor="confirm-password"
                  className="mb-1.5 block text-sm font-medium ide-text"
                >
                  Confirm new password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  required
                  minLength={8}
                  disabled={state === 'submitting'}
                  className="ide-input w-full rounded-lg px-4 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>

              <button
                type="submit"
                disabled={state === 'submitting' || !password || !confirmPassword}
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
                    Updating...
                  </>
                ) : (
                  'Update password'
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
