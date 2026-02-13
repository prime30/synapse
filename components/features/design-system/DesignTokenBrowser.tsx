'use client';

import { useState, useMemo } from 'react';
import { useDesignTokens, type DesignTokensResponse } from '@/hooks/useDesignTokens';
import { TokenCard, type TokenType } from './TokenCard';
import { DesignHealthScore } from './DesignHealthScore';
import { ScanProgressIndicator } from './ScanProgressIndicator';

// ---------------------------------------------------------------------------
// Category config
// ---------------------------------------------------------------------------

interface CategoryDef {
  key: keyof DesignTokensResponse;
  label: string;
  tokenType: TokenType;
  icon: string;
}

const CATEGORIES: CategoryDef[] = [
  { key: 'colors', label: 'Colors', tokenType: 'color', icon: '◆' },
  { key: 'fonts', label: 'Typography', tokenType: 'font', icon: 'Aa' },
  { key: 'fontSizes', label: 'Font Sizes', tokenType: 'fontSize', icon: '↕' },
  { key: 'spacing', label: 'Spacing', tokenType: 'spacing', icon: '⇔' },
  { key: 'radii', label: 'Borders', tokenType: 'radius', icon: '◠' },
  { key: 'shadows', label: 'Shadows', tokenType: 'shadow', icon: '▣' },
];

// ---------------------------------------------------------------------------
// Collapsible section
// ---------------------------------------------------------------------------

function CategorySection({
  def,
  values,
  searchQuery,
  defaultOpen,
}: {
  def: CategoryDef;
  values: string[];
  searchQuery: string;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const filtered = useMemo(() => {
    if (!searchQuery) return values;
    const q = searchQuery.toLowerCase();
    return values.filter((v) => v.toLowerCase().includes(q));
  }, [values, searchQuery]);

  if (filtered.length === 0) return null;

  return (
    <div className="border-b ide-border-subtle last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs ide-hover transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          className={`w-3 h-3 ide-text-muted transition-transform ${open ? 'rotate-90' : ''}`}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        <span className="ide-text-muted w-4 text-center font-mono text-[10px]">{def.icon}</span>
        <span className="font-medium ide-text-2">{def.label}</span>
        <span className="ml-auto text-[10px] ide-text-quiet tabular-nums">
          {filtered.length}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-2 space-y-1">
          {filtered.map((val, i) => (
            <TokenCard key={`${val}-${i}`} value={val} type={def.tokenType} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main browser
// ---------------------------------------------------------------------------

export interface DesignTokenBrowserProps {
  projectId: string;
}

export function DesignTokenBrowser({ projectId }: DesignTokenBrowserProps) {
  const { data, tokens, isLoading, isScanning, scanProgress, error, scan, cancelScan } = useDesignTokens(projectId);
  const [search, setSearch] = useState('');

  const totalTokens = useMemo(() => {
    if (!tokens) return 0;
    return (
      (tokens.colors?.length ?? 0) +
      (tokens.fonts?.length ?? 0) +
      (tokens.fontSizes?.length ?? 0) +
      (tokens.spacing?.length ?? 0) +
      (tokens.radii?.length ?? 0) +
      (tokens.shadows?.length ?? 0)
    );
  }, [tokens]);

  const handleScan = async () => {
    await scan();
  };

  // ── Scanning state (compact progress) ──────────────────────────────────
  if (scanProgress && !data) {
    return (
      <div className="flex-1 flex flex-col">
        <ScanProgressIndicator progress={scanProgress} onCancel={cancelScan} compact />
      </div>
    );
  }

  // ── Loading state ──────────────────────────────────────────────────────────
  if (isLoading && !data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
        <div className="w-5 h-5 border-2 ide-border border-t-sky-500 rounded-full animate-spin mb-3" />
        <p className="text-xs ide-text-muted">Analyzing theme tokens…</p>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (error && !data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
        <p className="text-xs text-red-500 dark:text-red-400 mb-2">{error}</p>
        <button
          type="button"
          onClick={handleScan}
          className="text-xs text-sky-500 dark:text-sky-400 hover:text-sky-400 dark:hover:text-sky-300 underline"
        >
          Retry
        </button>
      </div>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────────────
  if (!tokens || totalTokens === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
        {scanProgress ? (
          <ScanProgressIndicator progress={scanProgress} onCancel={cancelScan} compact />
        ) : (
          <>
            <div className="w-12 h-12 mb-3 rounded-lg ide-surface-panel border ide-border flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-6 h-6 ide-text-muted"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4.098 19.902a3.75 3.75 0 005.304 0l6.401-6.402M6.75 21A3.75 3.75 0 013 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 003.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008z"
                />
              </svg>
            </div>
            <p className="text-sm ide-text-2 font-medium mb-1">No tokens found</p>
            <p className="text-[11px] ide-text-muted mb-3">
              Import a theme to discover design tokens
            </p>
            <button
              type="button"
              onClick={handleScan}
              disabled={isScanning}
              className="text-xs px-3 py-1.5 rounded-md bg-accent text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              Scan Theme
            </button>
          </>
        )}
      </div>
    );
  }

  // ── Populated state ────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Header */}
      <div className="px-3 pt-3 pb-2 space-y-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold ide-text-2 uppercase tracking-wider">
            Design Tokens
          </h3>
          {scanProgress ? (
            <div className="flex items-center gap-2">
              <div className="w-16 h-1.5 rounded-full ide-surface-inset overflow-hidden">
                <div
                  className="h-full rounded-full bg-sky-500 transition-all duration-300"
                  style={{ width: `${scanProgress.percent}%` }}
                />
              </div>
              <span className="text-[10px] ide-text-muted tabular-nums">{scanProgress.percent}%</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleScan}
              disabled={isScanning || isLoading}
              className="text-[10px] px-2 py-1 rounded ide-surface-input border ide-border ide-text-muted hover:ide-text-2 hover:border-stone-400 dark:hover:border-white/20 disabled:opacity-50 transition-colors"
            >
              Scan Theme
            </button>
          )}
        </div>

        {/* Summary */}
        <p className="text-[10px] ide-text-muted">
          {totalTokens} token{totalTokens !== 1 ? 's' : ''} found
          {data?.tokenCount ? ` (${data.tokenCount} in DB)` : ''}
        </p>

        {/* Search */}
        <div className="relative">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 ide-text-muted"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>
          <input
            type="text"
            placeholder="Filter tokens…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-7 pr-2 py-1.5 text-xs ide-surface-input border ide-border rounded-md ide-text placeholder-stone-400 dark:placeholder-white/40 focus:outline-none focus:border-stone-400 dark:focus:border-white/20 transition-colors"
          />
        </div>
      </div>

      {/* Health score */}
      <div className="px-3 pb-2 flex-shrink-0">
        <DesignHealthScore tokens={tokens} fileCount={data?.fileCount ?? 0} />
      </div>

      {/* Token categories (scrollable) */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {CATEGORIES.map((def, i) => (
          <CategorySection
            key={def.key}
            def={def}
            values={tokens[def.key] ?? []}
            searchQuery={search}
            defaultOpen={i === 0}
          />
        ))}
      </div>
    </div>
  );
}
