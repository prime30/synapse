'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

type InviteState = 'loading' | 'success' | 'error';

export default function AcceptInvitePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');
  const [state, setState] = useState<InviteState>('loading');
  const [errorMessage, setErrorMessage] = useState('Invalid or expired invitation.');

  const acceptInvite = useCallback(
    async (inviteToken: string) => {
      // TODO: Replace mock with real API call
      // await fetch('/api/account/accept-invite', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ token: inviteToken }),
      // });

      // Mock: simulate a 2-second accept flow
      await new Promise((resolve) => setTimeout(resolve, 2000));

      if (!inviteToken) {
        setErrorMessage('No invitation token provided.');
        setState('error');
        return;
      }

      // Mock success
      setState('success');

      // Redirect after brief pause so user sees success
      setTimeout(() => {
        router.push('/account/members?invite=accepted');
      }, 1500);
    },
    [router],
  );

  useEffect(() => {
    if (!token) {
      setErrorMessage('No invitation token provided.');
      setState('error');
      return;
    }

    acceptInvite(token).catch(() => {
      setErrorMessage('Something went wrong. Please try again or request a new invite.');
      setState('error');
    });
  }, [token, acceptInvite]);

  return (
    <div className="min-h-screen flex items-center justify-center ide-surface px-4">
      <div className="w-full max-w-md text-center">
        {/* ── Loading ──────────────────────────────────────────── */}
        {state === 'loading' && (
          <div className="space-y-4">
            <div className="mx-auto w-10 h-10 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
            <h1 className="text-xl font-semibold ide-text">
              Accepting invitation&hellip;
            </h1>
            <p className="text-sm ide-text-muted">
              Please wait while we set up your account.
            </p>
          </div>
        )}

        {/* ── Success ─────────────────────────────────────────── */}
        {state === 'success' && (
          <div className="space-y-4">
            <div className="mx-auto flex items-center justify-center w-12 h-12 rounded-full bg-green-500/10 ring-1 ring-green-500/20">
              <svg
                className="w-6 h-6 text-green-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold ide-text">
              Invitation accepted!
            </h1>
            <p className="text-sm ide-text-muted">
              Redirecting you to the team members page&hellip;
            </p>
          </div>
        )}

        {/* ── Error ───────────────────────────────────────────── */}
        {state === 'error' && (
          <div className="space-y-4">
            <div className="mx-auto flex items-center justify-center w-12 h-12 rounded-full bg-red-500/10 ring-1 ring-red-500/20">
              <svg
                className="w-6 h-6 text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold ide-text">
              Invitation failed
            </h1>
            <p className="text-sm ide-text-muted">{errorMessage}</p>
            <div className="pt-2">
              <Link
                href="/account"
                className="inline-block rounded-full ide-surface-panel ide-hover ide-text text-sm font-medium px-5 py-2.5 transition-colors"
              >
                Go to Account
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
