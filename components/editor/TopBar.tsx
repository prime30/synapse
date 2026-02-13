'use client';

import React from 'react';
import { UserMenu } from '@/components/features/auth/UserMenu';

type ViewMode = 'editor' | 'canvas';

export interface TopBarProps {
  onPush?: () => void;
  onPull?: () => void;
  syncStatus?: 'idle' | 'syncing' | 'error';
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onCommandPalette: () => void;
  storeDomain?: string | null;
  connected?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Small inline icons                                                 */
/* ------------------------------------------------------------------ */

const iconProps = {
  width: 14,
  height: 14,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function ArrowDownIcon() {
  return (
    <svg {...iconProps}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <polyline points="19 12 12 19 5 12" />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg {...iconProps}>
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg {...iconProps} width={12} height={12}>
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

function GraphIcon() {
  return (
    <svg {...iconProps} width={12} height={12}>
      <circle cx="6" cy="6" r="3" />
      <circle cx="18" cy="18" r="3" />
      <circle cx="18" cy="6" r="3" />
      <line x1="8.5" y1="7.5" x2="15.5" y2="16.5" />
      <line x1="15" y1="6" x2="9" y2="6" />
    </svg>
  );
}

function CommandIcon() {
  return (
    <svg {...iconProps} width={14} height={14}>
      <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Sync status indicator                                              */
/* ------------------------------------------------------------------ */

function SyncDot({ status }: { status: 'idle' | 'syncing' | 'error' }) {
  const cls =
    status === 'syncing'
      ? 'bg-yellow-500 animate-pulse'
      : status === 'error'
        ? 'bg-red-500'
        : 'bg-green-500';
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${cls}`} />;
}

/* ------------------------------------------------------------------ */
/*  TopBar                                                             */
/* ------------------------------------------------------------------ */

export function TopBar({
  onPush,
  onPull,
  syncStatus = 'idle',
  viewMode,
  onViewModeChange,
  onCommandPalette,
  storeDomain,
  connected,
}: TopBarProps) {
  return (
    <div className="h-10 flex items-center px-3 gap-3 border-b ide-border-subtle ide-surface shrink-0 select-none">
      {/* Left: Push / Pull + sync status */}
      <div className="flex items-center gap-1.5">
        {connected && (
          <>
            <button
              type="button"
              onClick={onPull}
              disabled={syncStatus === 'syncing'}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md ide-text-2 hover:ide-text ide-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Pull from Shopify"
            >
              <ArrowDownIcon />
              Pull
            </button>
            <button
              type="button"
              onClick={onPush}
              disabled={syncStatus === 'syncing'}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md ide-text-2 hover:ide-text ide-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Push to Shopify"
            >
              <ArrowUpIcon />
              Push
            </button>
            <div className="flex items-center gap-1.5 px-2 text-[10px] ide-text-muted">
              <SyncDot status={syncStatus} />
              {storeDomain && <span className="truncate max-w-[140px]">{storeDomain}</span>}
            </div>
          </>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Center-right: Editor / Canvas toggle */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          type="button"
          onClick={() => onViewModeChange('editor')}
          className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
            viewMode === 'editor'
              ? 'ide-surface-inset ide-text'
              : 'ide-text-muted hover:ide-text-2 ide-hover'
          }`}
          title="Editor view"
        >
          <CodeIcon />
          Editor
        </button>
        <button
          type="button"
          onClick={() => onViewModeChange('canvas')}
          className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
            viewMode === 'canvas'
              ? 'ide-surface-inset ide-text'
              : 'ide-text-muted hover:ide-text-2 ide-hover'
          }`}
          title="Canvas view"
        >
          <GraphIcon />
          Canvas
        </button>
      </div>

      {/* Right: Command palette + User menu */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onCommandPalette}
          className="flex items-center gap-1.5 px-2 py-1 text-[11px] ide-text-3 hover:ide-text ide-hover rounded-md transition-colors"
          title="Command Palette (Ctrl+P)"
        >
          <CommandIcon />
            <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded ide-surface-inset border ide-border-subtle text-[10px] ide-text-muted font-mono">
            {'\u2318'}K
          </kbd>
        </button>
        <UserMenu />
      </div>
    </div>
  );
}
