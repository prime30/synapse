'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isElectron } from '@/lib/utils/environment';

/**
 * Redirects Electron desktop users away from marketing pages to the IDE.
 * Renders nothing -- purely a side-effect component embedded in the marketing layout.
 */
export function DesktopMarketingRedirect() {
  const router = useRouter();

  useEffect(() => {
    if (isElectron()) {
      router.replace('/projects');
    }
  }, [router]);

  return null;
}
