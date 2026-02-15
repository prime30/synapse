'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Plus, Clock, Trash2, Pencil, Check, X, MessageSquare } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatSession {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
  linesAdded?: number;
  linesDeleted?: number;
  filesAffected?: number;
  archivedAt?: string | null;
  // status is derived client-side: activeSessionId + isLoading
}

interface SessionHistoryProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSwitch: (sessionId: string) => void;
  onNew: () => void;
  onDelete?: (sessionId: string) => void;
  onRename?: (sessionId: string, title: string) => void;
}

// ---------------------------------------------------------------------------
// Relative time helper
// ---------------------------------------------------------------------------

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// ---------------------------------------------------------------------------
// SessionHistory
// ---------------------------------------------------------------------------

export function SessionHistory({
  sessions,
  activeSessionId,
  onSwitch,
  onNew,
  onDelete,
  onRename,
}: SessionHistoryProps) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setEditingId(null);
      }
    };
    const timer = setTimeout(() => document.addEventListener('click', handler), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handler);
    };
  }, [open]);

  // Focus edit input when editing starts
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  const handleStartRename = (session: ChatSession) => {
    setEditingId(session.id);
    setEditTitle(session.title);
  };

  const handleConfirmRename = () => {
    if (editingId && editTitle.trim() && onRename) {
      onRename(editingId, editTitle.trim());
    }
    setEditingId(null);
  };

  const handleCancelRename = () => {
    setEditingId(null);
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] ide-text-3 hover:ide-text ide-hover transition-colors focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:outline-none"
        title="Chat history"
        aria-label="Chat history"
      >
        <Clock className="h-3.5 w-3.5" />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-72 rounded-lg border ide-border ide-surface-pop shadow-xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b ide-border-subtle">
            <span className="text-xs font-medium ide-text-2">Chat History</span>
            <button
              type="button"
              onClick={() => {
                onNew();
                setOpen(false);
              }}
              className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium text-sky-500 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-500/10 transition-colors"
            >
              <Plus className="h-3 w-3" />
              New Chat
            </button>
          </div>

          {/* Session list */}
          <div className="max-h-64 overflow-y-auto">
            {sessions.length === 0 && (
              <p className="px-3 py-4 text-center text-[11px] ide-text-quiet">
                No conversations yet.
              </p>
            )}
            {sessions.map((session) => {
              const isActive = session.id === activeSessionId;
              const isEditing = session.id === editingId;

              return (
                <div
                  key={session.id}
                  className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
                    isActive
                      ? 'ide-active border-l-2 border-sky-500'
                      : 'ide-hover border-l-2 border-transparent'
                  }`}
                  onClick={() => {
                    if (!isEditing) {
                      onSwitch(session.id);
                      setOpen(false);
                    }
                  }}
                >
                  <MessageSquare className="h-3.5 w-3.5 shrink-0 ide-text-quiet" />

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
                          className="flex-1 min-w-0 ide-surface-input border border-stone-300 dark:border-white/20 rounded px-1.5 py-0.5 text-[11px] ide-text outline-none focus:border-accent/50"
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleConfirmRename();
                          }}
                          className="p-0.5 text-green-400 hover:text-green-300"
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
                        <p className="text-[11px] ide-text truncate">
                          {session.title || 'Untitled chat'}
                        </p>
                        <p className="text-[10px] ide-text-quiet">
                          {relativeTime(session.updatedAt)}
                          {session.messageCount > 0 && (
                            <span className="ml-1.5">
                              {session.messageCount} msg{session.messageCount !== 1 ? 's' : ''}
                            </span>
                          )}
                        </p>
                      </>
                    )}
                  </div>

                  {/* Actions (visible on hover, hidden when editing) */}
                  {!isEditing && (
                    <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                      {onRename && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartRename(session);
                          }}
                          className="p-1 rounded ide-text-quiet hover:ide-text-2 ide-hover"
                          title="Rename"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      )}
                      {onDelete && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(session.id);
                            // If we deleted the active session, the hook will handle switching
                          }}
                          className="p-1 rounded ide-text-quiet hover:text-red-400 hover:bg-red-500/10"
                          title="Delete"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
