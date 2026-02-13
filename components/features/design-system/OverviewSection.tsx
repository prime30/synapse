'use client';

import { useDesignTokens } from '@/hooks/useDesignTokens';
import { useDesignComponents } from '@/hooks/useDesignComponents';
import { ScanProgressIndicator } from './ScanProgressIndicator';
import { useState, useCallback, useEffect, useRef } from 'react';

interface OverviewSectionProps {
  projectId: string;
  onNavigateTab?: (tab: string) => void;
}

/* ── Skeleton loader ───────────────────────────────────────────────── */

function CardSkeleton() {
  return (
    <div className="p-5 rounded-lg border ide-border ide-surface-panel animate-pulse">
      <div className="h-3 w-16 rounded ide-surface-input mb-3" />
      <div className="h-8 w-20 rounded ide-surface-input mb-2" />
      <div className="h-2.5 w-24 rounded ide-surface-input" />
    </div>
  );
}

/* ── Health score helpers ──────────────────────────────────────────── */

function computeHealthScore(tokens: { colors?: string[]; fonts?: string[]; fontSizes?: string[]; spacing?: string[]; radii?: string[]; shadows?: string[] }): number {
  const total =
    (tokens.colors?.length ?? 0) + (tokens.fonts?.length ?? 0) +
    (tokens.fontSizes?.length ?? 0) + (tokens.spacing?.length ?? 0) +
    (tokens.radii?.length ?? 0) + (tokens.shadows?.length ?? 0);
  if (total === 0) return 0;
  const covered = [
    tokens.colors?.length ?? 0, tokens.fonts?.length ?? 0,
    tokens.fontSizes?.length ?? 0, tokens.spacing?.length ?? 0,
    tokens.radii?.length ?? 0, tokens.shadows?.length ?? 0,
  ].filter(c => c > 0).length;
  return Math.round((covered / 6) * 60 + Math.min(total / 30, 1) * 40);
}

function scoreColor(score: number) {
  if (score >= 70) return 'text-emerald-500';
  if (score >= 40) return 'text-yellow-500';
  return 'text-red-500';
}

/* ── Component ─────────────────────────────────────────────────────── */

export function OverviewSection({ projectId, onNavigateTab }: OverviewSectionProps) {
  const { data: tokenData, isLoading: tokensLoading, isScanning, scanProgress, scan, cancelScan } = useDesignTokens(projectId);
  const { count: componentCount, isLoading: componentsLoading, refetch: refetchComponents } = useDesignComponents(projectId);
  const [toast, setToast] = useState<string | null>(null);
  const prevScanningRef = useRef(isScanning);

  const isLoading = tokensLoading || componentsLoading;
  const tokenCount = tokenData?.tokenCount ?? 0;
  const healthScore = tokenData?.tokens ? computeHealthScore(tokenData.tokens) : 0;
  const isEmpty = !tokensLoading && !componentsLoading && tokenCount === 0 && componentCount === 0 && !isScanning;

  // Show summary toast when scan completes (deferred to avoid cascading render)
  useEffect(() => {
    if (prevScanningRef.current && !isScanning && tokenData) {
      refetchComponents();
      const msg = `Scan complete — ${tokenData.tokenCount} tokens found across ${tokenData.fileCount} files`;
      const raf = requestAnimationFrame(() => {
        setToast(msg);
      });
      const timer = setTimeout(() => setToast(null), 3000);
      return () => {
        cancelAnimationFrame(raf);
        clearTimeout(timer);
      };
    }
    prevScanningRef.current = isScanning;
  }, [isScanning, tokenData, refetchComponents]);

  const handleScan = useCallback(async () => {
    try {
      await scan();
    } catch {
      setToast('Scan failed');
      setTimeout(() => setToast(null), 3000);
    }
  }, [scan]);

  /* ── Empty state ──────────────────────────────────────── */
  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        {scanProgress ? (
          <ScanProgressIndicator progress={scanProgress} onCancel={cancelScan} />
        ) : (
          <>
            <div className="w-14 h-14 mb-4 rounded-xl ide-surface-panel border ide-border flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-7 h-7 ide-text-muted">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.098 19.902a3.75 3.75 0 005.304 0l6.401-6.402M6.75 21A3.75 3.75 0 013 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 003.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008z" />
              </svg>
            </div>
            <h3 className="text-base font-semibold ide-text mb-1">No design system data</h3>
            <p className="text-sm ide-text-2 mb-5 max-w-xs">
              Import a theme or run a scan to discover tokens and components.
            </p>
            <button
              type="button"
              onClick={handleScan}
              disabled={isScanning}
              className="px-5 py-2.5 text-sm font-medium bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors disabled:opacity-50"
            >
              Scan Theme
            </button>
          </>
        )}
      </div>
    );
  }

  /* ── Loading skeletons ─────────────────────────────────── */
  if (isLoading && tokenCount === 0) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    );
  }

  /* ── Populated state ───────────────────────────────────── */
  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-2.5 rounded-lg ide-surface-pop border ide-border shadow-lg text-sm ide-text" role="status" aria-live="polite">
          {toast}
        </div>
      )}

      {/* At-a-glance cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Token count */}
        <button
          type="button"
          onClick={() => onNavigateTab?.('tokens')}
          className="p-5 rounded-lg border ide-border ide-surface-panel ide-hover text-left transition-colors group"
        >
          <p className="text-xs font-medium ide-text-muted uppercase tracking-wider mb-1">Tokens</p>
          <p className="text-3xl font-bold ide-text tabular-nums">{tokenCount}</p>
          <p className="text-xs ide-text-muted mt-1 group-hover:ide-text-2 transition-colors">View all tokens &rarr;</p>
        </button>

        {/* Component count */}
        <button
          type="button"
          onClick={() => onNavigateTab?.('components')}
          className="p-5 rounded-lg border ide-border ide-surface-panel ide-hover text-left transition-colors group"
        >
          <p className="text-xs font-medium ide-text-muted uppercase tracking-wider mb-1">Components</p>
          <p className="text-3xl font-bold ide-text tabular-nums">{componentCount}</p>
          <p className="text-xs ide-text-muted mt-1 group-hover:ide-text-2 transition-colors">View all components &rarr;</p>
        </button>

        {/* Health score */}
        <div className="p-5 rounded-lg border ide-border ide-surface-panel">
          <p className="text-xs font-medium ide-text-muted uppercase tracking-wider mb-1">Health Score</p>
          <p className={`text-3xl font-bold tabular-nums ${scoreColor(healthScore)}`}>{healthScore}</p>
          <p className="text-xs ide-text-muted mt-1">
            {healthScore >= 70 ? 'Good coverage' : healthScore >= 40 ? 'Moderate coverage' : 'Low coverage'}
          </p>
        </div>
      </div>

      {/* Scan CTA */}
      {scanProgress ? (
        <ScanProgressIndicator progress={scanProgress} onCancel={cancelScan} />
      ) : (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleScan}
            disabled={isScanning}
            className="px-4 py-2 text-sm font-medium bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors disabled:opacity-50"
          >
            Scan Theme
          </button>
          {tokenData && (
            <span className="text-xs ide-text-muted">
              {tokenData.fileCount} files analyzed
            </span>
          )}
        </div>
      )}
    </div>
  );
}
