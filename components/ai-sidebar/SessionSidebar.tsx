'use client';

import React, { useState, useRef, useEffect, useCallback, useTransition } from 'react';
import {
  Plus,
  Search,
  Trash2,
  Pencil,
  Check,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  ChevronRight,
  Loader2,
  Archive,
  ArchiveRestore,
  BookOpen,
  Brain,
  Copy,
  MoreHorizontal,
} from 'lucide-react';
import type { ChatSession } from './SessionHistory';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 10) return 'Now';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return new Date(dateStr).toLocaleDateString();
}

function hasDiffStats(session: ChatSession): boolean {
  return (
    ((session.linesAdded ?? 0) +
      (session.linesDeleted ?? 0) +
      (session.filesAffected ?? 0)) >
    0
  );
}

function displaySessionId(sessionId: string): string {
  const compact = sessionId.replace(/-/g, '').slice(0, 8).toUpperCase();
  return `CHAT-${compact}`;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SessionSidebarProps {
  sessions: ChatSession[];
  archivedSessions?: ChatSession[];
  activeSessionId: string | null;
  isLoading?: boolean;
  onSwitch: (sessionId: string) => void;
  onNew: () => void;
  onDelete?: (sessionId: string) => void;
  onRename?: (sessionId: string, title: string) => void;
  onArchive?: (sessionId: string) => void;
  onUnarchive?: (sessionId: string) => void;
  onArchiveAll?: () => void;
  onArchiveOlderThan?: (days: number) => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  onLoadAllHistory?: () => void;
  isLoadingAllHistory?: boolean;
  /** Open prompt template library (moved from input bar into sidebar). */
  onOpenTemplates?: () => void;
  /** Open training review panel. */
  onOpenTraining?: () => void;
  /** Recent Shopify push records for version visibility. */
  pushLog?: Array<{
    id: string;
    pushedAt: string;
    trigger: string;
    note: string | null;
    fileCount: number;
  }>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const COLLAPSED_WIDTH = 44;
const EXPANDED_WIDTH = 220;
const STORAGE_KEY = 'synapse-session-sidebar-collapsed';
const SEARCH_DEBOUNCE_MS = 300;

export function SessionSidebar({
  sessions,
  archivedSessions = [],
  activeSessionId,
  isLoading = false,
  onSwitch,
  onNew,
  onDelete,
  onRename,
  onArchive,
  onUnarchive,
  onArchiveAll,
  onArchiveOlderThan,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
  onLoadAllHistory,
  isLoadingAllHistory = false,
  onOpenTemplates,
  onOpenTraining,
  pushLog = [],
}: SessionSidebarProps) {
  const [, startSidebarTransition] = useTransition();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(STORAGE_KEY) === '1';
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [copiedSessionId, setCopiedSessionId] = useState<string | null>(null);
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false);
  const bulkMenuRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggleCollapsed = useCallback(() => {
    startSidebarTransition(() => setCollapsed((v) => !v));
  }, []);

  const expandSidebar = useCallback(() => {
    startSidebarTransition(() => setCollapsed(false));
  }, []);

  const handleNewClick = useCallback(() => {
    if (isCreatingNew || !onNew) return;
    setIsCreatingNew(true);
    Promise.resolve(onNew()).finally(() => setIsCreatingNew(false));
  }, [onNew, isCreatingNew]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim().toLowerCase());
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery]);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  useEffect(() => {
    if (!bulkMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (bulkMenuRef.current && !bulkMenuRef.current.contains(e.target as Node)) {
        setBulkMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [bulkMenuOpen]);

  const handleStartRename = useCallback((session: ChatSession) => {
    setEditingId(session.id);
    setEditTitle(session.title);
  }, []);

  const handleConfirmRename = useCallback(() => {
    if (editingId && editTitle.trim() && onRename) {
      onRename(editingId, editTitle.trim());
    }
    setEditingId(null);
  }, [editingId, editTitle, onRename]);

  const handleCancelRename = useCallback(() => {
    setEditingId(null);
  }, []);

  const filteredSessions = debouncedQuery
    ? sessions.filter((s) =>
        s.title.toLowerCase().includes(debouncedQuery) ||
        s.id.toLowerCase().includes(debouncedQuery) ||
        displaySessionId(s.id).toLowerCase().includes(debouncedQuery),
      )
    : sessions;

  const filteredArchived = debouncedQuery
    ? archivedSessions.filter((s) =>
        s.title.toLowerCase().includes(debouncedQuery) ||
        s.id.toLowerCase().includes(debouncedQuery) ||
        displaySessionId(s.id).toLowerCase().includes(debouncedQuery),
      )
    : archivedSessions;

  const visiblePushLog = pushLog.slice(0, 8);

  // If active list is empty but archived has items, auto-open archived so
  // prior chats are immediately visible.
  useEffect(() => {
    if (collapsed) return;
    if (archivedOpen) return;
    if (filteredSessions.length === 0 && filteredArchived.length > 0) {
      setArchivedOpen(true);
    }
  }, [collapsed, archivedOpen, filteredSessions.length, filteredArchived.length]);

  const renderSessionItem = (session: ChatSession, isArchived = false) => {
    const isActive = session.id === activeSessionId;
    const isEditing = session.id === editingId;
    const isInProgress = isActive && isLoading;

    if (collapsed) {
      return (
        <button
          key={session.id}
          type="button"
          onClick={() => onSwitch(session.id)}
          className={`w-full flex items-center justify-center py-2.5 transition-colors ${
            isActive
              ? 'ide-active border-l-2 border-accent'
              : 'ide-hover border-l-2 border-transparent'
          }`}
          title={session.title || 'Untitled agent'}
          aria-label={session.title || 'Untitled agent'}
        >
          {isInProgress ? (
            <Loader2 className="h-3.5 w-3.5 text-accent animate-spin" />
          ) : (
            <Check
              className={`h-3.5 w-3.5 ${isActive ? 'text-accent' : 'ide-text-quiet'}`}
            />
          )}
        </button>
      );
    }

    return (
      <div
        key={session.id}
        className={`group flex items-start gap-2 px-2 py-2 cursor-pointer transition-colors ${
          isActive
            ? 'ide-active border-l-2 border-accent'
            : 'ide-hover border-l-2 border-transparent'
        }`}
        onClick={() => {
          if (!isEditing) onSwitch(session.id);
        }}
        aria-label={`${session.title || 'Untitled agent'}${isInProgress ? ' - in progress' : ''}`}
      >
        <div className="shrink-0 mt-0.5">
          {isInProgress ? (
            <Loader2 className="h-3.5 w-3.5 text-accent animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5 text-accent" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="flex items-center gap-1">
              <input
                ref={editInputRef}
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleConfirmRename();
                  if (e.key === 'Escape') handleCancelRename();
                }}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 min-w-0 ide-input px-1.5 py-0.5 text-[10px]"
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleConfirmRename();
                }}
                className="p-0.5 text-accent hover:text-accent"
              >
                <Check className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCancelRename();
                }}
                className="p-0.5 ide-text-muted hover:ide-text-2"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <>
              <p className="text-[11px] ide-text truncate leading-tight">
                {session.title || 'Untitled agent'}
              </p>
              <div className="mt-0.5 flex items-center gap-1">
                <span
                  className="inline-flex items-center rounded border ide-border-subtle px-1 py-0.5 text-[9px] font-mono ide-text-muted"
                  title={session.id}
                >
                  {displaySessionId(session.id)}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard?.writeText(session.id).then(() => {
                      setCopiedSessionId(session.id);
                      setTimeout(() => {
                        setCopiedSessionId((prev) => (prev === session.id ? null : prev));
                      }, 1500);
                    }).catch(() => {});
                  }}
                  className="inline-flex items-center justify-center rounded p-0.5 ide-text-quiet hover:ide-text-2 ide-hover transition-colors"
                  title={copiedSessionId === session.id ? 'Copied full session id' : 'Copy full session id'}
                  aria-label="Copy full session id"
                >
                  <Copy className="h-2.5 w-2.5" />
                </button>
              </div>
              {hasDiffStats(session) ? (
                <p className="text-[10px] leading-tight mt-0.5 flex items-center gap-1.5">
                  <span className="text-green-500 dark:text-green-400">
                    +{session.linesAdded ?? 0}
                  </span>
                  <span className="text-red-500 dark:text-red-400">
                    -{session.linesDeleted ?? 0}
                  </span>
                  <span className="ide-text-muted">
                    {session.filesAffected ?? 0} Files
                  </span>
                </p>
              ) : (
                <p className="text-[10px] ide-text-muted leading-tight mt-0.5">
                  {relativeTime(session.updatedAt)}
                </p>
              )}
            </>
          )}
        </div>

        {!isEditing && hasDiffStats(session) && (
          <span className="text-[9px] ide-text-muted shrink-0 mt-0.5">
            {relativeTime(session.updatedAt)}
          </span>
        )}

        {!isEditing && (
          <div className="hidden group-hover:flex items-center gap-0.5 shrink-0 mt-0.5">
            {onRename && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleStartRename(session);
                }}
                className="p-0.5 rounded ide-text-quiet hover:ide-text-2 ide-hover"
                title="Rename"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
            {!isArchived && onArchive && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onArchive(session.id);
                }}
                className="p-0.5 rounded ide-text-quiet hover:ide-text-2 ide-hover"
                title="Archive"
              >
                <Archive className="h-3 w-3" />
              </button>
            )}
            {isArchived && onUnarchive && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onUnarchive(session.id);
                }}
                className="p-0.5 rounded ide-text-quiet hover:ide-text-2 ide-hover"
                title="Unarchive"
              >
                <ArchiveRestore className="h-3 w-3" />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(session.id);
                }}
                className="p-0.5 rounded ide-text-quiet hover:text-red-400 hover:bg-red-500/10"
                title="Delete"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="flex flex-col border-r ide-border-subtle ide-surface-panel shrink-0 h-full overflow-hidden transition-[width] duration-200"
      style={{ width: collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH }}
    >
      {/* ── Expanded header ─────────────────────────────────────────── */}
      {!collapsed && (
        <>
          <div className="flex items-center justify-between shrink-0 border-b ide-border-subtle px-2 py-1.5 gap-1">
            <span className="text-[11px] font-semibold ide-text-2 truncate min-w-0">
              Agents
            </span>
            {onOpenTemplates && (
              <button
                type="button"
                onClick={onOpenTemplates}
                className="p-1.5 rounded ide-text-muted hover:ide-text ide-hover transition-colors shrink-0"
                title="Prompt templates"
                aria-label="Open prompt templates"
              >
                <BookOpen className="h-3.5 w-3.5" />
              </button>
            )}
            {onOpenTraining && (
              <button
                type="button"
                onClick={onOpenTraining}
                className="p-1.5 rounded ide-text-muted hover:ide-text ide-hover transition-colors shrink-0"
                title="Training review"
                aria-label="Open training review"
              >
                <Brain className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={toggleCollapsed}
              className="p-1 rounded ide-text-muted hover:ide-text ide-hover transition-colors shrink-0 ml-auto"
              title="Collapse sidebar"
            >
              <PanelLeftClose className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="shrink-0 px-2 pt-2 pb-1 space-y-1.5">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 ide-text-muted pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Agents..."
                aria-label="Search agents"
                className="w-full ide-input pl-6 pr-2 py-1 text-[11px] rounded"
              />
            </div>
            <button
              type="button"
              onClick={handleNewClick}
              disabled={isCreatingNew}
              aria-label="New agent"
              className="w-full flex items-center justify-center gap-1.5 bg-accent hover:bg-accent-hover text-white rounded px-2 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-70 disabled:pointer-events-none"
            >
              {isCreatingNew ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              New Agent
            </button>
            {hasMore && onLoadAllHistory && (
              <button
                type="button"
                onClick={onLoadAllHistory}
                disabled={isLoadingAllHistory || isLoadingMore}
                className="w-full flex items-center justify-center gap-1.5 ide-surface-inset border ide-border-subtle rounded px-2 py-1 text-[10px] font-medium ide-text-muted hover:ide-text transition-colors disabled:opacity-60 disabled:pointer-events-none"
                title="Load all remaining history"
                aria-label="Load all history"
              >
                {(isLoadingAllHistory || isLoadingMore) ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading history...
                  </>
                ) : (
                  'Load all history'
                )}
              </button>
            )}
          </div>
        </>
      )}

      {/* ── Collapsed vertical icon bar ───────────────────────────────── */}
      {collapsed && (
        <div className="flex flex-col items-center gap-1 shrink-0 border-b ide-border-subtle py-2">
          <button
            type="button"
            onClick={expandSidebar}
            className="p-1.5 rounded ide-text-muted hover:ide-text ide-hover transition-colors"
            title="Expand sidebar"
            aria-label="Expand sidebar"
          >
            <PanelLeftOpen className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={handleNewClick}
            disabled={isCreatingNew}
            className="p-1.5 rounded bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-70 disabled:pointer-events-none"
            title="New agent"
            aria-label="New agent"
          >
            {isCreatingNew ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          </button>
          {onOpenTemplates && (
            <button
              type="button"
              onClick={onOpenTemplates}
              className="p-1.5 rounded ide-text-muted hover:ide-text ide-hover transition-colors"
              title="Prompt templates"
              aria-label="Open prompt templates"
            >
              <BookOpen className="h-3.5 w-3.5" />
            </button>
          )}
          {onOpenTraining && (
            <button
              type="button"
              onClick={onOpenTraining}
              className="p-1.5 rounded ide-text-muted hover:ide-text ide-hover transition-colors"
              title="Training review"
              aria-label="Open training review"
            >
              <Brain className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {!collapsed && (
          <div className="px-2 pt-2 pb-1 flex items-center justify-between group/header">
            <span className="text-[10px] font-semibold uppercase tracking-wider ide-text-muted">
              Agents
            </span>
            {(onArchiveAll || onArchiveOlderThan) && sessions.length > 0 && (
              <div className="relative" ref={bulkMenuRef}>
                <button
                  type="button"
                  onClick={() => setBulkMenuOpen((v) => !v)}
                  className="p-0.5 rounded ide-text-quiet hover:ide-text-2 ide-hover opacity-0 group-hover/header:opacity-100 transition-opacity"
                  title="Bulk archive options"
                  aria-label="Bulk archive options"
                >
                  <MoreHorizontal className="h-3 w-3" />
                </button>
                {bulkMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 w-44 ide-surface-panel border ide-border-subtle rounded-md shadow-lg z-50 py-0.5 text-[11px]">
                    {onArchiveOlderThan && (
                      <>
                        <button
                          type="button"
                          className="w-full text-left px-3 py-1.5 ide-hover ide-text-2 flex items-center gap-2"
                          onClick={() => { onArchiveOlderThan(1); setBulkMenuOpen(false); }}
                        >
                          <Archive className="h-3 w-3 ide-text-muted shrink-0" />
                          Archive older than 1 day
                        </button>
                        <button
                          type="button"
                          className="w-full text-left px-3 py-1.5 ide-hover ide-text-2 flex items-center gap-2"
                          onClick={() => { onArchiveOlderThan(7); setBulkMenuOpen(false); }}
                        >
                          <Archive className="h-3 w-3 ide-text-muted shrink-0" />
                          Archive older than 7 days
                        </button>
                      </>
                    )}
                    {onArchiveAll && (
                      <button
                        type="button"
                        className="w-full text-left px-3 py-1.5 ide-hover text-red-400 dark:text-red-400 flex items-center gap-2"
                        onClick={() => { onArchiveAll(); setBulkMenuOpen(false); }}
                      >
                        <Archive className="h-3 w-3 shrink-0" />
                        Archive all
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {filteredSessions.length === 0 && !collapsed && (
          <p className="px-2 py-6 text-center text-[10px] ide-text-muted">
            {debouncedQuery ? 'No matching agents' : 'No agents yet'}
          </p>
        )}

        {filteredSessions.map((s) => renderSessionItem(s, false))}

        {hasMore && !collapsed && (
          <button
            type="button"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="w-full px-2 py-2 text-[10px] ide-text-muted hover:ide-text ide-hover transition-colors flex items-center justify-center gap-1.5"
          >
            {isLoadingMore ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading...
              </>
            ) : (
              '... More'
            )}
          </button>
        )}

        {(filteredArchived.length > 0 ||
          (archivedSessions.length > 0 && !debouncedQuery)) &&
          !collapsed && (
            <>
              <div className="border-t ide-border-subtle mt-1" />
              <button
                type="button"
                onClick={() => setArchivedOpen((v) => !v)}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider ide-text-muted hover:ide-text transition-colors"
              >
                {archivedOpen ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                Archived
                <span className="font-normal">
                  ({filteredArchived.length})
                </span>
              </button>
              {archivedOpen && (
                <>
                  {filteredArchived.length === 0 && (
                    <p className="px-2 py-4 text-center text-[10px] ide-text-muted">
                      No archived agents
                    </p>
                  )}
                  {filteredArchived.map((s) => renderSessionItem(s, true))}
                </>
              )}
            </>
          )}

        {!collapsed && visiblePushLog.length > 0 && (
          <>
            <div className="border-t ide-border-subtle mt-1" />
            <div className="px-2 py-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider ide-text-muted">
                Push log
              </span>
            </div>
            <div className="pb-1">
              {visiblePushLog.map((entry) => (
                <div
                  key={entry.id}
                  className="px-2 py-1.5 border-l-2 border-transparent"
                  title={entry.note ?? undefined}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] ide-text truncate">
                      {entry.note?.trim() || (entry.trigger === 'manual' ? 'Manual push' : `${entry.trigger.replace('_', ' ')} push`)}
                    </span>
                    <span className="text-[10px] ide-text-muted shrink-0">
                      {entry.fileCount} file{entry.fileCount === 1 ? '' : 's'}
                    </span>
                  </div>
                  <p className="text-[10px] ide-text-muted">
                    {relativeTime(entry.pushedAt)}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
