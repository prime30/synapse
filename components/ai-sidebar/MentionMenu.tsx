'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, ListChecks, Brain } from 'lucide-react';
import {
  resolveMentions,
  type MentionResult,
} from '@/lib/ai/mention-resolver';

interface MentionMenuProps {
  query: string;
  projectId: string;
  onSelect: (mention: MentionResult) => void;
  onClose: () => void;
  anchorRect?: DOMRect;
}

const DEBOUNCE_MS = 300;

function TypeBadge({ type }: { type: 'file' | 'plan' | 'memory' }) {
  const config = {
    file: {
      icon: FileText,
      className: 'text-sky-500 dark:text-sky-400',
    },
    plan: {
      icon: ListChecks,
      className: 'text-purple-500 dark:text-purple-400',
    },
    memory: {
      icon: Brain,
      className: 'text-emerald-500 dark:text-emerald-400',
    },
  };
  const { icon: Icon, className } = config[type];
  return (
    <Icon className={`h-3.5 w-3.5 shrink-0 ${className}`} aria-hidden />
  );
}

export function MentionMenu({
  query,
  projectId,
  onSelect,
  onClose,
  anchorRect,
}: MentionMenuProps) {
  const [results, setResults] = useState<MentionResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuId = `mention-menu-${Date.now()}`;

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const [files, plans, memories] = await Promise.all([
          resolveMentions(projectId, 'file', query),
          resolveMentions(projectId, 'plan', query),
          resolveMentions(projectId, 'memory', query),
        ]);
        const merged: MentionResult[] = [
          ...files,
          ...plans,
          ...memories,
        ];
        setResults(merged);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [projectId, query]);

  const clampedIndex = Math.max(0, Math.min(highlightedIndex, results.length - 1));

  useEffect(() => {
    const row = listRef.current?.children[clampedIndex] as HTMLElement | undefined;
    row?.scrollIntoView({ block: 'nearest' });
  }, [clampedIndex]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [query, results]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((i) =>
          i < results.length - 1 ? i + 1 : 0
        );
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((i) =>
          i > 0 ? i - 1 : results.length - 1
        );
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const item = results[clampedIndex];
        if (item) onSelect(item);
        return;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [results, clampedIndex, onSelect, onClose]);

  const handleSelect = useCallback(
    (mention: MentionResult) => {
      onSelect(mention);
    },
    [onSelect]
  );

  const content = (
    <div
      id={menuId}
      role="listbox"
      aria-label="Mentions"
      className="fixed z-50 w-64 overflow-hidden rounded-lg border border-stone-200 bg-white shadow-lg dark:border-white/10 dark:bg-[oklch(0.21_0_0)]"
      style={
        anchorRect
          ? {
              left: anchorRect.left,
              bottom: `calc(100vh - ${anchorRect.top}px + 8px)`,
            }
          : undefined
      }
    >
      <div ref={listRef} className="max-h-64 overflow-y-auto">
        {loading ? (
          <div className="px-3 py-4 text-center text-xs text-stone-500 dark:text-stone-400">
            Searching...
          </div>
        ) : results.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-stone-500 dark:text-stone-400">
            No results
          </div>
        ) : (
          results.map((mention, i) => {
            const isHighlighted = i === clampedIndex;
            return (
              <button
                key={`${mention.type}-${mention.id}`}
                type="button"
                role="option"
                aria-selected={isHighlighted}
                className={`flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left ${
                  isHighlighted
                    ? 'bg-stone-100 dark:bg-[#1e1e1e]'
                    : 'hover:bg-stone-50 dark:hover:bg-white/5'
                }`}
                onClick={() => handleSelect(mention)}
                onMouseEnter={() => setHighlightedIndex(i)}
                onMouseDown={(e) => e.preventDefault()}
              >
                <TypeBadge type={mention.type} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-stone-900 dark:text-white">
                    {mention.label}
                  </div>
                  {mention.detail && (
                    <div className="truncate text-xs text-stone-500 dark:text-stone-400">
                      {mention.detail}
                    </div>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(content, document.body, menuId)
    : null;
}
