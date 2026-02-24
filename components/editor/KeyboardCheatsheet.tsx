'use client';

import { useState, useMemo } from 'react';
import { Modal } from '@/components/ui/Modal';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface KeyboardCheatsheetProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Shortcut {
  keys: string[];
  description: string;
  category: string;
}

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const SHORTCUTS: Shortcut[] = [
  // Navigation
  { keys: ['Ctrl', 'P'], description: 'Quick open file', category: 'Navigation' },
  { keys: ['Ctrl', 'Shift', 'P'], description: 'Command palette', category: 'Navigation' },
  { keys: ['Ctrl', 'B'], description: 'Toggle sidebar', category: 'Navigation' },
  { keys: ['Ctrl', 'J'], description: 'Toggle terminal', category: 'Navigation' },
  { keys: ['Ctrl', '`'], description: 'Toggle AI sidebar', category: 'Navigation' },
  // Editing
  { keys: ['Ctrl', 'S'], description: 'Save file', category: 'Editing' },
  { keys: ['Ctrl', 'Z'], description: 'Undo', category: 'Editing' },
  { keys: ['Ctrl', 'Shift', 'Z'], description: 'Redo', category: 'Editing' },
  { keys: ['Ctrl', 'D'], description: 'Duplicate line', category: 'Editing' },
  { keys: ['Ctrl', '/'], description: 'Toggle comment', category: 'Editing' },
  // AI
  { keys: ['Ctrl', 'L'], description: 'Focus AI input', category: 'AI' },
  { keys: ['Ctrl', 'Shift', 'L'], description: 'Send selection to AI', category: 'AI' },
  { keys: ['Enter'], description: 'Send message', category: 'AI' },
  { keys: ['Shift', 'Enter'], description: 'New line in prompt', category: 'AI' },
  { keys: ['Escape'], description: 'Stop generation', category: 'AI' },
  // Files
  { keys: ['Ctrl', 'Shift', 'E'], description: 'Focus file explorer', category: 'Files' },
  { keys: ['Ctrl', 'W'], description: 'Close current tab', category: 'Files' },
  { keys: ['Ctrl', 'Shift', 'T'], description: 'Reopen closed tab', category: 'Files' },
];

const CATEGORY_ORDER = ['Navigation', 'Editing', 'AI', 'Files'];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function KeyboardCheatsheet({ isOpen, onClose }: KeyboardCheatsheetProps) {
  const [search, setSearch] = useState('');

  const filteredByCategory = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? SHORTCUTS.filter(
          (s) =>
            s.description.toLowerCase().includes(q) ||
            s.keys.some((k) => k.toLowerCase().includes(q)) ||
            s.category.toLowerCase().includes(q)
        )
      : SHORTCUTS;

    const byCategory = new Map<string, Shortcut[]>();
    for (const cat of CATEGORY_ORDER) {
      const items = filtered.filter((s) => s.category === cat);
      if (items.length > 0) byCategory.set(cat, items);
    }
    return byCategory;
  }, [search]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Keyboard Shortcuts" size="lg">
      <div className="space-y-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search shortcuts..."
          className="w-full rounded-md border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-2 text-sm text-stone-900 dark:text-white placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
          aria-label="Search shortcuts"
        />

        <div className="max-h-[60vh] overflow-y-auto space-y-4">
          {Array.from(filteredByCategory.entries()).map(([category, shortcuts]) => (
            <div key={category}>
              <h3 className="text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider mt-4 first:mt-0 mb-2">
                {category}
              </h3>
              <div className="space-y-2">
                {shortcuts.map((s, i) => (
                  <div
                    key={`${category}-${i}`}
                    className="flex items-center justify-between gap-4 py-1.5"
                  >
                    <span className="text-sm text-stone-700 dark:text-stone-300">
                      {s.description}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {s.keys.map((key, j) => (
                        <span key={j} className="contents">
                          {j > 0 && (
                            <span className="text-stone-400 dark:text-stone-500 text-[10px] mx-0.5">
                              +
                            </span>
                          )}
                          <kbd className="px-1.5 py-0.5 bg-stone-100 dark:bg-white/10 border border-stone-200 dark:border-white/10 rounded text-[11px] font-mono text-stone-600 dark:text-stone-300 min-w-[24px] text-center">
                            {key}
                          </kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {filteredByCategory.size === 0 && (
          <p className="text-sm text-stone-500 dark:text-stone-400 py-4 text-center">
            No shortcuts match your search.
          </p>
        )}
      </div>
    </Modal>
  );
}
