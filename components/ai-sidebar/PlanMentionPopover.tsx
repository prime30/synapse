'use client';

import { useEffect, useRef, useMemo } from 'react';

export interface PlanMention {
  id: string;
  name: string;
  todoProgress: { completed: number; total: number };
}

interface PlanMentionPopoverProps {
  query: string;
  plans: PlanMention[];
  selectedIndex: number;
  onSelect: (plan: PlanMention) => void;
  onDismiss: () => void;
  anchorRect?: { top: number; left: number };
}

const ROW_HEIGHT = 36;
const MAX_VISIBLE = 5;

export function PlanMentionPopover({
  query,
  plans,
  selectedIndex,
  onSelect,
  onDismiss,
  anchorRect,
}: PlanMentionPopoverProps) {
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return plans.filter((p) => p.name.toLowerCase().includes(q));
  }, [query, plans]);

  const clampedIndex = Math.max(0, Math.min(selectedIndex, filtered.length - 1));

  useEffect(() => {
    const row = listRef.current?.children[clampedIndex] as HTMLElement | undefined;
    row?.scrollIntoView({ block: 'nearest' });
  }, [clampedIndex]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onDismiss]);

  if (filtered.length === 0) {
    return (
      <div
        className="absolute z-50 rounded-lg border ide-border ide-surface shadow-lg px-3 py-2"
        style={
          anchorRect
            ? { bottom: `calc(100% - ${anchorRect.top}px)`, left: anchorRect.left }
            : { bottom: '100%', left: 0 }
        }
      >
        <span className="text-xs ide-text-muted">No plans</span>
      </div>
    );
  }

  return (
    <div
      className="absolute z-50 rounded-lg border ide-border ide-surface shadow-lg overflow-hidden"
      style={{
        ...(anchorRect
          ? { bottom: `calc(100% - ${anchorRect.top}px)`, left: anchorRect.left }
          : { bottom: '100%', left: 0 }),
        width: 260,
      }}
      role="listbox"
      aria-label="Plan mentions"
    >
      <div
        ref={listRef}
        className="overflow-y-auto"
        style={{ maxHeight: ROW_HEIGHT * MAX_VISIBLE }}
      >
        {filtered.map((plan, i) => {
          const isSelected = i === clampedIndex;
          return (
            <button
              key={plan.id}
              type="button"
              role="option"
              aria-selected={isSelected}
              className={`flex w-full items-center justify-between gap-2 px-3 text-left transition-colors ${
                isSelected ? 'bg-sky-500/10' : 'hover:bg-sky-500/5'
              }`}
              style={{ height: ROW_HEIGHT }}
              onClick={() => onSelect(plan)}
              onMouseDown={(e) => e.preventDefault()}
            >
              <span className="truncate text-xs ide-text-1">{plan.name}</span>
              <span className="shrink-0 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                {plan.todoProgress.completed}/{plan.todoProgress.total}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
