'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

/** Map error codes to user-friendly messages. */
const ERROR_MESSAGES: Record<string, { title: string; description: string }> = {
  Configuration: {
    title: 'Server Configuration Error',
    description:
      'There is a problem with the server configuration. Please contact support if this persists.',
  },
  AccessDenied: {
    title: 'Access Denied',
    description:
      'You do not have permission to sign in. Please contact your administrator if you believe this is a mistake.',
  },
  Verification: {
    title: 'Verification Error',
    description:
      'The verification link may have expired or already been used. Please try signing in again.',
  },
  OAuthSignin: {
    title: 'OAuth Sign-In Error',
    description:
      'Could not start the sign-in process. Please try again.',
  },
  OAuthCallback: {
    title: 'OAuth Callback Error',
    description:
      'An error occurred while completing the sign-in. Please try again.',
  },
  OAuthAccountNotLinked: {
    title: 'Account Not Linked',
    description:
      'This email is already associated with another account. Please sign in with your original provider.',
  },
  SessionRequired: {
    title: 'Session Expired',
    description:
      'Your session has expired. Please sign in again to continue.',
  },
  oauth_config: {
    title: 'Sign-In Not Configured',
    description:
      'Google sign-in is not set up. Please use email and password to sign in.',
  },
  oauth_not_configured: {
    title: 'Google Sign-In Not Configured',
    description:
      'Google sign-in is not configured for this project. Add your Google Client ID and Client Secret in Supabase Dashboard under Authentication → Providers → Google, or sign in with email and password.',
  },
  missing_token: {
    title: 'Invalid or Expired Link',
    description:
      'This link is invalid or has already been used. Request a new password reset link and try again.',
  },
  Default: {
    title: 'Authentication Error',
    description:
      'An unexpected error occurred during authentication. Please try again.',
  },
};

function getErrorInfo(errorCode: string | null) {
  if (!errorCode) return ERROR_MESSAGES.Default;
  return ERROR_MESSAGES[errorCode] ?? ERROR_MESSAGES.Default;
}

function ErrorContent() {
  const searchParams = useSearchParams();
  const errorCode = searchParams.get('error');
  const { title, description } = getErrorInfo(errorCode);

  return (
    <div className="flex min-h-screen items-center justify-center ide-surface px-4">
      <div className="w-full max-w-sm text-center">
        {/* Error icon */}
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-red-950 ring-1 ring-red-800">
          <svg
            className="h-7 w-7 text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
        </div>

        {/* Error details */}
        <h1 className="text-xl font-bold ide-text">{title}</h1>
        <p className="mt-2 text-sm ide-text-muted">{description}</p>

        {errorCode && (
          <p className="mt-3 text-xs ide-text-quiet">
            Error code: {errorCode}
          </p>
        )}

        {/* Action buttons */}
        <div className="mt-8 flex flex-col gap-3">
          <Link
            href="/auth/signin"
            className="inline-flex items-center justify-center rounded-lg bg-sky-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-[#0a0a0a] dark:focus:ring-offset-[#0a0a0a]"
          >
            Try Again
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg border ide-border ide-surface-panel px-4 py-2.5 text-sm font-medium ide-text transition-colors ide-hover focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-[#0a0a0a] dark:focus:ring-offset-[#0a0a0a]"
          >
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * Auth error page – displays a user-friendly error message
 * based on the `?error=` query parameter.
 * REQ-8 TASK-4
 */
export default function AuthErrorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center ide-surface">
          <div className="h-8 w-8 animate-spin rounded-full border-2 ide-border border-t-sky-500" />
        </div>
      }
    >
      <ErrorContent />
    </Suspense>
  );
}
