'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface PaletteCommand {
  id: string;
  category: 'file' | 'command' | 'navigation' | 'account';
  label: string;
  description?: string;
  shortcut?: string;
  icon?: React.ReactNode;
  action: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  files: Array<{ id: string; name: string; path: string }>;
  recentFiles: Array<{ fileId: string; openedAt: number }>;
  onFileSelect: (fileId: string) => void;
  commands?: PaletteCommand[];
}

type PaletteMode = 'files' | 'commands';

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
/*  Icon helpers                                                       */
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
  let color = 'ide-text-muted';
  if (ext === 'liquid') color = 'text-green-400';
  else if (ext === 'js' || ext === 'jsx' || ext === 'ts' || ext === 'tsx') color = 'text-yellow-400';
  else if (ext === 'css' || ext === 'scss') color = 'text-sky-500 dark:text-sky-400';
  else if (ext === 'json') color = 'text-orange-400';

  return (
    <svg {...iconProps} className={`shrink-0 ${color}`}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

/** Terminal icon for "command" category */
function TerminalIcon() {
  return (
    <svg {...iconProps} className="shrink-0 text-sky-500 dark:text-sky-400">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

/** Arrow-right icon for "navigation" category */
function NavigationIcon() {
  return (
    <svg {...iconProps} className="shrink-0 text-emerald-400">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

/** User icon for "account" category */
function AccountIcon() {
  return (
    <svg {...iconProps} className="shrink-0 text-purple-400">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function CategoryIcon({ category }: { category: PaletteCommand['category'] }) {
  switch (category) {
    case 'command':
      return <TerminalIcon />;
    case 'navigation':
      return <NavigationIcon />;
    case 'account':
      return <AccountIcon />;
    default:
      return null;
  }
}

const CATEGORY_LABELS: Record<string, string> = {
  command: 'Commands',
  navigation: 'Navigation',
  account: 'Account',
};

const CATEGORY_ORDER: PaletteCommand['category'][] = ['command', 'navigation', 'account'];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function CommandPalette({
  isOpen,
  onClose,
  files,
  recentFiles,
  onFileSelect,
  commands = [],
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Detect mode: input starting with ">" switches to command mode
  const mode: PaletteMode = query.startsWith('>') ? 'commands' : 'files';
  const commandQuery = mode === 'commands' ? query.slice(1).trimStart() : '';

  // Reset state when isOpen transitions to true
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

  // ── Filtered commands (grouped by category) ─────────────────────────
  const filteredCommands = useMemo(() => {
    if (mode !== 'commands') return [];
    if (!commandQuery) return commands;
    return commands.filter((c) => fuzzyMatch(commandQuery, c.label));
  }, [mode, commandQuery, commands]);

  const groupedCommands = useMemo(() => {
    const groups: Array<{ category: PaletteCommand['category']; items: PaletteCommand[] }> = [];
    for (const cat of CATEGORY_ORDER) {
      const items = filteredCommands.filter((c) => c.category === cat);
      if (items.length > 0) {
        groups.push({ category: cat, items });
      }
    }
    return groups;
  }, [filteredCommands]);

  // ── Build flat list for keyboard navigation ─────────────────────────
  type FileItem = { type: 'file'; id: string; name: string; path: string; section: 'recent' | 'all'; openedAt?: number };
  type CommandItem = { type: 'command'; command: PaletteCommand; categoryFirst: boolean };
  type FlatItem = FileItem | CommandItem;

  const flatList: FlatItem[] = useMemo(() => {
    if (mode === 'commands') {
      const items: CommandItem[] = [];
      for (const group of groupedCommands) {
        group.items.forEach((cmd, idx) => {
          items.push({ type: 'command', command: cmd, categoryFirst: idx === 0 });
        });
      }
      return items;
    }

    // File mode
    const items: FileItem[] = [];
    if (!query && recentItems.length > 0) {
      recentItems.forEach((ri) =>
        items.push({ type: 'file', id: ri.id, name: ri.name, path: ri.path, section: 'recent', openedAt: ri.openedAt })
      );
    }
    filteredFiles.forEach((f) =>
      items.push({ type: 'file', id: f.id, name: f.name, path: f.path, section: 'all' })
    );
    return items;
  }, [mode, query, recentItems, filteredFiles, groupedCommands]);

  // Clamp selected index when list changes
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
    if (!item) return;
    if (item.type === 'file') {
      onFileSelect(item.id);
      onClose();
    } else {
      item.command.action();
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

  // Track section boundaries for file mode headers
  let shownRecentHeader = false;
  let shownAllHeader = false;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] ide-overlay backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg ide-surface-pop border ide-border rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search input with mode indicator */}
        <div className="p-3 border-b ide-border">
          <div className="flex items-center gap-2">
            {/* Mode pill */}
            <span
              className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                mode === 'commands'
                  ? 'bg-sky-500/20 dark:bg-sky-500/20 text-sky-600 dark:text-sky-400 border border-sky-500/30'
                  : 'ide-surface-inset ide-text-muted border ide-border'
              }`}
            >
              {mode === 'commands' ? 'Commands' : 'Files'}
            </span>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedIndex(0);
              }}
              placeholder={mode === 'commands' ? 'Search commands…' : 'Search files…'}
              className="w-full ide-surface-input border ide-border text-sm ide-text placeholder-ide-text-muted rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-sky-500/50 dark:focus:ring-sky-400/50"
            />
          </div>
          {/* Helper hint */}
          <p className="mt-1.5 text-[10px] ide-text-quiet pl-1">
            Type to search files, <kbd className="px-1 py-0.5 ide-surface-inset rounded ide-text-muted font-mono">&gt;</kbd> for commands
          </p>
        </div>

        {/* Results list */}
        <div ref={listRef} className="max-h-80 overflow-y-auto py-1">
          {flatList.length === 0 && (
            <div className="px-3 py-6 text-center text-sm ide-text-muted">
              {mode === 'commands' ? 'No commands found' : 'No files found'}
            </div>
          )}

          {/* ── Command mode rendering ──────────────────────────────── */}
          {mode === 'commands' &&
            flatList.map((item, idx) => {
              if (item.type !== 'command') return null;
              const isSelected = idx === selectedIndex;

              return (
                <div key={item.command.id}>
                  {/* Category header */}
                  {item.categoryFirst && (
                    <div className="px-3 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wider ide-text-muted">
                      {CATEGORY_LABELS[item.command.category] ?? item.command.category}
                    </div>
                  )}
                  <button
                    type="button"
                    className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left transition-colors ${
                      isSelected ? 'ide-active' : 'ide-hover'
                    }`}
                    onClick={() => {
                      item.command.action();
                      onClose();
                    }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    {item.command.icon ?? <CategoryIcon category={item.command.category} />}
                    <span className="text-sm ide-text-2 truncate">{item.command.label}</span>
                    {item.command.description && (
                      <span className="text-xs ide-text-muted truncate ml-auto">{item.command.description}</span>
                    )}
                    {item.command.shortcut && (
                      <kbd className="shrink-0 ml-auto text-[10px] ide-text-quiet ide-surface-inset px-1.5 py-0.5 rounded font-mono">
                        {item.command.shortcut}
                      </kbd>
                    )}
                  </button>
                </div>
              );
            })}

          {/* ── File mode rendering (original behavior) ────────────── */}
          {mode === 'files' &&
            flatList.map((item, idx) => {
              if (item.type !== 'file') return null;
              let header: React.ReactNode = null;

              if (item.section === 'recent' && !shownRecentHeader) {
                shownRecentHeader = true;
                header = (
                  <div className="px-3 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wider ide-text-muted">
                    Recent Files
                  </div>
                );
              }
              if (item.section === 'all' && !shownAllHeader) {
                shownAllHeader = true;
                header = (
                  <div className="px-3 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wider ide-text-muted">
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
                      isSelected ? 'ide-active' : 'ide-hover'
                    }`}
                    onClick={() => {
                      onFileSelect(item.id);
                      onClose();
                    }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <FileIcon fileName={item.name} />
                    <span className="text-sm ide-text-2 truncate">{item.name}</span>
                    <span className="text-xs ide-text-muted truncate ml-auto">{item.path}</span>
                    {item.openedAt != null && (
                      <span className="text-[10px] ide-text-quiet whitespace-nowrap shrink-0">
                        {formatRecent(item.openedAt)}
                      </span>
                    )}
                  </button>
                </div>
              );
            })}
        </div>

        {/* Footer hint */}
        <div className="px-3 py-1.5 border-t ide-border text-[10px] ide-text-quiet flex gap-3">
          <span><kbd className="px-1 py-0.5 ide-surface-inset rounded ide-text-muted">↑↓</kbd> navigate</span>
          <span><kbd className="px-1 py-0.5 ide-surface-inset rounded ide-text-muted">↵</kbd> {mode === 'commands' ? 'run' : 'open'}</span>
          <span><kbd className="px-1 py-0.5 ide-surface-inset rounded ide-text-muted">esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
