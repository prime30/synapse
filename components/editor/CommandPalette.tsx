'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  files: Array<{ id: string; name: string; path: string }>;
  recentFiles: Array<{ fileId: string; openedAt: number }>;
  onFileSelect: (fileId: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatRecent(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function fuzzyMatch(query: string, text: string): boolean {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  let qi = 0;
  for (let i = 0; i < lower.length && qi < q.length; i++) {
    if (lower[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

/* ------------------------------------------------------------------ */
/*  File icon helper                                                   */
/* ------------------------------------------------------------------ */

const iconProps = {
  width: 14,
  height: 14,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function FileIcon({ fileName }: { fileName: string }) {
  const ext = fileName.split('.').pop()?.toLowerCase();
  let color = 'text-gray-500';
  if (ext === 'liquid') color = 'text-green-400';
  else if (ext === 'js' || ext === 'jsx' || ext === 'ts' || ext === 'tsx') color = 'text-yellow-400';
  else if (ext === 'css' || ext === 'scss') color = 'text-blue-400';
  else if (ext === 'json') color = 'text-orange-400';

  return (
    <svg {...iconProps} className={`shrink-0 ${color}`}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function CommandPalette({
  isOpen,
  onClose,
  files,
  recentFiles,
  onFileSelect,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset state when isOpen transitions to true (React "adjust state on prop change" pattern)
  const [prevOpen, setPrevOpen] = useState(false);
  if (isOpen !== prevOpen) {
    setPrevOpen(isOpen);
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
    }
  }

  // Focus input when opening
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // ── Recent files (max 5) ────────────────────────────────────────────
  const recentItems = useMemo(() => {
    return recentFiles
      .slice(0, 5)
      .map((rf) => {
        const file = files.find((f) => f.id === rf.fileId);
        if (!file) return null;
        return { ...file, openedAt: rf.openedAt };
      })
      .filter((x): x is NonNullable<typeof x> => x != null);
  }, [recentFiles, files]);

  // ── Filtered "All Files" ────────────────────────────────────────────
  const filteredFiles = useMemo(() => {
    if (!query) return files;
    return files.filter(
      (f) => fuzzyMatch(query, f.name) || fuzzyMatch(query, f.path)
    );
  }, [files, query]);

  // ── Build flat list for keyboard navigation ─────────────────────────
  const flatList = useMemo(() => {
    const items: Array<{ id: string; name: string; path: string; section: 'recent' | 'all'; openedAt?: number }> = [];

    if (!query && recentItems.length > 0) {
      recentItems.forEach((ri) =>
        items.push({ id: ri.id, name: ri.name, path: ri.path, section: 'recent', openedAt: ri.openedAt })
      );
    }

    filteredFiles.forEach((f) =>
      items.push({ id: f.id, name: f.name, path: f.path, section: 'all' })
    );

    return items;
  }, [query, recentItems, filteredFiles]);

  // Clamp selected index when list changes (computed during render, not in effect)
  const clampedIndex = Math.min(selectedIndex, Math.max(0, flatList.length - 1));
  if (clampedIndex !== selectedIndex) {
    setSelectedIndex(clampedIndex);
  }

  // Scroll selected item into view
  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const el = container.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const selectCurrent = useCallback(() => {
    const item = flatList[selectedIndex];
    if (item) {
      onFileSelect(item.id);
      onClose();
    }
  }, [flatList, selectedIndex, onFileSelect, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => Math.min(prev + 1, flatList.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          selectCurrent();
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [flatList.length, selectCurrent, onClose]
  );

  if (!isOpen) return null;

  // Identify section boundaries for headers
  let shownRecentHeader = false;
  let shownAllHeader = false;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-gray-800 border border-gray-700 rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="p-3 border-b border-gray-700">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Search files…"
            className="w-full bg-gray-900 text-sm text-gray-200 placeholder-gray-500 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-blue-500/50"
          />
        </div>

        {/* Results list */}
        <div ref={listRef} className="max-h-80 overflow-y-auto py-1">
          {flatList.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-gray-500">
              No files found
            </div>
          )}

          {flatList.map((item, idx) => {
            let header: React.ReactNode = null;

            if (item.section === 'recent' && !shownRecentHeader) {
              shownRecentHeader = true;
              header = (
                <div className="px-3 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-gray-500">
                  Recent Files
                </div>
              );
            }
            if (item.section === 'all' && !shownAllHeader) {
              shownAllHeader = true;
              header = (
                <div className="px-3 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-gray-500">
                  {query ? 'Results' : 'All Files'}
                </div>
              );
            }

            const isSelected = idx === selectedIndex;

            return (
              <div key={`${item.section}-${item.id}`}>
                {header}
                <button
                  type="button"
                  className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left transition-colors ${
                    isSelected ? 'bg-gray-700/50' : 'hover:bg-gray-700/30'
                  }`}
                  onClick={() => {
                    onFileSelect(item.id);
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <FileIcon fileName={item.name} />
                  <span className="text-sm text-gray-200 truncate">{item.name}</span>
                  <span className="text-xs text-gray-500 truncate ml-auto">{item.path}</span>
                  {item.openedAt != null && (
                    <span className="text-[10px] text-gray-600 whitespace-nowrap shrink-0">
                      {formatRecent(item.openedAt)}
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer hint */}
        <div className="px-3 py-1.5 border-t border-gray-700 text-[10px] text-gray-600 flex gap-3">
          <span><kbd className="px-1 py-0.5 bg-gray-900 rounded text-gray-500">↑↓</kbd> navigate</span>
          <span><kbd className="px-1 py-0.5 bg-gray-900 rounded text-gray-500">↵</kbd> open</span>
          <span><kbd className="px-1 py-0.5 bg-gray-900 rounded text-gray-500">esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
