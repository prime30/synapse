'use client';

import { useState } from 'react';
import { useDesignComponents, type DesignComponent } from '@/hooks/useDesignComponents';

interface ComponentsSectionProps {
  projectId: string;
  onOpenFile?: (filePath: string) => void;
}

/* ── Type badge ────────────────────────────────────────────────────── */

const TYPE_COLORS: Record<string, string> = {
  section: 'bg-violet-500/15 text-violet-500 border-violet-500/25',
  snippet: 'ide-active text-sky-500 dark:text-sky-400 border-sky-500/30',
  css_class: 'bg-amber-500/15 text-amber-500 border-amber-500/25',
  js_component: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/25',
};

function TypeBadge({ type }: { type: string }) {
  const colors = TYPE_COLORS[type] ?? 'ide-surface-input ide-text-muted ide-border-subtle';
  const label = type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded-full border ${colors}`}
    >
      {label}
    </span>
  );
}

/* ── Token pills ──────────────────────────────────────────────────── */

function TokenPills({ names, maxShow = 3 }: { names: string[]; maxShow?: number }) {
  if (!names || names.length === 0) return null;

  const shown = names.slice(0, maxShow);
  const overflow = names.length - maxShow;

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {shown.map((name) => (
        <span
          key={name}
          className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono rounded bg-accent/10 text-accent border border-accent/20 max-w-[120px] truncate"
          title={name}
        >
          {name}
        </span>
      ))}
      {overflow > 0 && (
        <span className="text-[10px] ide-text-muted">+{overflow} more</span>
      )}
    </div>
  );
}

/* ── Skeleton ──────────────────────────────────────────────────────── */

function ComponentSkeleton() {
  return (
    <div className="flex items-center gap-4 px-4 py-3 animate-pulse">
      <div className="h-3 w-24 rounded ide-surface-input" />
      <div className="h-4 w-14 rounded-full ide-surface-input" />
      <div className="h-3 w-40 rounded ide-surface-input flex-1" />
      <div className="h-3 w-12 rounded ide-surface-input" />
    </div>
  );
}

/* ── Component row ─────────────────────────────────────────────────── */

function ComponentRow({
  component,
  onOpen,
}: {
  component: DesignComponent;
  onOpen?: (path: string) => void;
}) {
  const fileCount = component.files?.length ?? 0;
  const tokenCount = component.tokens_used?.length ?? 0;

  return (
    <div className="flex items-center gap-4 px-4 py-3 ide-hover transition-colors">
      {/* Name */}
      <span className="text-sm font-medium ide-text min-w-[120px]">{component.name}</span>

      {/* Type badge */}
      <TypeBadge type={component.component_type} />

      {/* Token count pill */}
      {tokenCount > 0 && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-accent/10 text-accent border border-accent/20">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3 h-3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.098 19.902a3.75 3.75 0 005.304 0l6.401-6.402M6.75 21A3.75 3.75 0 013 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 003.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.59 0l3.712 3.713c.44.44.44 1.152 0 1.59l-2.879 2.88M6.75 17.25h.008v.008H6.75v-.008z" />
          </svg>
          {tokenCount} token{tokenCount !== 1 ? 's' : ''}
        </span>
      )}

      {/* Primary file */}
      <span
        className="text-xs font-mono ide-text-muted truncate flex-1 min-w-0"
        title={component.file_path}
      >
        {component.file_path}
      </span>

      {/* File count */}
      {fileCount > 0 && (
        <span className="text-xs ide-text-muted flex-shrink-0 tabular-nums">
          {fileCount} file{fileCount !== 1 ? 's' : ''}
        </span>
      )}

      {/* Open button */}
      <button
        type="button"
        onClick={() => onOpen?.(component.file_path)}
        className="text-xs px-2.5 py-1 rounded border ide-border-subtle ide-text-2 hover:ide-text hover:border-accent transition-colors flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-accent"
        aria-label={`Open ${component.name}`}
      >
        Open
      </button>
    </div>
  );
}

/* ── Component ─────────────────────────────────────────────────────── */

export function ComponentsSection({ projectId, onOpenFile }: ComponentsSectionProps) {
  const { components, isLoading, error } = useDesignComponents(projectId);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  /* ── Error ────────────────────────────────────────────── */
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-sm text-red-400 mb-2">{error}</p>
      </div>
    );
  }

  /* ── Loading ──────────────────────────────────────────── */
  if (isLoading && components.length === 0) {
    return (
      <div className="border ide-border rounded-lg divide-y ide-border-subtle overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <ComponentSkeleton key={i} />
        ))}
      </div>
    );
  }

  /* ── Empty state ──────────────────────────────────────── */
  if (components.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-14 h-14 mb-4 rounded-xl ide-surface-panel border ide-border flex items-center justify-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="w-7 h-7 ide-text-muted"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L12 12.75 6.43 9.75m11.14 0l4.179 2.25L12 17.25 2.25 12l4.179-2.25m11.142 0l4.179 2.25-9.75 5.25-9.75-5.25 4.179-2.25"
            />
          </svg>
        </div>
        <h3 className="text-base font-semibold ide-text mb-1">No components detected</h3>
        <p className="text-sm ide-text-2 max-w-xs">
          Run a scan from the Overview tab to detect theme components.
        </p>
      </div>
    );
  }

  /* ── Populated ────────────────────────────────────────── */
  return (
    <div className="space-y-4">
      {/* Header with view toggle */}
      <div className="flex items-center justify-between">
        <p className="text-sm ide-text-2">
          {components.length} component{components.length !== 1 ? 's' : ''} detected
        </p>
        <div className="flex items-center gap-1 border ide-border-subtle rounded-lg p-0.5">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`px-2 py-1 text-xs rounded transition-colors ${viewMode === 'list' ? 'bg-accent/10 ide-text' : 'ide-text-muted hover:ide-text-2'}`}
            aria-label="List view"
          >
            List
          </button>
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={`px-2 py-1 text-xs rounded transition-colors ${viewMode === 'grid' ? 'bg-accent/10 ide-text' : 'ide-text-muted hover:ide-text-2'}`}
            aria-label="Grid view"
          >
            Grid
          </button>
        </div>
      </div>

      {/* List view */}
      {viewMode === 'list' && (
        <div className="border ide-border rounded-lg divide-y ide-border-subtle overflow-hidden">
          {components.map((comp) => (
            <ComponentRow
              key={comp.id ?? comp.file_path}
              component={comp}
              onOpen={onOpenFile}
            />
          ))}
        </div>
      )}

      {/* Grid view */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {components.map((comp) => {
            const fileCount = comp.files?.length ?? 0;
            const tokenCount = comp.tokens_used?.length ?? 0;
            return (
              <div
                key={comp.id ?? comp.file_path}
                className="p-4 rounded-lg border ide-border ide-surface-panel ide-hover transition-colors"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium ide-text truncate">{comp.name}</span>
                  <TypeBadge type={comp.component_type} />
                </div>

                {/* Token pills in grid */}
                {tokenCount > 0 && (
                  <div className="mb-2">
                    <TokenPills names={comp.token_names ?? []} maxShow={3} />
                  </div>
                )}

                <p
                  className="text-xs font-mono ide-text-muted truncate mb-3"
                  title={comp.file_path}
                >
                  {comp.file_path}
                </p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {fileCount > 0 && (
                      <span className="text-xs ide-text-muted tabular-nums">
                        {fileCount} file{fileCount !== 1 ? 's' : ''}
                      </span>
                    )}
                    {tokenCount > 0 && (
                      <span className="text-xs text-accent tabular-nums">
                        {tokenCount} token{tokenCount !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenFile?.(comp.file_path)}
                    className="text-xs px-2 py-1 rounded border ide-border-subtle ide-text-2 hover:ide-text hover:border-accent transition-colors ml-auto focus:outline-none focus:ring-2 focus:ring-accent"
                    aria-label={`Open ${comp.name}`}
                  >
                    Open
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
