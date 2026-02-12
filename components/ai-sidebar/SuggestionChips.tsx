'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Suggestion } from '@/lib/ai/prompt-suggestions';

/* ── Category icons (small inline SVGs) ───────────────────────────────────── */

const CATEGORY_ICON: Record<Suggestion['category'], string> = {
  build: '⚡',
  optimize: '✦',
  test: '◎',
  deploy: '▲',
  explore: '◇',
  fix: '✧',
};

const CATEGORY_COLORS: Record<Suggestion['category'], { border: string; text: string; bg: string }> = {
  build: { border: 'border-emerald-500/30', text: 'text-emerald-400', bg: 'bg-emerald-500/5' },
  optimize: { border: 'border-blue-500/30', text: 'text-blue-400', bg: 'bg-blue-500/5' },
  test: { border: 'border-amber-500/30', text: 'text-amber-400', bg: 'bg-amber-500/5' },
  deploy: { border: 'border-purple-500/30', text: 'text-purple-400', bg: 'bg-purple-500/5' },
  explore: { border: 'border-cyan-500/30', text: 'text-cyan-400', bg: 'bg-cyan-500/5' },
  fix: { border: 'border-red-500/30', text: 'text-red-400', bg: 'bg-red-500/5' },
};

/* ── Retry chip constant ──────────────────────────────────────────────────── */

const RETRY_CHIP: Suggestion = {
  id: '__retry_full_context__',
  label: 'Retry with full context',
  prompt: '[RETRY_WITH_FULL_CONTEXT] Retry with full file context',
  category: 'fix',
  score: 100,
  reason: 'Resend this prompt with the complete file included for better results',
};

/* ── Tooltip sub-component ────────────────────────────────────────────────── */

function ChipTooltip({ text }: { text: string }) {
  return (
    <span
      role="tooltip"
      className="
        pointer-events-none absolute left-1/2 top-full z-50
        mt-1.5 -translate-x-1/2 whitespace-normal
        rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1.5
        text-[11px] leading-snug text-gray-300 shadow-lg
        max-w-[220px] text-center
        opacity-0 transition-opacity duration-150
        group-hover/chip:opacity-100 group-hover/chip:delay-300
      "
    >
      {text}
    </span>
  );
}

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
  /* ── Merge retry chip with suggestions ──────────────────────────────────── */
  const allChips = useMemo(
    () => (showRetryChip ? [RETRY_CHIP, ...suggestions] : suggestions),
    [showRetryChip, suggestions],
  );

  /* ── Keyboard navigation state ──────────────────────────────────────────── */
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep refs array in sync with chip count
  useEffect(() => {
    chipRefs.current = chipRefs.current.slice(0, allChips.length);
  }, [allChips.length]);

  // Focus the chip element when focusedIndex changes
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
        case 'ArrowRight':
        case 'ArrowDown': {
          e.preventDefault();
          setFocusedIndex((prev) => (prev + 1) % count);
          break;
        }
        case 'ArrowLeft':
        case 'ArrowUp': {
          e.preventDefault();
          setFocusedIndex((prev) => (prev - 1 + count) % count);
          break;
        }
        case 'Home': {
          e.preventDefault();
          setFocusedIndex(0);
          break;
        }
        case 'End': {
          e.preventDefault();
          setFocusedIndex(count - 1);
          break;
        }
        case 'Enter':
        case ' ': {
          if (focusedIndex >= 0 && focusedIndex < count) {
            e.preventDefault();
            onSelect(allChips[focusedIndex].prompt);
          }
          break;
        }
        default: {
          // Number keys 1-5 select chips by position
          const num = parseInt(e.key, 10);
          if (num >= 1 && num <= 5 && num <= count) {
            e.preventDefault();
            onSelect(allChips[num - 1].prompt);
          }
          break;
        }
      }
    },
    [allChips, focusedIndex, onSelect],
  );

  const setChipRef = useCallback(
    (index: number) => (el: HTMLButtonElement | null) => {
      chipRefs.current[index] = el;
    },
    [],
  );

  if (allChips.length === 0) return null;

  return (
    <div
      ref={containerRef}
      role="toolbar"
      aria-label="Suggestion chips"
      aria-orientation="horizontal"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onFocus={() => {
        // When the toolbar itself receives focus, move to first chip
        if (focusedIndex < 0) setFocusedIndex(0);
      }}
      onBlur={(e) => {
        // Reset focus index when focus leaves the toolbar entirely
        if (!containerRef.current?.contains(e.relatedTarget as Node)) {
          setFocusedIndex(-1);
        }
      }}
      className={`flex flex-wrap gap-1.5 outline-none ${className}`}
    >
      <AnimatePresence>
        {allChips.map((s, i) => {
          const colors = CATEGORY_COLORS[s.category];
          const icon = CATEGORY_ICON[s.category];
          const isPost = variant === 'post';
          const isFocused = focusedIndex === i;
          const isRetry = s.id === RETRY_CHIP.id;

          return (
            <motion.button
              key={s.id}
              ref={setChipRef(i)}
              type="button"
              role="option"
              aria-selected={isFocused}
              tabIndex={isFocused ? 0 : -1}
              onClick={() => onSelect(s.prompt)}
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.95 }}
              transition={{
                duration: 0.25,
                delay: i * 0.06,
                ease: [0.22, 1, 0.36, 1],
              }}
              className={`
                group/chip relative inline-flex items-center gap-1.5 px-2.5 py-1.5
                rounded-lg border text-xs font-medium
                transition-all duration-200 cursor-pointer
                hover:scale-[1.02] active:scale-[0.98]
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60
                ${isRetry
                  ? `${CATEGORY_COLORS.fix.border} ${CATEGORY_COLORS.fix.bg} ${CATEGORY_COLORS.fix.text} hover:border-opacity-60 ring-1 ring-red-500/20`
                  : isPost
                    ? `${colors.border} ${colors.bg} ${colors.text} hover:border-opacity-60`
                    : 'border-gray-700 bg-gray-800/60 text-gray-400 hover:text-gray-200 hover:border-gray-600 hover:bg-gray-800'
                }
              `}
            >
              <span className={`text-[10px] leading-none ${isPost || isRetry ? '' : 'opacity-60 group-hover/chip:opacity-100'}`}>
                {icon}
              </span>
              <span className="truncate max-w-[160px]">{s.label}</span>

              {/* Tooltip: show reason on hover */}
              {s.reason && <ChipTooltip text={s.reason} />}
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
