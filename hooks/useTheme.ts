'use client';

import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'synapse-theme';
const CUSTOM_EVENT = 'synapse-theme-change';

// ── External store helpers ────────────────────────────────────────────────────

function getSnapshot(): boolean {
  return document.documentElement.classList.contains('dark');
}

function getServerSnapshot(): boolean {
  // Default to light on the server — the inline <script> in layout.tsx
  // applies .dark before paint so there's no flash for dark-mode users.
  return false;
}

function subscribe(onStoreChange: () => void): () => void {
  // Same-tab reactivity (triggered by toggle())
  window.addEventListener(CUSTOM_EVENT, onStoreChange);
  // Cross-tab sync via localStorage events
  window.addEventListener('storage', onStoreChange);
  return () => {
    window.removeEventListener(CUSTOM_EVENT, onStoreChange);
    window.removeEventListener('storage', onStoreChange);
  };
}

// ── Apply / remove dark class + persist ───────────────────────────────────────

function setDark(dark: boolean): void {
  if (dark) {
    document.documentElement.classList.add('dark');
    localStorage.setItem(STORAGE_KEY, 'dark');
  } else {
    document.documentElement.classList.remove('dark');
    localStorage.setItem(STORAGE_KEY, 'light');
  }
  // Notify same-tab subscribers
  window.dispatchEvent(new Event(CUSTOM_EVENT));
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Shared theme hook used by the marketing Navbar and the onboarding wizard.
 *
 * - Reads from `localStorage('synapse-theme')` + the `.dark` class on `<html>`
 * - SSR-safe via `useSyncExternalStore` (returns `false` on the server)
 * - Cross-tab sync via the `storage` event
 */
export function useTheme(): { isDark: boolean; toggle: () => void } {
  const isDark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(() => {
    setDark(!document.documentElement.classList.contains('dark'));
  }, []);

  return { isDark, toggle };
}
