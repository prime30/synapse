'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface PreloaderContextValue {
  /** True once the preloader has fully exited */
  ready: boolean;
  /** Called by the Preloader when its exit animation completes */
  markReady: () => void;
}

const Ctx = createContext<PreloaderContextValue>({ ready: false, markReady: () => {} });

export function PreloaderProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const markReady = useCallback(() => setReady(true), []);

  return <Ctx value={{ ready, markReady }}>{children}</Ctx>;
}

/** Returns true once the preloader has finished and page animations should begin */
export function usePageReady(): boolean {
  return useContext(Ctx).ready;
}

/** Returns the markReady callback for the Preloader to call */
export function useMarkPageReady(): () => void {
  return useContext(Ctx).markReady;
}
