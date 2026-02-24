'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';

export interface ConversationSearchProps {
  projectId: string;
  onSelectMessage: (messageId: string, sessionId: string) => void;
}

interface SearchResult {
  id: string;
  sessionId: string;
  role: string;
  content: string;
  createdAt: string;
  rank: number;
}

const DEBOUNCE_MS = 300;

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const q = query.trim().toLowerCase();
  const idx = text.toLowerCase().indexOf(q);
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-sky-200 dark:bg-sky-900/60 text-stone-900 dark:text-stone-100 rounded px-0.5">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

export function ConversationSearch({
  projectId,
  onSelectMessage,
}: ConversationSearchProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch(
      `/api/projects/${projectId}/agent-chat/search?q=${encodeURIComponent(debouncedQuery)}&limit=20`
    )
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const list = data?.data?.results ?? [];
        setResults(list);
        setFocusedIndex(list.length > 0 ? 0 : -1);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, debouncedQuery]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const count = results.length;
      if (count === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setFocusedIndex((p) => (p + 1) % count);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setFocusedIndex((p) => (p - 1 + count) % count);
          break;
        case 'Enter':
          if (focusedIndex >= 0 && focusedIndex < count) {
            e.preventDefault();
            const r = results[focusedIndex];
            onSelectMessage(r.id, r.sessionId);
          }
          break;
        case 'Escape':
          setQuery('');
          setFocusedIndex(-1);
          break;
        default:
          break;
      }
    },
    [results, focusedIndex, onSelectMessage]
  );

  const handleSelect = useCallback(
    (r: SearchResult) => {
      onSelectMessage(r.id, r.sessionId);
    },
    [onSelectMessage]
  );

  const showResults = debouncedQuery.trim().length > 0;

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <Search
          className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400 dark:text-stone-500 pointer-events-none"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search messages..."
          aria-label="Search conversation messages"
          className="
            w-full pl-8 pr-3 py-1.5 text-sm
            bg-white dark:bg-white/5
            border border-stone-200 dark:border-white/10
            rounded-md
            text-stone-900 dark:text-white
            placeholder:text-stone-400 dark:placeholder:text-stone-500
            focus:outline-none focus:ring-1 focus:ring-sky-500/50 focus:border-sky-500/50
          "
        />
      </div>

      {showResults && (
        <div
          ref={listRef}
          className="absolute top-full left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-md border border-stone-200 dark:border-white/10 bg-white dark:bg-stone-900 shadow-lg z-10"
        >
          {loading ? (
            <div className="px-3 py-4 text-xs text-stone-500 dark:text-stone-400">
              Searching...
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-4 text-xs text-stone-500 dark:text-stone-400">
              No results found
            </div>
          ) : (
            <ul role="listbox" aria-label="Search results">
              {results.map((r, i) => (
                <li
                  key={`${r.sessionId}-${r.id}`}
                  role="option"
                  aria-selected={i === focusedIndex}
                  onClick={() => handleSelect(r)}
                  className={`
                    px-3 py-2 cursor-pointer text-left
                    hover:bg-stone-50 dark:hover:bg-white/5
                    ${i === focusedIndex ? 'bg-stone-50 dark:bg-white/5' : ''}
                  `}
                >
                  <div className="text-[10px] text-stone-400 dark:text-stone-500 uppercase tracking-wide mb-0.5">
                    {r.role}
                  </div>
                  <div className="text-xs text-stone-600 dark:text-stone-400 line-clamp-2">
                    {highlightMatch(r.content, debouncedQuery)}
                  </div>
                  <div className="text-[10px] text-stone-400 dark:text-stone-500 mt-0.5 truncate">
                    Session {r.sessionId.slice(0, 8)}…
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
