'use client';

import { useEffect } from 'react';
import { useAuth } from '@/components/features/auth/AuthProvider';

// ---------------------------------------------------------------------------
// Gorgias Chat type augmentation (minimal subset)
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    GorgiasChat?: {
      init: () => void;
      open: () => void;
      close: () => void;
      hideBubble: () => void;
      showBubble: () => void;
      updateContact: (data: { email?: string; name?: string }) => void;
    };
  }
}

// ---------------------------------------------------------------------------
// GorgiasProvider
// ---------------------------------------------------------------------------

const GORGIAS_CHAT_ID = process.env.NEXT_PUBLIC_GORGIAS_CHAT_ID;

/**
 * Loads the Gorgias Chat widget SDK once at the app level.
 *
 * When `NEXT_PUBLIC_GORGIAS_CHAT_ID` is set, this component:
 * 1. Injects the Gorgias chat loader script into `<head>`
 * 2. Identifies the current user (email + name) when auth state is available
 * 3. Hides Gorgias's default floating bubble (we use our own SupportButton)
 *
 * If the env var is missing, the component renders nothing and has no effect.
 */
export function GorgiasProvider({ children }: { children: React.ReactNode }) {
  // Load the Gorgias script once on mount
  useEffect(() => {
    if (!GORGIAS_CHAT_ID) return;
    if (typeof window === 'undefined') return;

    // Bail if already loaded
    if (document.getElementById('gorgias-chat-widget')) return;

    const script = document.createElement('script');
    script.id = 'gorgias-chat-widget';
    script.src = `https://config.gorgias.chat/bundle-loader/${GORGIAS_CHAT_ID}`;
    script.async = true;

    // Once loaded, hide the default bubble — we use our own SupportButton
    script.onload = () => {
      // Gorgias may take a moment to initialize; poll briefly
      const interval = setInterval(() => {
        if (window.GorgiasChat) {
          window.GorgiasChat.hideBubble();
          clearInterval(interval);
        }
      }, 200);
      // Stop polling after 10s
      setTimeout(() => clearInterval(interval), 10_000);
    };

    document.head.appendChild(script);
  }, []);

  // Identify user when auth state changes
  const { user } = useAuth();

  useEffect(() => {
    if (!GORGIAS_CHAT_ID || typeof window === 'undefined') return;
    if (!window.GorgiasChat) return;

    const email = user?.email;
    const fullName = user?.user_metadata?.full_name as string | undefined;

    if (email || fullName) {
      window.GorgiasChat.updateContact({
        ...(email ? { email } : {}),
        ...(fullName ? { name: fullName } : {}),
      });
    }
  }, [user?.email, user?.user_metadata?.full_name]);

  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// Helpers (consumed by the Chat tab in SupportPanel)
// ---------------------------------------------------------------------------

/** Open the Gorgias chat box programmatically. */
export function openSupportChat(): void {
  if (typeof window === 'undefined' || !window.GorgiasChat) return;
  window.GorgiasChat.open();
}

/** Check whether Gorgias chat is configured. */
export function isChatAvailable(): boolean {
  return !!GORGIAS_CHAT_ID;
}
