'use client';

/**
 * React hook for fetching and managing developer memory entries.
 * Provides CRUD operations against the /api/projects/[projectId]/memory endpoint.
 *
 * EPIC 14: Developer Memory.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type {
  MemoryEntry,
  MemoryFeedback,
  MemoryContent,
} from '@/lib/ai/developer-memory';

// ── Types ─────────────────────────────────────────────────────────────

interface UseMemoryReturn {
  /** All fetched memories. */
  memories: MemoryEntry[];
  /** Whether the initial load is in progress. */
  isLoading: boolean;
  /** Number of active memories (non-rejected, above confidence threshold). */
  activeCount: number;
  /** Number of active conventions specifically. */
  activeConventionCount: number;
  /** Set feedback on a memory entry (correct / wrong / null). */
  setFeedback: (id: string, feedback: MemoryFeedback) => Promise<void>;
  /** Delete a memory entry. */
  forget: (id: string) => Promise<void>;
  /** Update content on a memory entry. */
  edit: (id: string, content: MemoryContent) => Promise<void>;
  /** Create a new memory entry. */
  create: (type: MemoryEntry['type'], content: MemoryContent, confidence: number) => Promise<void>;
  /** Force re-fetch all memories. */
  refresh: () => Promise<void>;
}

// ── Helpers ───────────────────────────────────────────────────────────

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Hook ──────────────────────────────────────────────────────────────

export function useMemory(projectId: string): UseMemoryReturn {
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const mountedRef = useRef(true);

  // Base URL for the memory API
  const baseUrl = `/api/projects/${projectId}/memory`;

  // ── Fetch ─────────────────────────────────────────────────────────

  const refresh = useCallback(async () => {
    try {
      const data = await fetchJSON<{ memories: MemoryEntry[] }>(baseUrl);
      if (mountedRef.current) {
        setMemories(data.memories ?? []);
      }
    } catch {
      // Silently fail — the table may not exist yet
      if (mountedRef.current) {
        setMemories([]);
      }
    }
  }, [baseUrl]);

  // Initial loading state is set via useState default; reset via refresh callback
  useEffect(() => {
    mountedRef.current = true;
    refresh().finally(() => {
      if (mountedRef.current) setIsLoading(false);
    });
    return () => {
      mountedRef.current = false;
    };
  }, [refresh]);

  // ── Derived counts ────────────────────────────────────────────────

  const activeMemories = useMemo(
    () => memories.filter((m) => m.feedback !== 'wrong' && m.confidence >= 0.6),
    [memories],
  );

  const activeCount = activeMemories.length;

  const activeConventionCount = useMemo(
    () => activeMemories.filter((m) => m.type === 'convention').length,
    [activeMemories],
  );

  // ── Feedback ──────────────────────────────────────────────────────

  const setFeedback = useCallback(
    async (id: string, feedback: MemoryFeedback) => {
      // Optimistic update
      setMemories((prev) =>
        prev.map((m) => (m.id === id ? { ...m, feedback } : m)),
      );
      try {
        await fetchJSON(baseUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, feedback }),
        });
      } catch {
        // Revert on error
        await refresh();
      }
    },
    [baseUrl, refresh],
  );

  // ── Forget ────────────────────────────────────────────────────────

  const forget = useCallback(
    async (id: string) => {
      // Optimistic remove
      setMemories((prev) => prev.filter((m) => m.id !== id));
      try {
        await fetchJSON(baseUrl, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        });
      } catch {
        await refresh();
      }
    },
    [baseUrl, refresh],
  );

  // ── Edit ──────────────────────────────────────────────────────────

  const edit = useCallback(
    async (id: string, content: MemoryContent) => {
      setMemories((prev) =>
        prev.map((m) => (m.id === id ? { ...m, content } : m)),
      );
      try {
        await fetchJSON(baseUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, content }),
        });
      } catch {
        await refresh();
      }
    },
    [baseUrl, refresh],
  );

  // ── Create ────────────────────────────────────────────────────────

  const create = useCallback(
    async (type: MemoryEntry['type'], content: MemoryContent, confidence: number) => {
      try {
        const data = await fetchJSON<MemoryEntry>(baseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, content, confidence }),
        });
        if (mountedRef.current) {
          setMemories((prev) => [data, ...prev]);
        }
      } catch {
        // Silently fail
      }
    },
    [baseUrl],
  );

  return {
    memories,
    isLoading,
    activeCount,
    activeConventionCount,
    setFeedback,
    forget,
    edit,
    create,
    refresh,
  };
}
