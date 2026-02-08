'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

interface UseRequireAuthResult {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

/**
 * Client-side auth guard hook - REQ-8 TASK-3
 *
 * Checks the current Supabase session. If the user is not authenticated,
 * redirects to /auth/signin with a callbackUrl so they return after login.
 */
export function useRequireAuth(): UseRequireAuthResult {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    const checkSession = async () => {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();

      if (!currentUser) {
        const callbackUrl = encodeURIComponent(window.location.pathname);
        router.replace(`/auth/signin?callbackUrl=${callbackUrl}`);
        return;
      }

      setUser(currentUser);
      setIsLoading(false);
    };

    checkSession();

    // Listen for auth state changes (e.g. token refresh, sign-out in another tab)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        router.replace('/auth/signin');
      } else {
        setUser(session.user);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
  };
}
