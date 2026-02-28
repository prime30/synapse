'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { AuthProvider } from '@/components/features/auth/AuthProvider';
import { GorgiasProvider } from '@/components/support/CrispProvider';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { UpdateToast } from '@/components/features/desktop/UpdateToast';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <GorgiasProvider>{children}</GorgiasProvider>
          <UpdateToast />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
