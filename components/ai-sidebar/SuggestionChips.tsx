'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Zap } from 'lucide-react';
import type { Suggestion } from '@/lib/ai/prompt-suggestions';

/* ── Retry chip constant ──────────────────────────────────────────────────── */

const RETRY_CHIP: Suggestion = {
  id: '__retry_full_context__',
  label: 'Retry with full context',
  prompt: '[RETRY_WITH_FULL_CONTEXT] Retry with full file context',
  category: 'fix',
  score: 100,
  reason: 'Resend this prompt with the complete file included for better results',
};

/* ── Category accent colours ─────────────────────────────────────────────── */

const CATEGORY_TEXT: Record<Suggestion['category'], string> = {
  build:    'text-emerald-400',
  optimize: 'text-sky-400',
  test:     'text-amber-400',
  deploy:   'text-purple-400',
  explore:  'text-cyan-400',
  fix:      'text-red-400',
};

/* ── Component ────────────────────────────────────────────────────────────── */

interface SuggestionChipsProps {
  suggestions: Suggestion[];
  onSelect: (prompt: string) => void;
  /** 'pre' = muted style for pre-prompt, 'post' = accent style after response */
  variant?: 'pre' | 'post';
  /** When true, prepend a "Retry with full context" chip */
  showRetryChip?: boolean;
  className?: string;
}

export function SuggestionChips({
  suggestions,
  onSelect,
  variant = 'pre',
  showRetryChip = false,
  className = '',
}: SuggestionChipsProps) {
  const allChips = useMemo(
    () => (showRetryChip ? [RETRY_CHIP, ...suggestions] : suggestions),
    [showRetryChip, suggestions],
  );

  /* ── Keyboard navigation ─────────────────────────────────────────────────── */
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chipRefs.current = chipRefs.current.slice(0, allChips.length);
  }, [allChips.length]);

  useEffect(() => {
    if (focusedIndex >= 0 && focusedIndex < allChips.length) {
      chipRefs.current[focusedIndex]?.focus();
    }
  }, [focusedIndex, allChips.length]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const count = allChips.length;
      if (count === 0) return;
      switch (e.key) {
        case 'ArrowRight': case 'ArrowDown':
          e.preventDefault(); setFocusedIndex(p => (p + 1) % count); break;
        case 'ArrowLeft': case 'ArrowUp':
          e.preventDefault(); setFocusedIndex(p => (p - 1 + count) % count); break;
        case 'Home': e.preventDefault(); setFocusedIndex(0); break;
        case 'End':  e.preventDefault(); setFocusedIndex(count - 1); break;
        case 'Enter': case ' ':
          if (focusedIndex >= 0 && focusedIndex < count) { e.preventDefault(); onSelect(allChips[focusedIndex].prompt); } break;
        case 'Tab':
          e.preventDefault();
          setFocusedIndex(p => e.shiftKey ? (p - 1 + count) % count : (p + 1) % count);
          break;
        default: {
          const num = parseInt(e.key, 10);
          if (num >= 1 && num <= 5 && num <= count) { e.preventDefault(); onSelect(allChips[num - 1].prompt); }
        }
      }
    },
    [allChips, focusedIndex, onSelect],
  );

  const setChipRef = useCallback(
    (index: number) => (el: HTMLButtonElement | null) => { chipRefs.current[index] = el; },
    [],
  );

  if (allChips.length === 0) return null;

  const isPost = variant === 'post';

  return (
    <div
      ref={containerRef}
      role="toolbar"
      aria-label="Suggestion chips"
      aria-orientation="horizontal"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onFocus={() => { if (focusedIndex < 0) setFocusedIndex(0); }}
      onBlur={(e) => { if (!containerRef.current?.contains(e.relatedTarget as Node)) setFocusedIndex(-1); }}
      className={`flex flex-nowrap gap-1.5 overflow-x-auto scrollbar-hide outline-none ${className}`}
    >
      {allChips.map((s, i) => {
        const isFocused = focusedIndex === i;
        const accentText = isPost ? CATEGORY_TEXT[s.category] : 'ide-text-muted';

        return (
          <button
            key={s.id}
            ref={setChipRef(i)}
            type="button"
            role="option"
            aria-selected={isFocused}
            tabIndex={isFocused ? 0 : -1}
            title={s.reason ?? s.label}
            onClick={() => onSelect(s.prompt)}
            className={`
              group/chip relative shrink-0 inline-flex items-center gap-1 px-2 py-1
              rounded-md border text-[11px] font-medium whitespace-nowrap
              transition-colors duration-150 cursor-pointer
              active:scale-[0.97]
              focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/60
              ide-border ide-surface-inset ide-hover
              ${accentText}
            `}
          >
            <Zap className="h-2.5 w-2.5 shrink-0 opacity-60" aria-hidden />
            <span className="truncate max-w-[160px]">{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}
