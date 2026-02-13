'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ChatMessage } from '@/components/ai-sidebar/ChatInterface';
import type { ChatSession } from '@/components/ai-sidebar/SessionHistory';

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

interface UseAgentChatReturn {
  /** Messages for the active session. */
  messages: ChatMessage[];
  /** True while the initial history is being fetched. */
  isLoadingHistory: boolean;
  /** Add a message to local state and persist it to the DB (fire-and-forget). */
  appendMessage: (role: 'user' | 'assistant', content: string) => ChatMessage;
  /** Add a message to local state only -- no DB persist. For streaming placeholders. */
  addLocalMessage: (msg: ChatMessage) => void;
  /** Update a message's content in local state only (for streaming chunks). */
  updateMessage: (id: string, content: string, meta?: Partial<Pick<ChatMessage, 'thinkingSteps' | 'thinkingComplete'>>) => void;
  /** Persist the final content of a streamed message to the DB. */
  finalizeMessage: (id: string) => void;

  // ── Multi-session ────────────────────────────────────────────────────────
  /** All sessions for this project (newest first). */
  sessions: ChatSession[];
  /** ID of the currently active session (null if none yet). */
  activeSessionId: string | null;
  /** Create a new empty session and switch to it. */
  createNewSession: () => Promise<void>;
  /** Switch to an existing session by ID. */
  switchSession: (sessionId: string) => Promise<void>;
  /** Delete a session. Switches to the next session or empty state. */
  deleteSession: (sessionId: string) => Promise<void>;
  /** Rename a session. */
  renameSession: (sessionId: string, title: string) => Promise<void>;
  /** Clear local messages (visual clear). */
  clearMessages: () => void;
  /** Remove the last user + assistant pair and return the last user message content (for regenerate). */
  removeLastTurn: () => string | null;
  /** Truncate messages to the given index (inclusive) and return the remaining messages (for edit-and-resend). */
  truncateAt: (index: number) => void;
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
export function useAgentChat(projectId: string): UseAgentChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const activeSessionRef = useRef<string | null>(null);
  const isFirstUserMessageRef = useRef(true);

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
      try {
        // Load in parallel: session list + latest session messages
        const [sessionsRes, latestRes] = await Promise.all([
          fetch(`/api/projects/${projectId}/agent-chat/sessions`),
          fetch(`/api/projects/${projectId}/agent-chat`),
        ]);

        if (cancelled) return;

        // Sessions list
        if (sessionsRes.ok) {
          const sessionsJson = await sessionsRes.json();
          const loaded: ChatSession[] = (sessionsJson?.data ?? []).map(
            (s: { id: string; title: string; updatedAt: string; messageCount: number }) => ({
              id: s.id,
              title: s.title,
              updatedAt: s.updatedAt,
              messageCount: s.messageCount,
            }),
          );
          if (!cancelled) setSessions(loaded);
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
        }
      } catch {
        // Silently fail -- start with empty state
      } finally {
        if (!cancelled) setIsLoadingHistory(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // ── Auto-title: on first user message, set the session title ─────────────

  const autoTitleSession = useCallback(
    (content: string) => {
      const sid = activeSessionRef.current;
      if (!sid || !isFirstUserMessageRef.current) return;
      isFirstUserMessageRef.current = false;

      const title = content.slice(0, 60).replace(/\n/g, ' ').trim() || 'New Chat';

      fetch(`/api/projects/${projectId}/agent-chat/sessions/${sid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
        .then(() => {
          setSessions((prev) =>
            prev.map((s) => (s.id === sid ? { ...s, title } : s)),
          );
        })
        .catch(() => {
          // Non-blocking
        });
    },
    [projectId],
  );

  // ── appendMessage ────────────────────────────────────────────────────────

  const appendMessage = useCallback(
    (role: 'user' | 'assistant', content: string): ChatMessage => {
      const msg: ChatMessage = {
        id: crypto.randomUUID(),
        role,
        content,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, msg]);

      // Auto-title on first user message
      if (role === 'user') {
        autoTitleSession(content);
      }

      // Persist in background, targeting the active session
      const sid = activeSessionRef.current;
      fetch(`/api/projects/${projectId}/agent-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, content, ...(sid ? { sessionId: sid } : {}) }),
      }).catch(() => {
        // Persistence failure is non-blocking
      });

      return msg;
    },
    [projectId, autoTitleSession],
  );

  // ── updateMessage (local only) ──────────────────────────────────────────

  const updateMessage = useCallback((id: string, content: string, meta?: Partial<Pick<ChatMessage, 'thinkingSteps' | 'thinkingComplete'>>) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, content, ...meta } : m)),
    );
  }, []);

  // ── finalizeMessage ─────────────────────────────────────────────────────

  const finalizeMessage = useCallback(
    (id: string) => {
      const msg = messagesRef.current.find((m) => m.id === id);
      if (!msg || !msg.content) return;

      const sid = activeSessionRef.current;
      fetch(`/api/projects/${projectId}/agent-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'assistant',
          content: msg.content,
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

  const createNewSession = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/agent-chat/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
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
    } catch {
      // Silently fail
    }
  }, [projectId]);

  // ── switchSession ───────────────────────────────────────────────────────

  const switchSession = useCallback(
    async (sessionId: string) => {
      if (sessionId === activeSessionRef.current) return;

      setIsLoadingHistory(true);
      try {
        const res = await fetch(
          `/api/projects/${projectId}/agent-chat/sessions/${sessionId}`,
        );
        if (!res.ok) return;

        const json = await res.json();
        const msgs = mapMessages(json?.data ?? []);

        setMessages(msgs);
        setActiveSessionId(sessionId);
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

  // ── Return ──────────────────────────────────────────────────────────────

  return {
    messages,
    isLoadingHistory,
    appendMessage,
    addLocalMessage,
    updateMessage,
    finalizeMessage,
    sessions,
    activeSessionId,
    createNewSession,
    switchSession,
    deleteSession,
    renameSession,
    clearMessages,
    removeLastTurn,
    truncateAt,
  };
}
