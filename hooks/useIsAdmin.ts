'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface UseIsAdminResult {
  isAdmin: boolean;
  isLoading: boolean;
}

/**
 * Client-side hook to check if the current user has application-level admin status.
 * Queries the profiles table for the is_admin flag.
 */
export function useIsAdmin(): UseIsAdminResult {
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    const checkAdmin = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setIsAdmin(false);
        setIsLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single();

      setIsAdmin(profile?.is_admin === true);
      setIsLoading(false);
    };

    checkAdmin();
  }, []);

  return { isAdmin, isLoading };
}
