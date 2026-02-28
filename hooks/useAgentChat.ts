'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { ChatMessage } from '@/components/ai-sidebar/ChatInterface';
import type { ChatSession } from '@/components/ai-sidebar/SessionHistory';
import { logInteractionEvent } from '@/lib/ai/interaction-client';

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

interface UseAgentChatReturn {
  /** Messages for the active session. */
  messages: ChatMessage[];
  /** True while the initial history is being fetched. */
  isLoadingHistory: boolean;
  /** Non-blocking history load warning shown in UI. */
  historyLoadError: string | null;
  /** Add a message to local state and persist it to the DB (fire-and-forget). */
  appendMessage: (role: 'user' | 'assistant', content: string, options?: { imageUrls?: string[] }) => ChatMessage;
  /** Add a message to local state only -- no DB persist. For streaming placeholders. */
  addLocalMessage: (msg: ChatMessage) => void;
  /** Update a message's content in local state only (for streaming chunks). */
  updateMessage: (id: string, content: string, meta?: Partial<Pick<ChatMessage, 'thinkingSteps' | 'thinkingComplete' | 'contextStats' | 'budgetTruncated' | 'planData' | 'codeEdits' | 'clarification' | 'previewNav' | 'fileCreates' | 'activeToolCall' | 'citations' | 'fileOps' | 'shopifyOps' | 'screenshots' | 'screenshotComparison' | 'workers' | 'blocks' | 'activeModel' | 'rateLimitHit' | 'executionOutcome' | 'failureReason' | 'suggestedAction' | 'failedTool' | 'failedFilePath' | 'reviewFailedSection' | 'referentialReplayFailed' | 'verificationEvidence' | 'worktreeStatus' | 'backgroundTask'>>) => void;
  /** Persist the final content of a streamed message to the DB. */
  finalizeMessage: (id: string) => void;

  // ── Multi-session ────────────────────────────────────────────────────────
  /** Active (non-archived) sessions for this project (newest first). */
  sessions: ChatSession[];
  /** Archived sessions for this project (newest first). */
  archivedSessions: ChatSession[];
  /** ID of the currently active session (null if none yet). */
  activeSessionId: string | null;
  /** Create a new empty session and switch to it. Pass cleanStart to suppress cross-session recall. */
  createNewSession: (opts?: { cleanStart?: boolean }) => Promise<void>;
  /** Switch to an existing session by ID. */
  switchSession: (sessionId: string) => Promise<void>;
  /** Delete a session. Switches to the next session or empty state. */
  deleteSession: (sessionId: string) => Promise<void>;
  /** Rename a session. */
  renameSession: (sessionId: string, title: string) => Promise<void>;
  /** Archive a session. Auto-switches if it's the active session. */
  archiveSession: (sessionId: string) => Promise<void>;
  /** Archive all sessions (optionally older than N days). */
  archiveAllSessions: (olderThanDays?: number) => Promise<void>;
  /** Unarchive a session back to active list. */
  unarchiveSession: (sessionId: string) => Promise<void>;
  /** Load more active sessions (pagination). */
  loadMore: () => Promise<void>;
  /** Whether there are more active sessions to load. */
  hasMore: boolean;
  /** Whether more sessions are currently loading. */
  isLoadingMore: boolean;
  /** Load all remaining active sessions (up to safety cap). */
  loadAllHistory: () => Promise<void>;
  /** Whether full-history load is currently running. */
  isLoadingAllHistory: boolean;
  /** Record diff stats for a session after applying code. Non-blocking. */
  recordApplyStats: (sessionId: string, stats: { linesAdded: number; linesDeleted: number; filesAffected: number }) => void;
  /** Clear local messages (visual clear). */
  clearMessages: () => void;
  /** Remove the last user + assistant pair and return the last user message content (for regenerate). */
  removeLastTurn: () => string | null;
  /** Truncate messages to the given index (inclusive) and return the remaining messages (for edit-and-resend). */
  truncateAt: (index: number) => void;
  /** Phase 5a: Fork conversation at a specific message index. Returns new session ID. */
  forkSession: (messageIndex: number) => Promise<string | null>;
  /** Analyze the active session transcript for loop/CX patterns. */
  reviewSessionTranscript: (sessionId?: string) => Promise<{
    likelyLooping: boolean;
    summary: string;
    findings: Array<{ severity: 'info' | 'warning' | 'error'; message: string }>;
    stats?: Record<string, unknown>;
  } | null>;
  /** Generate a summary of the current session and start a new chat with it pre-populated. */
  continueInNewChat: () => Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapMessages(
  raw: { id: string; role: string; content: string; timestamp: string }[],
): ChatMessage[] {
  return raw.map((m) => ({
    id: m.id,
    role: m.role as 'user' | 'assistant',
    content: m.content,
    timestamp: new Date(m.timestamp),
  }));
}

function mapSessionFromApi(s: Record<string, unknown>): ChatSession {
  return {
    id: s.id as string,
    title: (s.title as string) ?? 'Untitled',
    updatedAt: (s.updatedAt as string) ?? new Date().toISOString(),
    messageCount: (s.messageCount as number) ?? 0,
    linesAdded: (s.linesAdded as number) ?? 0,
    linesDeleted: (s.linesDeleted as number) ?? 0,
    filesAffected: (s.filesAffected as number) ?? 0,
    archivedAt: (s.archivedAt as string | null) ?? null,
  };
}

function isNonEmptySession(session: ChatSession): boolean {
  return (session.messageCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Hook that manages agent chat messages with Supabase persistence and
 * multi-session support.
 *
 * - On mount: loads the session list + the most recent session's messages.
 * - `appendMessage`: adds to local state, POSTs to the active session.
 * - `createNewSession` / `switchSession` / `deleteSession` / `renameSession`:
 *   manage the session lifecycle.
 */
const PAGE_SIZE = 20;

export function useAgentChat(projectId: string): UseAgentChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [historyLoadError, setHistoryLoadError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [archivedSessions, setArchivedSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isLoadingAllHistory, setIsLoadingAllHistory] = useState(false);
  const offsetRef = useRef(0);
  const messagesRef = useRef<ChatMessage[]>([]);
  const activeSessionRef = useRef<string | null>(null);
  const isFirstUserMessageRef = useRef(true);
  const cleanStartSessionIds = useRef(new Set<string>());

  // Keep refs in sync
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    activeSessionRef.current = activeSessionId;
  }, [activeSessionId]);

  // ── Load sessions + latest session messages on mount / project change ────

  useEffect(() => {
    let cancelled = false;
    setIsLoadingHistory(true);

    (async () => {
      let activeTotalFromApi = 0;
      let archivedTotalFromApi = 0;
      try {
        // Load in parallel: active session list + archived list + latest session messages
        const [sessionsRes, archivedRes, latestRes] = await Promise.all([
          fetch(`/api/projects/${projectId}/agent-chat/sessions?archived=false&limit=${PAGE_SIZE}&offset=0`),
          fetch(`/api/projects/${projectId}/agent-chat/sessions?archived=true&limit=100`),
          fetch(`/api/projects/${projectId}/agent-chat`),
        ]);

        if (cancelled) return;

        // Active sessions list
        if (sessionsRes.ok) {
          const sessionsJson = await sessionsRes.json();
          const payload = sessionsJson?.data;
          const list = payload?.sessions ?? payload ?? [];
          const firstPageRaw: ChatSession[] = list.map(mapSessionFromApi);
          let loaded: ChatSession[] = firstPageRaw.filter(isNonEmptySession);
          let hasMoreFromApi = Boolean(payload?.hasMore ?? false);
          let nextOffset = firstPageRaw.length;
          activeTotalFromApi = Number(payload?.total ?? firstPageRaw.length);

          // Auto-page additional history on first load so users see older sessions
          // without having to manually click "... More".
          const MAX_AUTO_PAGES = 5; // up to 100 sessions at PAGE_SIZE=20
          for (let page = 1; page < MAX_AUTO_PAGES && hasMoreFromApi; page++) {
            const nextRes = await fetch(
              `/api/projects/${projectId}/agent-chat/sessions?archived=false&limit=${PAGE_SIZE}&offset=${nextOffset}`,
            );
            if (!nextRes.ok) break;
            const nextJson = await nextRes.json();
            const nextPayload = nextJson?.data;
            const nextList = (nextPayload?.sessions ?? nextPayload ?? []) as Record<string, unknown>[];
            const nextRaw = nextList.map(mapSessionFromApi);
            if (nextRaw.length === 0) break;
            loaded = [...loaded, ...nextRaw.filter(isNonEmptySession)];
            nextOffset += nextRaw.length;
            hasMoreFromApi = Boolean(nextPayload?.hasMore ?? false);
          }

          if (!cancelled) {
            setSessions(loaded);
            setHasMore(hasMoreFromApi);
            offsetRef.current = nextOffset;
            setHistoryLoadError(null);
          }
        } else if (!cancelled) {
          setHistoryLoadError('Could not load previous sessions. Refresh to retry.');
        }

        // Archived sessions list
        if (archivedRes.ok) {
          const archivedJson = await archivedRes.json();
          const payload = archivedJson?.data;
          const list = payload?.sessions ?? payload ?? [];
          const loaded: ChatSession[] = list
            .map(mapSessionFromApi)
            .filter(isNonEmptySession);
          archivedTotalFromApi = Number(payload?.total ?? list.length);
          if (!cancelled) setArchivedSessions(loaded);
        }

        // Latest session messages
        if (latestRes.ok) {
          const latestJson = await latestRes.json();
          const session = latestJson?.data?.session;
          const msgs = mapMessages(latestJson?.data?.messages ?? []);

          if (!cancelled) {
            setMessages(msgs);
            setActiveSessionId(session?.id ?? null);
            isFirstUserMessageRef.current = msgs.length === 0;
          }

        } else if (!cancelled) {
          setHistoryLoadError((prev) => prev ?? 'Could not load latest chat history.');
        }
      } catch {
        if (!cancelled) setHistoryLoadError('History failed to load. Check connection and retry.');
      } finally {
        if (!cancelled) setIsLoadingHistory(false);
      }

      // Auto-create only when there are truly no sessions at all in DB.
      // Avoid creating extra empty "New Chat" rows on every reload.
      if (
        !cancelled &&
        !activeSessionRef.current &&
        activeTotalFromApi === 0 &&
        archivedTotalFromApi === 0
      ) {
        try {
          const newRes = await fetch(`/api/projects/${projectId}/agent-chat/sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          });
          if (newRes.ok && !cancelled) {
            const newJson = await newRes.json();
            const auto: ChatSession = {
              id: newJson.data.id,
              title: newJson.data.title,
              updatedAt: newJson.data.updatedAt ?? new Date().toISOString(),
              messageCount: 0,
            };
            setSessions((prev) => prev.length === 0 ? [auto] : prev);
            setActiveSessionId(auto.id);
            isFirstUserMessageRef.current = true;
          }
        } catch { /* non-critical */ }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // ── Auto-title: on first user message, set the session title ─────────────
  const autoTitleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const autoTitleSession = useCallback(
    (content: string) => {
      const sid = activeSessionRef.current;
      if (!sid || !isFirstUserMessageRef.current) return;
      isFirstUserMessageRef.current = false;

      const title = content.slice(0, 60).replace(/\n/g, ' ').trim() || 'New Chat';

      // Optimistically update local state immediately
      setSessions((prev) =>
        prev.map((s) => (s.id === sid ? { ...s, title } : s)),
      );

      // Debounce the network call (300ms) to coalesce rapid sends
      if (autoTitleTimerRef.current) clearTimeout(autoTitleTimerRef.current);
      autoTitleTimerRef.current = setTimeout(() => {
        fetch(`/api/projects/${projectId}/agent-chat/sessions/${sid}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title }),
        }).catch(() => {
          // Non-blocking — local state already updated
        });
      }, 300);
    },
    [projectId],
  );

  // ── appendMessage ────────────────────────────────────────────────────────

  const appendMessage = useCallback(
    (role: 'user' | 'assistant', content: string, options?: { imageUrls?: string[] }): ChatMessage => {
      const msg: ChatMessage = {
        id: crypto.randomUUID(),
        role,
        content,
        timestamp: new Date(),
        ...(options?.imageUrls?.length ? { imageUrls: options.imageUrls } : {}),
      };

      setMessages((prev) => [...prev, msg]);

      // Auto-title on first user message
      if (role === 'user') {
        autoTitleSession(content);
        logInteractionEvent(projectId, {
          kind: 'user_input',
          sessionId: activeSessionRef.current,
          source: 'chat.send',
          content,
          metadata: { role },
        });
      } else {
        logInteractionEvent(projectId, {
          kind: 'assistant_output',
          sessionId: activeSessionRef.current,
          source: 'chat.append',
          content,
          metadata: { role },
        });
      }

      // Persist in background, targeting the active session (skip if content empty — API requires min length)
      const sid = activeSessionRef.current;
      if (content && String(content).trim().length > 0) {
        fetch(`/api/projects/${projectId}/agent-chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role, content, ...(sid ? { sessionId: sid } : {}) }),
        }).catch(() => {
          // Persistence failure is non-blocking
        });
      }

      return msg;
    },
    [projectId, autoTitleSession],
  );

  // ── updateMessage (local only) ──────────────────────────────────────────

  const updateMessage = useCallback((id: string, content: string, meta?: Partial<Pick<ChatMessage, 'thinkingSteps' | 'thinkingComplete' | 'contextStats' | 'budgetTruncated' | 'planData' | 'codeEdits' | 'clarification' | 'previewNav' | 'fileCreates' | 'activeToolCall' | 'citations' | 'fileOps' | 'shopifyOps' | 'screenshots' | 'screenshotComparison' | 'workers' | 'blocks' | 'activeModel' | 'rateLimitHit' | 'executionOutcome' | 'failureReason' | 'suggestedAction' | 'failedTool' | 'failedFilePath' | 'reviewFailedSection' | 'referentialReplayFailed' | 'verificationEvidence' | 'worktreeStatus' | 'backgroundTask'>>) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, content, ...meta } : m)),
    );
  }, []);

  // ── finalizeMessage ─────────────────────────────────────────────────────

  const finalizeMessage = useCallback(
    (id: string) => {
      const msg = messagesRef.current.find((m) => m.id === id);
      const text = msg?.content && String(msg.content).trim();
      if (!msg || !text) return;

      logInteractionEvent(projectId, {
        kind: 'assistant_output',
        sessionId: activeSessionRef.current,
        source: 'chat.finalize',
        content: msg.content,
      });

      const sid = activeSessionRef.current;
      fetch(`/api/projects/${projectId}/agent-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'assistant',
          content: text,
          ...(sid ? { sessionId: sid } : {}),
        }),
      }).catch(() => {
        // Persistence failure is non-blocking
      });
    },
    [projectId],
  );

  // ── addLocalMessage ─────────────────────────────────────────────────────

  const addLocalMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  // ── createNewSession ────────────────────────────────────────────────────

  const createNewSession = useCallback(async (opts?: { cleanStart?: boolean }) => {
    try {
      const cleanStart = opts?.cleanStart ?? false;
      let res = await fetch(`/api/projects/${projectId}/agent-chat/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reuseEmpty: !cleanStart,
          cleanStart,
        }),
      });

      // If cleanStart request failed, retry without it so session creation still works
      if (!res.ok && cleanStart) {
        console.warn('[useAgentChat] cleanStart session failed, retrying without cleanStart flag');
        res = await fetch(`/api/projects/${projectId}/agent-chat/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reuseEmpty: false }),
        });
      }
      if (!res.ok) return;

      const json = await res.json();
      const newSession: ChatSession = {
        id: json.data.id,
        title: json.data.title,
        updatedAt: json.data.updatedAt ?? new Date().toISOString(),
        messageCount: 0,
      };

      setSessions((prev) => [newSession, ...prev]);
      setActiveSessionId(newSession.id);
      setMessages([]);
      isFirstUserMessageRef.current = true;
      if (cleanStart) cleanStartSessionIds.current.add(newSession.id);
    } catch {
      // Silently fail
    }
  }, [projectId]);

  // ── switchSession ───────────────────────────────────────────────────────

  const switchSession = useCallback(
    async (sessionId: string) => {
      if (sessionId === activeSessionRef.current) return;

      // Clear immediately so stale messages don't linger (triggers skeleton)
      setMessages([]);
      setActiveSessionId(sessionId);
      setIsLoadingHistory(true);
      try {
        const res = await fetch(
          `/api/projects/${projectId}/agent-chat/sessions/${sessionId}`,
        );
        if (!res.ok) return;

        const json = await res.json();
        const msgs = mapMessages(json?.data ?? []);

        setMessages(msgs);
        isFirstUserMessageRef.current = msgs.length === 0;
      } catch {
        // Silently fail
      } finally {
        setIsLoadingHistory(false);
      }
    },
    [projectId],
  );

  // ── deleteSession ───────────────────────────────────────────────────────

  const deleteSession = useCallback(
    async (sessionId: string) => {
      try {
        const res = await fetch(
          `/api/projects/${projectId}/agent-chat/sessions/${sessionId}`,
          { method: 'DELETE' },
        );
        if (!res.ok) return;

        setSessions((prev) => {
          const remaining = prev.filter((s) => s.id !== sessionId);

          // If we deleted the active session, switch to the next one
          if (sessionId === activeSessionRef.current) {
            if (remaining.length > 0) {
              // Switch to the most recent remaining session
              const next = remaining[0];
              // Use setTimeout to avoid state update during render
              setTimeout(() => switchSession(next.id), 0);
            } else {
              setActiveSessionId(null);
              setMessages([]);
            }
          }

          return remaining;
        });
      } catch {
        // Silently fail
      }
    },
    [projectId, switchSession],
  );

  // ── renameSession ───────────────────────────────────────────────────────

  const renameSession = useCallback(
    async (sessionId: string, title: string) => {
      try {
        const res = await fetch(
          `/api/projects/${projectId}/agent-chat/sessions/${sessionId}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title }),
          },
        );
        if (!res.ok) return;

        setSessions((prev) =>
          prev.map((s) => (s.id === sessionId ? { ...s, title } : s)),
        );
      } catch {
        // Silently fail
      }
    },
    [projectId],
  );

  // ── archiveSession ──────────────────────────────────────────────────────

  const archiveSession = useCallback(
    async (sessionId: string) => {
      try {
        const res = await fetch(
          `/api/projects/${projectId}/agent-chat/sessions/${sessionId}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ archived: true }),
          },
        );
        if (!res.ok) return;

        setSessions((prev) => {
          const session = prev.find((s) => s.id === sessionId);
          const remaining = prev.filter((s) => s.id !== sessionId);

          if (session) {
            setArchivedSessions((archived) => [
              { ...session, archivedAt: new Date().toISOString() },
              ...archived,
            ]);
          }

          // If we archived the active session, switch to the next one
          if (sessionId === activeSessionRef.current) {
            if (remaining.length > 0) {
              setTimeout(() => switchSession(remaining[0].id), 0);
            } else {
              setActiveSessionId(null);
              setMessages([]);
            }
          }

          return remaining;
        });
      } catch {
        // Silently fail
      }
    },
    [projectId, switchSession],
  );

  // ── archiveAllSessions ──────────────────────────────────────────────────

  const archiveAllSessions = useCallback(
    async (olderThanDays?: number) => {
      const now = Date.now();
      const cutoff = olderThanDays != null ? now - olderThanDays * 86_400_000 : null;
      const toArchive = sessions.filter((s) => {
        if (cutoff !== null) {
          return new Date(s.updatedAt).getTime() < cutoff;
        }
        return true;
      });
      if (toArchive.length === 0) return;

      await Promise.allSettled(
        toArchive.map((s) =>
          fetch(`/api/projects/${projectId}/agent-chat/sessions/${s.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ archived: true }),
          }),
        ),
      );

      const archivedNow = new Date().toISOString();
      const archivedIds = new Set(toArchive.map((s) => s.id));

      setSessions((prev) => {
        const remaining = prev.filter((s) => !archivedIds.has(s.id));
        setArchivedSessions((archived) => [
          ...toArchive.map((s) => ({ ...s, archivedAt: archivedNow })),
          ...archived,
        ]);
        if (activeSessionRef.current && archivedIds.has(activeSessionRef.current)) {
          if (remaining.length > 0) {
            setTimeout(() => switchSession(remaining[0].id), 0);
          } else {
            setActiveSessionId(null);
            setMessages([]);
          }
        }
        return remaining;
      });
    },
    [projectId, sessions, switchSession],
  );

  // ── unarchiveSession ───────────────────────────────────────────────────

  const unarchiveSession = useCallback(
    async (sessionId: string) => {
      try {
        const res = await fetch(
          `/api/projects/${projectId}/agent-chat/sessions/${sessionId}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ archived: false }),
          },
        );
        if (!res.ok) return;

        setArchivedSessions((prev) => {
          const session = prev.find((s) => s.id === sessionId);
          const remaining = prev.filter((s) => s.id !== sessionId);

          if (session) {
            setSessions((active) => [
              { ...session, archivedAt: null },
              ...active,
            ]);
          }

          return remaining;
        });
      } catch {
        // Silently fail
      }
    },
    [projectId],
  );

  // ── loadMore (pagination) ──────────────────────────────────────────────

  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);

    try {
      const res = await fetch(
        `/api/projects/${projectId}/agent-chat/sessions?archived=false&limit=${PAGE_SIZE}&offset=${offsetRef.current}`,
      );
      if (!res.ok) return;

      const json = await res.json();
      const payload = json?.data;
      const list = payload?.sessions ?? payload ?? [];
      const loadedRaw: ChatSession[] = list.map(mapSessionFromApi);
      const loaded = loadedRaw.filter(isNonEmptySession);

      setSessions((prev) => [...prev, ...loaded]);
      setHasMore(payload?.hasMore ?? false);
      offsetRef.current += loadedRaw.length;
    } catch {
      // Silently fail
    } finally {
      setIsLoadingMore(false);
    }
  }, [projectId, isLoadingMore, hasMore]);

  // ── loadAllHistory (bulk pagination) ─────────────────────────────────────

  const loadAllHistory = useCallback(async () => {
    if (isLoadingAllHistory || isLoadingMore || !hasMore) return;
    setIsLoadingAllHistory(true);

    try {
      let localOffset = offsetRef.current;
      let localHasMore: boolean = hasMore;
      const MAX_PAGES = 50;
      let pages = 0;

      while (localHasMore && pages < MAX_PAGES) {
        const res = await fetch(
          `/api/projects/${projectId}/agent-chat/sessions?archived=false&limit=${PAGE_SIZE}&offset=${localOffset}`,
        );
        if (!res.ok) break;

        const json = await res.json();
        const payload = json?.data;
        const list = payload?.sessions ?? payload ?? [];
        const loadedRaw: ChatSession[] = list.map(mapSessionFromApi);
        if (loadedRaw.length === 0) break;
        const loaded = loadedRaw.filter(isNonEmptySession);

        setSessions((prev) => {
          const seen = new Set(prev.map((s) => s.id));
          const add = loaded.filter((s) => !seen.has(s.id));
          return add.length > 0 ? [...prev, ...add] : prev;
        });

        localOffset += loadedRaw.length;
        localHasMore = Boolean(payload?.hasMore ?? false);
        pages += 1;
      }

      offsetRef.current = localOffset;
      setHasMore(localHasMore);
    } catch {
      // Non-blocking
    } finally {
      setIsLoadingAllHistory(false);
    }
  }, [projectId, hasMore, isLoadingAllHistory, isLoadingMore]);

  // ── recordApplyStats ───────────────────────────────────────────────────

  const recordApplyStats = useCallback(
    (sessionId: string, stats: { linesAdded: number; linesDeleted: number; filesAffected: number }) => {
      // Non-blocking: fire-and-forget
      fetch(
        `/api/projects/${projectId}/agent-chat/sessions/${sessionId}/apply-stats`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(stats),
        },
      )
        .then((res) => {
          if (res.ok) {
            // Update local state optimistically
            setSessions((prev) =>
              prev.map((s) =>
                s.id === sessionId
                  ? {
                      ...s,
                      linesAdded: (s.linesAdded ?? 0) + stats.linesAdded,
                      linesDeleted: (s.linesDeleted ?? 0) + stats.linesDeleted,
                      filesAffected: (s.filesAffected ?? 0) + stats.filesAffected,
                    }
                  : s,
              ),
            );
          }
        })
        .catch(() => {
          // Non-blocking -- if POST fails after apply succeeds, just log
          console.warn('[useAgentChat] Failed to record apply stats');
        });
    },
    [projectId],
  );

  // ── clearMessages (visual only) ─────────────────────────────────────────

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  // ── removeLastTurn (for regenerate) ────────────────────────────────────

  const removeLastTurn = useCallback((): string | null => {
    const msgs = messagesRef.current;
    if (msgs.length === 0) return null;

    // Find the last user message
    let lastUserIdx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx === -1) return null;

    const lastUserContent = msgs[lastUserIdx].content;

    // Remove everything from lastUserIdx onward (the user msg + any assistant replies)
    setMessages((prev) => prev.slice(0, lastUserIdx));

    return lastUserContent;
  }, []);

  // ── truncateAt (for edit-and-resend) ───────────────────────────────────

  const truncateAt = useCallback((index: number) => {
    setMessages((prev) => prev.slice(0, index));
  }, []);

  // ── Phase 5a: forkSession ────────────────────────────────────────────────

  const forkSession = useCallback(async (messageIndex: number): Promise<string | null> => {
    if (!activeSessionId) return null;
    try {
      const res = await fetch(
        '/api/projects/' + projectId + '/agent-chat/sessions/' + activeSessionId + '/fork',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ branchPointIndex: messageIndex }),
        }
      );
      if (!res.ok) return null;
      const data = await res.json();
      const newSession: ChatSession = {
        id: data.id,
        title: data.title,
        updatedAt: new Date().toISOString(),
        messageCount: messageIndex + 1,
      };
      setSessions((prev) => [newSession, ...prev]);
      // Switch to the new forked session
      await switchSession(data.id);
      return data.id;
    } catch {
      return null;
    }
  }, [activeSessionId, projectId, switchSession]);

  // ── continueInNewChat ──────────────────────────────────────────────────
  // Generates a summary of the current session and starts a new chat with
  // that summary pre-populated as the first message.

  const continueInNewChat = useCallback(async (): Promise<boolean> => {
    const sid = activeSessionRef.current;
    if (!sid) return false;
    try {
      const summaryRes = await fetch(
        `/api/projects/${projectId}/agent-chat/sessions/${sid}/summary`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      );
      if (!summaryRes.ok) return false;
      const summaryJson = await summaryRes.json();
      const summary: string = summaryJson?.data?.summary ?? summaryJson?.summary ?? '';
      if (!summary) return false;

      const sessionRes = await fetch(`/api/projects/${projectId}/agent-chat/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reuseEmpty: false }),
      });
      if (!sessionRes.ok) return false;
      const sessionJson = await sessionRes.json();
      const newSession: ChatSession = {
        id: sessionJson.data.id,
        title: sessionJson.data.title ?? 'Continued conversation',
        updatedAt: sessionJson.data.updatedAt ?? new Date().toISOString(),
        messageCount: 0,
      };

      setSessions((prev) => [newSession, ...prev]);
      setActiveSessionId(newSession.id);
      isFirstUserMessageRef.current = true;

      const contextMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: `**Continuing from previous conversation:**\n\n${summary}`,
        timestamp: new Date(),
      };
      setMessages([contextMsg]);

      fetch(`/api/projects/${projectId}/agent-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: newSession.id,
          role: 'user',
          content: contextMsg.content,
        }),
      }).catch(() => {});

      return true;
    } catch {
      return false;
    }
  }, [projectId]);

  // ── reviewSessionTranscript ───────────────────────────────────────────────

  const reviewSessionTranscript = useCallback(async (sessionId?: string) => {
    const sid = sessionId ?? activeSessionRef.current;
    if (!sid) return null;
    try {
      const res = await fetch(
        `/api/projects/${projectId}/agent-chat/sessions/${sid}/review`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
      );
      const json = await res.json();
      if (!res.ok) {
        const errorMessage =
          String(json?.error?.message ?? json?.message ?? json?.error ?? `HTTP ${res.status}`);
        return {
          likelyLooping: false,
          summary: `Transcript review unavailable: ${errorMessage}`,
          findings: [{ severity: 'warning' as const, message: errorMessage }],
          stats: undefined,
        };
      }
      const reviewPayload = json?.data?.review ?? json?.review ?? null;
      const analysis = reviewPayload?.analysis ?? null;
      if (!analysis) {
        return {
          likelyLooping: false,
          summary: 'Transcript review completed, but no analysis payload was returned.',
          findings: [{ severity: 'warning' as const, message: 'Missing analysis payload.' }],
          stats: undefined,
        };
      }
      return {
        likelyLooping: Boolean(analysis?.diagnosis?.likelyLooping),
        summary: String(analysis?.diagnosis?.summary ?? 'Transcript analysis complete.'),
        findings: Array.isArray(analysis?.findings) ? analysis.findings : [],
        stats: (analysis?.stats as Record<string, unknown> | undefined) ?? undefined,
      };
    } catch {
      return {
        likelyLooping: false,
        summary: 'Transcript review unavailable due to a network error.',
        findings: [{ severity: 'warning', message: 'Network error while requesting transcript review.' }],
        stats: undefined,
      };
    }
  }, [projectId]);

  // ── Return (memoized to prevent unnecessary child re-renders) ──────────

  return useMemo(() => ({
    messages,
    isLoadingHistory,
    historyLoadError,
    appendMessage,
    addLocalMessage,
    updateMessage,
    finalizeMessage,
    sessions,
    archivedSessions,
    activeSessionId,
    createNewSession,
    switchSession,
    deleteSession,
    renameSession,
    archiveSession,
    archiveAllSessions,
    unarchiveSession,
    loadMore,
    hasMore,
    isLoadingMore,
    loadAllHistory,
    isLoadingAllHistory,
    recordApplyStats,
    clearMessages,
    removeLastTurn,
    truncateAt,
    forkSession,
    reviewSessionTranscript,
    continueInNewChat,
  }), [
    messages, isLoadingHistory, historyLoadError,
    appendMessage, addLocalMessage, updateMessage, finalizeMessage,
    sessions, archivedSessions, activeSessionId,
    createNewSession, switchSession, deleteSession, renameSession,
    archiveSession, archiveAllSessions, unarchiveSession,
    loadMore, hasMore, isLoadingMore,
    loadAllHistory, isLoadingAllHistory,
    recordApplyStats, clearMessages, removeLastTurn, truncateAt,
    forkSession, reviewSessionTranscript, continueInNewChat,
  ]);
}
