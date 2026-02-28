'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { MemoryEntry, MemoryContent } from '@/lib/ai/developer-memory';
import { ConfidenceChart } from './ConfidenceChart';
import { Skeleton } from '@/components/ui/Skeleton';

const PAGE_SIZE = 50;
const DEBOUNCE_MS = 300;

type TypeFilter = 'all' | 'convention' | 'decision' | 'preference' | 'feedback';

const TYPE_BADGE_CLASS: Record<string, string> = {
  convention: 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300',
  decision: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
  preference: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
  feedback: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
};

function contentPreview(content: MemoryContent, maxLen = 100): string {
  if (!content || typeof content !== 'object') return '';
  const c = content as unknown as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof c.pattern === 'string') parts.push(c.pattern);
  if (typeof c.choice === 'string') parts.push(c.choice);
  if (typeof c.preference === 'string') parts.push(c.preference);
  if (typeof c.context === 'string') parts.push(c.context);
  if (typeof c.reasoning === 'string') parts.push(c.reasoning);
  const text = parts.join(' ').trim() || JSON.stringify(content);
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}

function contentFullText(content: MemoryContent): string {
  if (!content || typeof content !== 'object') return '';
  return JSON.stringify(content, null, 2);
}

interface MemoryDashboardProps {
  projectId: string;
}

interface ApiResponse {
  data?: {
    memories: MemoryEntry[];
    total: number;
    limit: number;
    offset: number;
  };
  error?: string;
}

export function MemoryDashboard({ projectId }: MemoryDashboardProps) {
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [offset, setOffset] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  const fetchMemories = useCallback(
    async (off: number, append: boolean) => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams();
        params.set('limit', String(PAGE_SIZE));
        params.set('offset', String(off));
        if (typeFilter !== 'all' && typeFilter !== 'feedback') {
          params.set('type', typeFilter);
        }
        if (debouncedSearch.trim()) {
          params.set('search', debouncedSearch.trim());
        }
        const res = await fetch(
          `/api/projects/${projectId}/memory?${params.toString()}`
        );
        const json: ApiResponse = await res.json();
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        const data = json.data;
        if (!data) throw new Error('Invalid response');
        const list = data.memories ?? [];
        setMemories((prev) => (append ? [...prev, ...list] : list));
        setTotal(data.total ?? 0);
        setOffset(off);
      } catch {
        setMemories([]);
        setTotal(0);
      } finally {
        setIsLoading(false);
      }
    },
    [projectId, debouncedSearch, typeFilter]
  );

  useEffect(() => {
    fetchMemories(0, false);
  }, [projectId, debouncedSearch, typeFilter, fetchMemories]);

  const loadMore = useCallback(() => {
    fetchMemories(offset + PAGE_SIZE, true);
  }, [offset, fetchMemories]);

  const filteredMemories = useMemo(() => {
    if (typeFilter !== 'feedback') return memories;
    return memories.filter((m) => m.feedback != null);
  }, [memories, typeFilter]);

  const hasMore = memories.length < total;

  return (
    <div className="min-h-screen bg-[oklch(0.985_0.001_106)] dark:bg-[oklch(0.145_0_0)] p-6">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-stone-900 dark:text-white">
          Agent Memory
        </h1>
        <div className="flex items-center gap-3">
          <input
            type="search"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-white dark:bg-[#141414] border border-stone-300 dark:border-white/10 rounded-md px-3 py-1.5 text-sm w-64 text-stone-900 dark:text-white placeholder:text-stone-400 dark:placeholder:text-stone-500"
          />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
            className="bg-white dark:bg-[#141414] border border-stone-300 dark:border-white/10 rounded-md px-3 py-1.5 text-sm text-stone-900 dark:text-white"
          >
            <option value="all">All</option>
            <option value="convention">Convention</option>
            <option value="decision">Decision</option>
            <option value="preference">Preference</option>
            <option value="feedback">Feedback</option>
          </select>
        </div>
      </header>

      <div className="mb-6">
        {isLoading && filteredMemories.length === 0 ? (
          <Skeleton variant="text" lines={2} />
        ) : (
          <ConfidenceChart data={filteredMemories.map((m) => ({ confidence: m.confidence }))} />
        )}
      </div>

      <div className="bg-white dark:bg-[#141414] border border-stone-200 dark:border-white/10 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-stone-50 dark:bg-[#141414] text-stone-700 dark:text-stone-300 text-xs font-medium uppercase tracking-wider">
              <th className="text-left px-4 py-3">Type</th>
              <th className="text-left px-4 py-3">Content</th>
              <th className="text-left px-4 py-3">Confidence</th>
              <th className="text-left px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && filteredMemories.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8">
                  <Skeleton variant="list" lines={5} className="max-w-md" />
                </td>
              </tr>
            ) : filteredMemories.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-stone-500 dark:text-stone-400">
                  No memories found
                </td>
              </tr>
            ) : (
              filteredMemories.map((m) => (
                <React.Fragment key={m.id}>
                  <tr
                    onClick={() => setExpandedId((id) => (id === m.id ? null : m.id))}
                    className="border-t border-stone-100 dark:border-[#1f1f1f] hover:bg-stone-50 dark:hover:bg-white/5 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                          TYPE_BADGE_CLASS[m.type] ?? 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300'
                        }`}
                      >
                        {m.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-stone-700 dark:text-stone-300">
                      {contentPreview(m.content)}
                    </td>
                    <td className="px-4 py-3 text-sm text-stone-600 dark:text-stone-400">
                      {(m.confidence * 100).toFixed(0)}%
                    </td>
                    <td className="px-4 py-3 text-sm text-stone-500 dark:text-stone-400">
                      {new Date(m.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                  {expandedId === m.id && (
                    <tr>
                      <td colSpan={4} className="bg-stone-50/50 dark:bg-white/[0.02] px-6 py-4">
                        <pre className="text-sm text-stone-700 dark:text-stone-300 whitespace-pre-wrap font-sans">
                          {contentFullText(m.content)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>

        {hasMore && (
          <div className="border-t border-stone-100 dark:border-[#1f1f1f]">
            <button
              type="button"
              onClick={loadMore}
              disabled={isLoading}
              className="w-full py-2 text-sm text-sky-500 hover:text-sky-600 dark:text-sky-400 font-medium disabled:opacity-50"
            >
              Load more
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
