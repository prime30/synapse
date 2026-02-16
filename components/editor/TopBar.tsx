'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Users, FileText } from 'lucide-react';
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

export interface CollabPeerSummary {
  userId: string;
  name: string;
  color: string;
  avatarUrl?: string;
  cursor?: { lineNumber: number; column: number } | null;
  filePath?: string | null;
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
  collaborativeMode?: boolean;
  onCollaborativeModeChange?: (enabled: boolean) => void;
  /** Yjs collaborative peers (from useCollaborativeEditor) merged into the avatar stack */
  collabPeers?: CollabPeerSummary[];
  /** Called when user clicks a file in the collaborator dropdown */
  onNavigateToFile?: (filePath: string) => void;
  /** The current user's ID — used to fix own-user presence race condition */
  currentUserId?: string | null;
  /** Local active file path — used as fallback when presence hasn't synced yet */
  activeFilePath?: string | null;
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
/*  CollaboratorPopover                                                */
/* ------------------------------------------------------------------ */

interface CollaboratorPopoverProps {
  fullName?: string | null;
  userId: string;
  avatarUrl?: string | null;
  color: string;
  filePath?: string | null;
  cursor?: { lineNumber: number; column: number } | null;
  onNavigateToFile?: (filePath: string) => void;
}

function CollaboratorPopover({
  fullName,
  userId,
  avatarUrl,
  color,
  filePath,
  cursor,
  onNavigateToFile,
}: CollaboratorPopoverProps) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const displayName = fullName?.trim() || userId.slice(0, 8);
  const basename = filePath ? filePath.split('/').pop() : null;

  return (
    <div ref={popoverRef} className="relative">
      <div
        role="button"
        tabIndex={0}
        className="ring-2 ring-[var(--background)] rounded-full cursor-pointer hover:ring-gray-500 transition-all"
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen((prev) => !prev);
          }
        }}
        title={`${displayName}${filePath ? ` — ${filePath}` : ''}`}
      >
        <UserAvatar
          avatarUrl={avatarUrl}
          fullName={fullName}
          userId={userId}
          fallbackColor={color}
          size="sm"
        />
      </div>

      {open && (
        <div className="absolute top-full right-0 mt-2 min-w-[200px] bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50 p-3">
          <div className="flex items-center gap-2.5 mb-2">
            <UserAvatar
              avatarUrl={avatarUrl}
              fullName={fullName}
              userId={userId}
              fallbackColor={color}
              size="md"
            />
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium text-white truncate">{displayName}</span>
              <span className="flex items-center gap-1.5 text-[10px] text-gray-400">
                <span
                  className="inline-block w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                />
                Online
              </span>
            </div>
          </div>

          <div className="border-t border-gray-700 my-2" />

          {filePath && basename ? (
            <div>
              <button
                type="button"
                className="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-gray-300 hover:bg-gray-800 rounded-md transition-colors text-left"
                onClick={() => {
                  onNavigateToFile?.(filePath);
                  setOpen(false);
                }}
              >
                <FileText className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                <span className="truncate">{basename}</span>
              </button>
              {cursor && (
                <span className="block px-2 mt-0.5 text-[10px] text-gray-500">
                  Line {cursor.lineNumber}, Col {cursor.column}
                </span>
              )}
            </div>
          ) : (
            <span className="block px-2 text-[11px] text-gray-500">No file open</span>
          )}
        </div>
      )}
    </div>
  );
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
  collaborativeMode = false,
  onCollaborativeModeChange,
  collabPeers = [],
  onNavigateToFile,
  currentUserId,
  activeFilePath: localActiveFilePath,
}: TopBarProps) {
  const handleReportClick = () => {
    if (!devReport && onRefreshReport) onRefreshReport();
    onOpenReport?.();
  };

  // Build unified collaborator list from workspace presence + Yjs peers.
  // Each entry gets a unique key so the same user in two tabs appears twice.
  const unifiedCollaborators = React.useMemo(() => {
    const list: Array<{
      key: string;
      user_id: string;
      full_name?: string | null;
      avatar_url?: string | null;
      color: string;
      file_path?: string | null;
      cursor?: { lineNumber: number; column: number } | null;
      source: 'presence' | 'collab';
    }> = [];

    const seenUserSources = new Set<string>();

    // Index collab peers by userId for fast cursor lookup
    const peerByUserId = new Map<string, CollabPeerSummary>();
    collabPeers.forEach((peer) => {
      peerByUserId.set(peer.userId, peer);
    });

    // Add workspace presence entries (one per tab/session, keyed by index)
    presence.forEach((p, idx) => {
      const key = `presence-${p.user_id}-${idx}`;
      seenUserSources.add(`presence-${p.user_id}`);
      const matchingPeer = peerByUserId.get(p.user_id);
      // Fix race: presence may broadcast file_path=null while rawFiles is still loading.
      // For the current user, fall back to the locally-known activeFilePath.
      const effectiveFilePath =
        p.file_path ?? (currentUserId && p.user_id === currentUserId ? (localActiveFilePath ?? null) : null);
      list.push({
        key,
        user_id: p.user_id,
        full_name: p.full_name,
        avatar_url: p.avatar_url,
        color: p.color,
        file_path: effectiveFilePath,
        cursor: matchingPeer?.cursor ?? null,
        source: 'presence',
      });
    });

    // Add Yjs collab peers that aren't already represented in presence
    collabPeers.forEach((peer, idx) => {
      if (!seenUserSources.has(`presence-${peer.userId}`)) {
        list.push({
          key: `collab-${peer.userId}-${idx}`,
          user_id: peer.userId,
          full_name: peer.name,
          avatar_url: peer.avatarUrl ?? null,
          color: peer.color,
          file_path: peer.filePath ?? null,
          cursor: peer.cursor ?? null,
          source: 'collab',
        });
      }
    });

    return list;
  }, [presence, collabPeers, currentUserId, localActiveFilePath]);

  return (
    <div className="h-10 flex items-center px-3 gap-3 border-b ide-border-subtle ide-surface shrink-0 select-none">
      {/* Left: Push / Pull + sync status (Project Manager is in Activity Bar) */}
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

      {/* Right: Collaboration toggle + Command palette + presence avatars + User menu */}
      <div className="flex items-center gap-2 shrink-0">
        {onCollaborativeModeChange && (
          <button
            type="button"
            onClick={() => onCollaborativeModeChange(!collaborativeMode)}
            className={
              'flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ' +
              (collaborativeMode
                ? 'ide-surface-inset ide-text text-sky-400'
                : 'ide-text-muted hover:ide-text-2 ide-hover')
            }
            title={collaborativeMode ? 'Live collaboration' : 'Solo mode'}
          >
            <Users className="w-3.5 h-3.5" strokeWidth={2} />
            {collaborativeMode ? 'Live' : 'Solo'}
          </button>
        )}
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

        {/* Active collaborators avatar stack (unified: workspace presence + Yjs peers) */}
        {unifiedCollaborators.length > 0 && (
          <div className="flex items-center -space-x-1.5">
            {unifiedCollaborators.slice(0, 5).map((c) => (
              <CollaboratorPopover
                key={c.key}
                fullName={c.full_name}
                userId={c.user_id}
                avatarUrl={c.avatar_url}
                color={c.color}
                filePath={c.file_path}
                cursor={c.cursor}
                onNavigateToFile={onNavigateToFile}
              />
            ))}
            {unifiedCollaborators.length > 5 && (
              <span
                className="h-6 w-6 rounded-full flex items-center justify-center text-[9px] font-medium ide-text-muted ide-surface-inset ring-2 ring-[var(--background)]"
                title={`${unifiedCollaborators.length - 5} more`}
              >
                +{unifiedCollaborators.length - 5}
              </span>
            )}
          </div>
        )}

        <UserMenu />
      </div>
    </div>
  );
}
