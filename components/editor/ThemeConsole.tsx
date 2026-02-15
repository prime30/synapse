'use client';

import { useState } from 'react';

export type ThemeConsoleTab = 'diagnostics' | 'push-log' | 'theme-check' | 'tasks';

export interface ThemeConsoleEntry {
  id: string;
  level: 'info' | 'warning' | 'error' | 'success';
  message: string;
  timestamp: number;
  details?: string;
}

export interface ThemeConsoleProps {
  isOpen: boolean;
  onToggle: () => void;
  /** Active tab */
  activeTab: ThemeConsoleTab;
  onTabChange: (tab: ThemeConsoleTab) => void;
  /** Entries for current tab */
  entries: ThemeConsoleEntry[];
  /** Per-tab counts */
  counts: Record<string, number>;
  onClear: () => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = (now - timestamp) / 1000; // seconds

  if (diff < 5) return 'just now';
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const TAB_LABELS: Record<ThemeConsoleTab, string> = {
  diagnostics: 'Diagnostics',
  'push-log': 'Push Log',
  'theme-check': 'Theme Check',
  tasks: 'Tasks',
};

const LEVEL_COLORS: Record<ThemeConsoleEntry['level'], string> = {
  error: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-sky-500',
  success: 'bg-emerald-500',
};

/* ------------------------------------------------------------------ */
/*  Icons (inline SVG)                                                 */
/* ------------------------------------------------------------------ */

const iconProps = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const TrashIcon = (
  <svg {...iconProps}>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
);

const ChevronDownIcon = (
  <svg {...iconProps}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const ChevronRightIcon = (
  <svg {...iconProps}>
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

/* ------------------------------------------------------------------ */
/*  Entry row (expandable details)                                     */
/* ------------------------------------------------------------------ */

function ConsoleEntryRow({ entry }: { entry: ThemeConsoleEntry }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = !!entry.details;
  const colorClass = LEVEL_COLORS[entry.level];

  return (
    <div className="group border-b ide-border-subtle last:border-b-0">
      <div
        className={`flex items-start gap-2 px-3 py-2 text-[12px] ide-hover transition-colors ${
          hasDetails ? 'cursor-pointer' : ''
        }`}
        onClick={() => hasDetails && setExpanded((e) => !e)}
      >
        <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${colorClass}`} aria-hidden />
        <span className="flex-1 min-w-0 ide-text-2 break-words">{entry.message}</span>
        <span className="shrink-0 ide-text-quiet text-[11px]">{formatRelativeTime(entry.timestamp)}</span>
        {hasDetails && (
          <span className="shrink-0 ide-text-muted mt-0.5">
            {expanded ? ChevronDownIcon : ChevronRightIcon}
          </span>
        )}
      </div>
      {hasDetails && expanded && (
        <div className="px-3 pb-2 pl-7 text-[11px] ide-text-muted font-mono whitespace-pre-wrap break-words ide-surface-input">
          {entry.details}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ThemeConsole({
  isOpen,
  onToggle,
  activeTab,
  onTabChange,
  entries,
  counts,
  onClear,
}: ThemeConsoleProps) {
  return (
    <div className="flex flex-col border-t ide-border ide-surface-panel">
      {/* Collapsed bar: always visible, click to expand */}
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-2 h-7 px-3 ide-surface border-t ide-border text-[11px] ide-text-3 hover:ide-text-2 ide-hover transition-colors shrink-0 select-none"
        aria-expanded={isOpen}
        aria-label={isOpen ? 'Close console' : 'Open console'}
      >
        <span>{isOpen ? '▼' : '▲'} Console</span>
        <span className="flex items-center gap-1.5">
          {(['diagnostics', 'push-log', 'theme-check', 'tasks'] as const).map((tab) => {
            const n = counts[tab] ?? 0;
            return (
              <span
                key={tab}
                className={`px-1.5 py-0.5 rounded text-[10px] ${
                  activeTab === tab ? 'ide-active ide-text-2' : 'ide-surface-inset ide-text-muted'
                }`}
              >
                {TAB_LABELS[tab].replace(/\s.+$/, '')} {n}
              </span>
            );
          })}
        </span>
      </button>

      {/* Expanded panel */}
      <div
        className="overflow-hidden transition-[max-height] duration-200 ease-out"
        style={{ maxHeight: isOpen ? 200 : 0 }}
      >
        <div className="h-[200px] flex flex-col ide-surface-panel">
          {/* Tab bar */}
          <div className="flex items-center gap-1 px-2 py-1.5 border-b ide-border shrink-0 ide-surface-input">
            {(['diagnostics', 'push-log', 'theme-check', 'tasks'] as const).map((tab) => {
              const n = counts[tab] ?? 0;
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onTabChange(tab);
                  }}
                  className={`px-3 py-1.5 rounded text-[11px] transition-colors ${
                    isActive
                      ? 'ide-active ide-text'
                      : 'ide-text-muted hover:ide-text-2 ide-hover'
                  }`}
                >
                  {TAB_LABELS[tab]}
                  {n > 0 && (
                    <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] ${isActive ? 'ide-surface-panel ide-text-2' : 'ide-surface-inset ide-text-muted'}`}>
                      {n}
                    </span>
                  )}
                </button>
              );
            })}

            <div className="flex-1" />

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              className="p-1.5 rounded ide-text-muted hover:ide-text-2 ide-hover transition-colors"
              title="Clear"
              aria-label="Clear entries"
            >
              {TrashIcon}
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              className="p-1.5 rounded ide-text-muted hover:ide-text-2 ide-hover transition-colors"
              title="Close"
              aria-label="Close console"
            >
              {ChevronDownIcon}
            </button>
          </div>

          {/* Entry list */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {entries.length === 0 ? (
              <div className="h-full flex items-center justify-center ide-text-quiet text-[12px]">No entries</div>
            ) : (
              <div className="py-1">
                {entries.map((entry) => (
                  <ConsoleEntryRow key={entry.id} entry={entry} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
