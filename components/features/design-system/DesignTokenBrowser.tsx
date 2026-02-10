'use client';

import { useState, useMemo } from 'react';
import { useDesignTokens, type DesignTokensResponse } from '@/hooks/useDesignTokens';
import { TokenCard, type TokenType } from './TokenCard';
import { DesignHealthScore } from './DesignHealthScore';

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
    <div className="border-b border-gray-800/60 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-800/40 transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          className={`w-3 h-3 text-gray-500 transition-transform ${open ? 'rotate-90' : ''}`}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        <span className="text-gray-500 w-4 text-center font-mono text-[10px]">{def.icon}</span>
        <span className="font-medium text-gray-300">{def.label}</span>
        <span className="ml-auto text-[10px] text-gray-600 tabular-nums">
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
  const { data, tokens, isLoading, error, refetch } = useDesignTokens(projectId);
  const [search, setSearch] = useState('');
  const [scanning, setScanning] = useState(false);

  const totalTokens = useMemo(() => {
    if (!tokens) return 0;
    return (
      tokens.colors.length +
      tokens.fonts.length +
      tokens.fontSizes.length +
      tokens.spacing.length +
      tokens.radii.length +
      tokens.shadows.length
    );
  }, [tokens]);

  const handleScan = async () => {
    setScanning(true);
    try {
      await refetch();
    } finally {
      setScanning(false);
    }
  };

  // ── Loading state ──────────────────────────────────────────────────────────
  if (isLoading && !data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
        <div className="w-5 h-5 border-2 border-gray-600 border-t-blue-400 rounded-full animate-spin mb-3" />
        <p className="text-xs text-gray-500">Analyzing theme tokens…</p>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (error && !data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
        <p className="text-xs text-red-400 mb-2">{error}</p>
        <button
          type="button"
          onClick={handleScan}
          className="text-xs text-blue-400 hover:text-blue-300 underline"
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
        <div className="w-12 h-12 mb-3 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-6 h-6 text-gray-500"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4.098 19.902a3.75 3.75 0 005.304 0l6.401-6.402M6.75 21A3.75 3.75 0 013 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 003.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008z"
            />
          </svg>
        </div>
        <p className="text-sm text-gray-400 font-medium mb-1">No tokens found</p>
        <p className="text-[11px] text-gray-500 mb-3">
          Import a theme to discover design tokens
        </p>
        <button
          type="button"
          onClick={handleScan}
          disabled={scanning}
          className="text-xs px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
        >
          {scanning ? 'Scanning…' : 'Scan Theme'}
        </button>
      </div>
    );
  }

  // ── Populated state ────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Header */}
      <div className="px-3 pt-3 pb-2 space-y-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
            Design Tokens
          </h3>
          <button
            type="button"
            onClick={handleScan}
            disabled={scanning || isLoading}
            className="text-[10px] px-2 py-1 rounded bg-gray-800 border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600 disabled:opacity-50 transition-colors"
          >
            {scanning ? 'Scanning…' : 'Scan Theme'}
          </button>
        </div>

        {/* Summary */}
        <p className="text-[10px] text-gray-500">
          {totalTokens} token{totalTokens !== 1 ? 's' : ''} across{' '}
          {data?.fileCount ?? 0} file{(data?.fileCount ?? 0) !== 1 ? 's' : ''}
        </p>

        {/* Search */}
        <div className="relative">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500"
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
            className="w-full pl-7 pr-2 py-1.5 text-xs bg-gray-800/60 border border-gray-700/60 rounded-md text-gray-300 placeholder-gray-600 focus:outline-none focus:border-gray-600 transition-colors"
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
            values={tokens[def.key]}
            searchQuery={search}
            defaultOpen={i === 0}
          />
        ))}
      </div>
    </div>
  );
}
