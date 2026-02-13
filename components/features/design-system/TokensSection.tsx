'use client';

import { useState, useMemo, useCallback } from 'react';
import { useDesignTokens, type DesignTokensResponse } from '@/hooks/useDesignTokens';

interface TokensSectionProps {
  projectId: string;
}

/* ── Category definitions ──────────────────────────────────────────── */

interface CategoryDef {
  key: keyof DesignTokensResponse;
  label: string;
  icon: string;
}

const CATEGORIES: CategoryDef[] = [
  { key: 'colors', label: 'Colors', icon: '◆' },
  { key: 'fonts', label: 'Typography', icon: 'Aa' },
  { key: 'fontSizes', label: 'Font Sizes', icon: '↕' },
  { key: 'spacing', label: 'Spacing', icon: '⇔' },
  { key: 'radii', label: 'Borders', icon: '◠' },
  { key: 'shadows', label: 'Shadows', icon: '▣' },
];

/* ── Token preview ─────────────────────────────────────────────────── */

function TokenPreview({ value, category }: { value: string; category: string }) {
  if (category === 'colors') {
    return (
      <div
        className="w-8 h-8 rounded border ide-border flex-shrink-0"
        style={{ backgroundColor: value }}
        title={value}
      />
    );
  }
  if (category === 'fonts') {
    return (
      <span className="text-sm ide-text truncate max-w-[120px]" style={{ fontFamily: value }} title={value}>
        Aa Bb
      </span>
    );
  }
  if (category === 'fontSizes') {
    return (
      <span className="ide-text leading-none" style={{ fontSize: value }} title={value}>
        Aa
      </span>
    );
  }
  if (category === 'spacing') {
    const numMatch = value.match(/([\d.]+)/);
    const numeric = numMatch ? parseFloat(numMatch[1]) : 0;
    const barWidth = Math.min(Math.max(numeric * 4, 4), 100);
    return <div className="h-3 rounded-sm bg-accent/50" style={{ width: `${barWidth}px` }} />;
  }
  if (category === 'radii') {
    return (
      <div
        className="w-8 h-8 border-2 border-accent/50 bg-transparent"
        style={{ borderRadius: value }}
        title={value}
      />
    );
  }
  if (category === 'shadows') {
    return (
      <div
        className="w-8 h-8 rounded ide-surface-panel"
        style={{ boxShadow: value }}
        title={value}
      />
    );
  }
  return null;
}

/* ── Copy button ───────────────────────────────────────────────────── */

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  }, [value]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="text-[10px] px-1.5 py-0.5 rounded ide-surface-input border ide-border-subtle ide-text-muted hover:ide-text-2 transition-colors flex-shrink-0"
      aria-label={`Copy ${value}`}
      title="Copy value"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

/* ── Skeleton ──────────────────────────────────────────────────────── */

function TokenSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 animate-pulse">
      <div className="w-8 h-8 rounded ide-surface-input flex-shrink-0" />
      <div className="h-3 flex-1 rounded ide-surface-input" />
      <div className="h-3 w-10 rounded ide-surface-input" />
    </div>
  );
}

/* ── Component ─────────────────────────────────────────────────────── */

export function TokensSection({ projectId }: TokensSectionProps) {
  const { tokens, isLoading, data } = useDesignTokens(projectId);
  const [activeCategory, setActiveCategory] = useState<string>('colors');
  const [search, setSearch] = useState('');

  const activeDef = CATEGORIES.find(c => c.key === activeCategory) ?? CATEGORIES[0];

  const rawValues = useMemo(() => {
    return tokens?.[activeDef.key] ?? [];
  }, [tokens, activeDef.key]);

  const filtered = useMemo(() => {
    if (!search) return rawValues;
    const q = search.toLowerCase();
    return rawValues.filter(v => v.toLowerCase().includes(q));
  }, [rawValues, search]);

  const totalTokens = useMemo(() => {
    if (!tokens) return 0;
    return CATEGORIES.reduce((sum, c) => sum + (tokens[c.key]?.length ?? 0), 0);
  }, [tokens]);

  /* ── Empty state ──────────────────────────────────────── */
  if (!isLoading && (!tokens || totalTokens === 0)) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-14 h-14 mb-4 rounded-xl ide-surface-panel border ide-border flex items-center justify-center">
          <span className="text-2xl ide-text-muted">◆</span>
        </div>
        <h3 className="text-base font-semibold ide-text mb-1">No tokens found</h3>
        <p className="text-sm ide-text-2 max-w-xs">
          Run a scan from the Overview tab to discover design tokens in your theme.
        </p>
      </div>
    );
  }

  /* ── Loading ──────────────────────────────────────────── */
  if (isLoading && !data) {
    return (
      <div className="space-y-4">
        <div className="flex gap-2">
          {CATEGORIES.map(c => (
            <div key={c.key} className="h-8 w-20 rounded-full ide-surface-input animate-pulse" />
          ))}
        </div>
        {Array.from({ length: 6 }).map((_, i) => <TokenSkeleton key={i} />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Category pills */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Token categories">
        {CATEGORIES.map(cat => {
          const count = tokens?.[cat.key]?.length ?? 0;
          const isActive = activeCategory === cat.key;
          return (
            <button
              key={cat.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveCategory(cat.key)}
              className={`
                flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border transition-colors
                ${isActive
                  ? 'bg-accent/10 border-accent ide-text'
                  : 'ide-surface-panel ide-border-subtle ide-text-muted hover:ide-text-2'}
              `}
            >
              <span className="font-mono text-[10px]">{cat.icon}</span>
              {cat.label}
              <span className="tabular-nums opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ide-text-muted">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input
          type="text"
          placeholder="Filter tokens…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm ide-surface-input border ide-border-subtle rounded-lg ide-text placeholder:ide-text-quiet focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-[var(--background)] transition-colors"
        />
      </div>

      {/* Token list */}
      <div className="border ide-border rounded-lg divide-y ide-border-subtle overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm ide-text-muted">
            No tokens match &quot;{search}&quot;
          </div>
        ) : (
          filtered.map((val, i) => (
            <div
              key={`${val}-${i}`}
              className="flex items-center gap-3 px-4 py-2.5 ide-hover transition-colors"
            >
              <TokenPreview value={val} category={activeDef.key} />
              <span className="text-sm font-mono ide-text truncate flex-1 min-w-0">{val}</span>
              <CopyButton value={val} />
            </div>
          ))
        )}
      </div>

      {/* Footer count */}
      <p className="text-xs ide-text-muted">
        Showing {filtered.length} of {rawValues.length} {activeDef.label.toLowerCase()}
      </p>
    </div>
  );
}
