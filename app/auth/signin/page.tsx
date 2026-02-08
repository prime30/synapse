'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { GoogleSignInButton } from '@/components/features/auth/GoogleSignInButton';

function SignInContent() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') ?? '/';
  const error = searchParams.get('error');

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 px-4">
      <div className="w-full max-w-sm">
        {/* Logo / Brand */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600">
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
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Sign in to Synapse
          </h1>
          <p className="mt-2 text-sm text-gray-400">
            AI-powered Shopify theme development
          </p>
        </div>

        {/* Error banner */}
        {error && (
          <div
            className="mb-6 rounded-lg border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-300"
            role="alert"
          >
            {error === 'OAuthAccountNotLinked'
              ? 'This email is already associated with another account.'
              : 'An error occurred during sign in. Please try again.'}
          </div>
        )}

        {/* Sign-in card */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
          <GoogleSignInButton callbackUrl={callbackUrl} />

          <p className="mt-4 text-center text-xs text-gray-500">
            By signing in, you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Sign-in page for Synapse.
 * REQ-8 TASK-2
 */
export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-950">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-700 border-t-blue-500" />
        </div>
      }
    >
      <SignInContent />
    </Suspense>
  );
}
