/**
 * Environment detection for UI components.
 *
 * These functions detect the runtime context (server, desktop/Electron, web browser).
 * They are safe to call from React components and hooks. Do NOT call from
 * API routes or server-side code — server code should use standard Node.js
 * checks instead.
 */

export function isServer(): boolean {
  return typeof window === 'undefined';
}

export function isDesktop(): boolean {
  return !isServer() && !!window.electron?.isDesktop;
}

/** Alias for isDesktop — Electron is the only desktop runtime. */
export function isElectron(): boolean {
  return isDesktop();
}

export function isWeb(): boolean {
  return !isServer() && !isDesktop();
}
