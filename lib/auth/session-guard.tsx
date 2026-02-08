'use client';

import { useRequireAuth } from '@/hooks/useRequireAuth';

interface SessionGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Wraps protected pages with auth check - REQ-8 TASK-3
 *
 * Shows a loading skeleton while checking the session.
 * Redirects to /auth/signin if not authenticated.
 * Renders children only when the user is authenticated.
 */
export function SessionGuard({ children, fallback }: SessionGuardProps) {
  const { isLoading, isAuthenticated } = useRequireAuth();

  if (isLoading) {
    return (
      fallback ?? (
        <div className="flex min-h-screen items-center justify-center bg-gray-950">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-700 border-t-blue-500" />
            <p className="text-sm text-gray-400">Loading...</p>
          </div>
        </div>
      )
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
