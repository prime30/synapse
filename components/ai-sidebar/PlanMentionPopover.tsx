'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface PlanOption {
  id: string;
  name: string;
  todoProgress: { completed: number; total: number };
}

interface PlanMentionPopoverProps {
  visible: boolean;
  query: string;
  plans: PlanOption[];
  selectedIndex: number;
  anchorRect: { top: number; left: number } | null;
  onSelect: (plan: PlanOption) => void;
  onDismiss: () => void;
}

export type PlanMention = PlanOption;
export type { PlanOption, PlanMentionPopoverProps };

export function PlanMentionPopover({
  visible,
  query,
  plans,
  selectedIndex,
  anchorRect,
  onSelect,
  onDismiss,
}: PlanMentionPopoverProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  const filtered = plans.filter((p) =>
    p.name.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  useEffect(() => {
    if (!visible) return;
    const handleClick = (e: MouseEvent) => {
      if (listRef.current && !listRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [visible, onDismiss]);

  if (!visible || !anchorRect) return null;

  const isEmpty = plans.length === 0;
  const noMatch = !isEmpty && filtered.length === 0;

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label="Plan mentions"
      className="fixed z-50 w-64 max-h-[180px] overflow-y-auto rounded-lg border ide-border ide-surface shadow-lg"
      style={{ bottom: `calc(100vh - ${anchorRect.top}px + 4px)`, left: anchorRect.left }}
    >
      {isEmpty && (
        <div className="px-3 py-4 text-center text-xs ide-text-muted">
          No plans yet
        </div>
      )}

      {noMatch && (
        <div className="px-3 py-4 text-center text-xs ide-text-muted">
          No plans found
        </div>
      )}

      {filtered.map((plan, i) => {
        const isSelected = i === selectedIndex;
        return (
          <button
            key={plan.id}
            ref={isSelected ? selectedRef : undefined}
            role="option"
            aria-selected={isSelected}
            type="button"
            className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors ${
              isSelected
                ? 'bg-sky-500/10'
                : 'hover:bg-stone-500/5 dark:hover:bg-white/5'
            }`}
            onClick={() => onSelect(plan)}
          >
            <span className="truncate ide-text-1 font-medium">{plan.name}</span>
            <span className="shrink-0 tabular-nums ide-text-muted text-[10px]">
              {plan.todoProgress.completed}/{plan.todoProgress.total}
            </span>
          </button>
        );
      })}
    </div>
  );
}
