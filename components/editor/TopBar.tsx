'use client';

import React from 'react';
import { UserMenu } from '@/components/features/auth/UserMenu';
import { UserAvatar } from '@/components/ui/UserAvatar';
import type { WorkspacePresence } from '@/hooks/useWorkspacePresence';

export type ViewMode = 'editor' | 'canvas' | 'customize';

export interface DevReportSummary {
  totalFiles: number;
  componentsAffected: number;
  pagesWorked: number;
  totalLinesAdded: number;
}

export interface TopBarProps {
  onPush?: () => void;
  onPull?: () => void;
  syncStatus?: 'idle' | 'syncing' | 'error';
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onCommandPalette: () => void;
  storeDomain?: string | null;
  connected?: boolean;
  /** Shopify theme ID used for preview (dev theme or source theme) */
  themeId?: string | number | null;
  devReport?: DevReportSummary | null;
  isLoadingReport?: boolean;
  onOpenReport?: () => void;
  onRefreshReport?: () => void;
  /** Active workspace collaborators shown as avatar stack */
  presence?: WorkspacePresence[];
  /** Callback when the home/projects button is clicked */
  onHomeClick?: () => void;
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

function CustomizeIcon() {
  return (
    <svg {...iconProps} width={12} height={12}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
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

function HomeGridIcon() {
  return (
    <svg {...iconProps} width={16} height={16}>
      <rect x="3" y="3" width="8" height="8" rx="1" />
      <rect x="13" y="3" width="8" height="8" rx="1" />
      <rect x="3" y="13" width="8" height="8" rx="1" />
      <rect x="13" y="13" width="8" height="8" rx="1" />
    </svg>
  );
}

function ReportIcon() {
  return (
    <svg {...iconProps} width={12} height={12}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
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
  themeId,
  devReport,
  isLoadingReport,
  onOpenReport,
  onRefreshReport,
  presence = [],
  onHomeClick,
}: TopBarProps) {
  const handleReportClick = () => {
    if (!devReport && onRefreshReport) onRefreshReport();
    onOpenReport?.();
  };

  return (
    <div className="h-10 flex items-center px-3 gap-3 border-b ide-border-subtle ide-surface shrink-0 select-none">
      {/* Left: Home + Push / Pull + sync status */}
      <div className="flex items-center gap-1.5">
        {onHomeClick && (
          <button
            type="button"
            onClick={onHomeClick}
            title="Project Manager"
            className="p-1.5 rounded-md hover:bg-gray-800 text-gray-400 hover:text-white transition-colors mr-1.5"
          >
            <HomeGridIcon />
          </button>
        )}
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

      {/* Dev Report stat pills */}
      {connected && (
        <div className="flex items-center gap-1.5">
          {isLoadingReport ? (
            <>
              <span className="inline-block w-14 h-5 rounded-md ide-surface-inset animate-pulse" />
              <span className="inline-block w-12 h-5 rounded-md ide-surface-inset animate-pulse" />
              <span className="inline-block w-14 h-5 rounded-md ide-surface-inset animate-pulse" />
            </>
          ) : devReport ? (
            <>
              <button
                type="button"
                onClick={handleReportClick}
                className="px-2 py-0.5 text-[10px] font-medium rounded-md ide-surface-inset ide-text-3 border ide-border-subtle hover:ide-text-2 transition-colors"
                title="Lines changed since last push"
              >
                {devReport.totalLinesAdded > 0 ? `+${devReport.totalLinesAdded}` : '0'} lines
              </button>
              <button
                type="button"
                onClick={handleReportClick}
                className="px-2 py-0.5 text-[10px] font-medium rounded-md ide-surface-inset ide-text-3 border ide-border-subtle hover:ide-text-2 transition-colors"
                title="Components affected"
              >
                {devReport.componentsAffected} comp
              </button>
              <button
                type="button"
                onClick={handleReportClick}
                className="px-2 py-0.5 text-[10px] font-medium rounded-md ide-surface-inset ide-text-3 border ide-border-subtle hover:ide-text-2 transition-colors"
                title="Pages worked on"
              >
                {devReport.pagesWorked} pages
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={handleReportClick}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md ide-text-2 hover:ide-text ide-hover transition-colors"
            title="Open dev report"
          >
            <ReportIcon />
            {devReport && devReport.totalFiles === 0 ? (
              <span className="ide-text-muted">All synced</span>
            ) : (
              'Dev Report'
            )}
          </button>
          {themeId && (
            <span
              className="px-2 py-0.5 text-[10px] font-mono rounded-md ide-surface-inset ide-text-muted border ide-border-subtle select-all"
              title={`Theme ID: ${themeId}`}
            >
              #{String(themeId)}
            </span>
          )}
        </div>
      )}

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
        <button
          type="button"
          onClick={() => onViewModeChange('customize')}
          className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
            viewMode === 'customize'
              ? 'ide-surface-inset ide-text'
              : 'ide-text-muted hover:ide-text-2 ide-hover'
          }`}
          title="Customize view"
          aria-label="Customize view"
        >
          <CustomizeIcon />
          Customize
        </button>
      </div>

      {/* Right: Command palette + presence avatars + User menu */}
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

        {/* Active collaborators avatar stack */}
        {presence.length > 0 && (
          <div className="flex items-center -space-x-1.5">
            {presence.slice(0, 4).map((user) => (
              <div
                key={user.user_id}
                className="ring-2 ring-[var(--background)] rounded-full"
                title={`${user.full_name?.trim() || user.user_id.slice(0, 8)}${user.file_path ? ` — ${user.file_path}` : ''}`}
              >
                <UserAvatar
                  avatarUrl={user.avatar_url}
                  fullName={user.full_name}
                  userId={user.user_id}
                  fallbackColor={user.color}
                  size="sm"
                />
              </div>
            ))}
            {presence.length > 4 && (
              <span
                className="h-6 w-6 rounded-full flex items-center justify-center text-[9px] font-medium ide-text-muted ide-surface-inset ring-2 ring-[var(--background)]"
                title={`${presence.length - 4} more`}
              >
                +{presence.length - 4}
              </span>
            )}
          </div>
        )}

        <UserMenu />
      </div>
    </div>
  );
}
