'use client';

import {
  useRef,
  useEffect,
  useCallback,
  useMemo,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
  Wrench,
  BookOpen,
  ListChecks,
  FlaskConical,
  Bug,
  ScanSearch,
  type LucideIcon,
} from 'lucide-react';
import type { SlashCommand } from '@/lib/ai/slash-commands';
import { matchSlashCommand } from '@/lib/ai/slash-commands';

const ICON_MAP: Record<string, LucideIcon> = {
  Wrench,
  BookOpen,
  ListChecks,
  FlaskConical,
  Bug,
  ScanSearch,
};

interface SlashCommandMenuProps {
  query: string;
  onSelect: (command: SlashCommand) => void;
  onClose: () => void;
  anchorRect?: DOMRect;
}

export function SlashCommandMenu({
  query,
  onSelect,
  onClose,
  anchorRect,
}: SlashCommandMenuProps) {
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const menuId = `slash-menu-${Date.now()}`;

  const commands = useMemo(() => matchSlashCommand(query), [query]);

  const clampedIndex = Math.max(
    0,
    Math.min(highlightedIndex, commands.length - 1)
  );

  useEffect(() => {
    const row = listRef.current?.children[clampedIndex] as HTMLElement | undefined;
    row?.scrollIntoView({ block: 'nearest' });
  }, [clampedIndex]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [query]);

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
          i < commands.length - 1 ? i + 1 : 0
        );
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((i) =>
          i > 0 ? i - 1 : commands.length - 1
        );
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = commands[clampedIndex];
        if (cmd) {
          onSelect(cmd);
        }
        return;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [commands, clampedIndex, onSelect, onClose]);

  const handleSelect = useCallback(
    (cmd: SlashCommand) => {
      onSelect(cmd);
    },
    [onSelect]
  );

  if (commands.length === 0) return null;

  const content = (
    <div
      id={menuId}
      role="listbox"
      aria-label="Slash commands"
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
        {commands.map((cmd, i) => {
          const Icon = ICON_MAP[cmd.icon] ?? Wrench;
          const isHighlighted = i === clampedIndex;
          return (
            <button
              key={cmd.id}
              type="button"
              role="option"
              aria-selected={isHighlighted}
              className={`flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left ${
                isHighlighted
                  ? 'bg-stone-100 dark:bg-white/10'
                  : 'hover:bg-stone-50 dark:hover:bg-white/5'
              }`}
              onClick={() => handleSelect(cmd)}
              onMouseEnter={() => setHighlightedIndex(i)}
              onMouseDown={(e) => e.preventDefault()}
            >
              <Icon className="h-4 w-4 shrink-0 text-sky-500 dark:text-sky-400" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-stone-900 dark:text-white">
                  {cmd.label}
                </div>
                <div className="truncate text-xs text-stone-500 dark:text-stone-400">
                  {cmd.description}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(content, document.body, menuId)
    : null;
}
