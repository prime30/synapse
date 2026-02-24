'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';

type FormState = 'idle' | 'submitting' | 'sent' | 'error';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<FormState>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!email.trim()) return;

      setState('submitting');
      setErrorMessage('');

      try {
        const res = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim() }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? 'Failed to send reset email');
        }

        setState('sent');
      } catch (err) {
        setState('error');
        setErrorMessage(
          err instanceof Error ? err.message : 'Something went wrong'
        );
      }
    },
    [email]
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
            Reset your password
          </h1>
          <p className="mt-2 text-sm ide-text-muted">
            Enter your email and we&apos;ll send you a link to reset your password.
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

        {/* Card */}
        <div className="rounded-xl border ide-border ide-surface-panel p-6">
          {state === 'sent' ? (
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
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <h2 className="text-lg font-semibold ide-text mb-1">
                Check your inbox
              </h2>
              <p className="text-sm ide-text-muted">
                We sent a password reset link to{' '}
                <span className="ide-text-2">{email}</span>.
              </p>
              <p className="text-xs ide-text-muted mt-3">
                Didn&apos;t receive it? Check your spam folder or{' '}
                <button
                  type="button"
                  onClick={() => setState('idle')}
                  className="text-sky-500 dark:text-sky-400 hover:text-sky-400 dark:hover:text-sky-300 transition-colors"
                >
                  try again
                </button>
                .
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
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
                  disabled={state === 'submitting'}
                  className="ide-input w-full rounded-lg px-4 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>

              <button
                type="submit"
                disabled={state === 'submitting' || !email.trim()}
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
                    Sending...
                  </>
                ) : (
                  'Send reset link'
                )}
              </button>
            </form>
          )}
        </div>

        {/* Back to sign in */}
        <p className="mt-6 text-center text-sm ide-text-muted">
          Remember your password?{' '}
          <Link
            href="/auth/signin"
            className="text-sky-500 dark:text-sky-400 hover:text-sky-400 dark:hover:text-sky-300 transition-colors"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
