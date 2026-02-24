'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';

const SESSION_STORAGE_KEY = 'synapse-theme-session';
const LEGACY_STORAGE_KEY = 'synapse-theme';
const CUSTOM_EVENT = 'synapse-theme-change';

// ── External store helpers ────────────────────────────────────────────────────

function getSnapshot(): boolean {
  return document.documentElement.classList.contains('dark');
}

function getServerSnapshot(): boolean {
  // Default to dark on the server — matches the inline <script> in layout.tsx
  // which defaults to dark for new visitors with no stored preference.
  return true;
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
    document.documentElement.style.colorScheme = 'dark';
    sessionStorage.setItem(SESSION_STORAGE_KEY, 'dark');
  } else {
    document.documentElement.classList.remove('dark');
    document.documentElement.style.colorScheme = 'light';
    sessionStorage.setItem(SESSION_STORAGE_KEY, 'light');
  }
  // Ensure legacy persistent preference cannot override dark-first defaults.
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  // Notify same-tab subscribers
  window.dispatchEvent(new Event(CUSTOM_EVENT));
}

let themeRepaired = false;

/** One-time repair: sync DOM to session preference (run once per page load). */
function repairThemeFromStorage(): void {
  if (themeRepaired) return;
  try {
    const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
    const wantDark = stored ? stored === 'dark' : true;
    const hasDark = document.documentElement.classList.contains('dark');
    // Remove any old persistent theme value so each new session defaults to dark.
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    if (hasDark === wantDark) {
      themeRepaired = true;
      return;
    }
    if (wantDark) {
      document.documentElement.classList.add('dark');
      document.documentElement.style.colorScheme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.style.colorScheme = 'light';
    }
    themeRepaired = true;
    window.dispatchEvent(new Event(CUSTOM_EVENT));
  } catch {
    themeRepaired = true;
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Shared theme hook used by the marketing Navbar and the onboarding wizard.
 *
 * - Defaults to dark for each new browser session
 * - Reads from `sessionStorage('synapse-theme-session')` + the `.dark` class on `<html>`
 * - SSR-safe via `useSyncExternalStore` (returns `false` on the server)
 * - Cross-tab sync via the `storage` event
 * - On mount, repairs DOM to match the current session preference.
 */
export function useTheme(): { isDark: boolean; toggle: () => void } {
  const isDark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // After hydration, ensure DOM matches localStorage (no user action; repair only).
  useEffect(() => {
    repairThemeFromStorage();
  }, []);

  const toggle = useCallback(() => {
    setDark(!document.documentElement.classList.contains('dark'));
  }, []);

  return { isDark, toggle };
}
