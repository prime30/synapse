'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useChromaticSettings } from '@/hooks/useChromaticSettings';
import type { ChromaticPalette, ChromaticCSSVars } from '@/lib/design-tokens/chromatic-engine';
import { generateChromaticVars } from '@/lib/design-tokens/chromatic-engine';

const VAR_PREFIX = '--ide-ambient-';

interface ChromaticProviderProps {
  children: ReactNode;
  /** The current theme's extracted palette. Pass null when no theme is loaded. */
  palette: ChromaticPalette | null;
}

/** Remove all `--ide-ambient-*` CSS custom properties from `:root`. */
function clearAmbientVars(prev: ChromaticCSSVars | null) {
  if (typeof document === 'undefined' || !prev) return;
  const style = document.documentElement.style;
  for (const key of Object.keys(prev)) style.removeProperty(key);
  style.removeProperty(`${VAR_PREFIX}transition`);
}

/**
 * Provider that injects chromatic ambient CSS custom properties into `:root`
 * and renders a subtle radial-gradient overlay driven by the active theme palette.
 *
 * Wrap the application (or editor shell) with this component inside a
 * {@link ChromaticSettingsProvider} so that `useChromaticSettings` is available.
 */
export function ChromaticProvider({ children, palette }: ChromaticProviderProps) {
  const { settings } = useChromaticSettings();
  const prevVarsRef = useRef<ChromaticCSSVars | null>(null);

  // Apply / remove CSS variables on :root
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const style = document.documentElement.style;

    if (!settings.enabled || !palette) {
      clearAmbientVars(prevVarsRef.current);
      prevVarsRef.current = null;
      return;
    }

    const vars = generateChromaticVars(palette, settings.intensity / 100);

    // Set the transition property first so subsequent changes animate
    style.setProperty(`${VAR_PREFIX}transition`, `${settings.transitionDuration}ms ease-in-out`);

    for (const [key, value] of Object.entries(vars) as [keyof ChromaticCSSVars, string][]) {
      style.setProperty(key, value);
    }

    prevVarsRef.current = vars;
  }, [palette, settings.enabled, settings.intensity, settings.transitionDuration]);

  // Cleanup on unmount
  useEffect(() => {
    return () => clearAmbientVars(prevVarsRef.current);
  }, []);

  const gradientOpacity = (settings.intensity / 100) * 0.05;

  return (
    <>
      {settings.enabled && palette && (
        <div
          className="fixed inset-0 pointer-events-none z-0"
          style={{
            background:
              'radial-gradient(ellipse at center, var(--ide-ambient-primary-hsl, transparent) 0%, transparent 70%)',
            opacity: gradientOpacity,
            transition: `opacity var(--ide-ambient-transition, 1.2s ease-in-out), background var(--ide-ambient-transition, 1.2s ease-in-out)`,
          }}
          aria-hidden="true"
        />
      )}
      {children}
    </>
  );
}
