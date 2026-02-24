'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Eye, AlertTriangle, X } from 'lucide-react';

export interface ClarificationOption {
  id: string;
  label: string;
  recommended?: boolean;
  actionType?: 'view_reference' | 'apply_anyway' | 'cancel' | 'select';
  actionData?: Record<string, unknown>;
}

interface ClarificationCardProps {
  question: string;
  options: ClarificationOption[];
  allowMultiple?: boolean;
  /** Allow freeform text input alongside options (EPIC V4). */
  allowFreeform?: boolean;
  /** Current clarification round (EPIC V4). */
  round?: number;
  /** Max clarification rounds (EPIC V4). */
  maxRounds?: number;
  /** Optional description for context. */
  description?: string;
  onSend?: (content: string) => void;
  /** Callback for options with an actionType — receives the full option so the parent can route. */
  onAction?: (option: ClarificationOption) => void;
}

export function ClarificationCard({ question, options, onSend, onAction, allowFreeform, round, maxRounds, description }: ClarificationCardProps) {
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [freeformText, setFreeformText] = useState('');
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    buttonRefs.current = buttonRefs.current.slice(0, options.length);
  }, [options.length]);

  useEffect(() => {
    if (focusedIndex >= 0 && focusedIndex < options.length) {
      buttonRefs.current[focusedIndex]?.focus();
    }
  }, [focusedIndex, options.length]);

  const handleSelect = useCallback((option: ClarificationOption) => {
    setSelectedId(option.id);
    setTimeout(() => {
      if (option.actionType && onAction) {
        onAction(option);
      } else {
        onSend?.(option.label);
      }
    }, 150);
  }, [onSend, onAction]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const count = options.length;
      if (count === 0) return;

      switch (e.key) {
        case 'ArrowDown':
        case 'ArrowRight': {
          e.preventDefault();
          setFocusedIndex((prev) => (prev + 1) % count);
          break;
        }
        case 'ArrowUp':
        case 'ArrowLeft': {
          e.preventDefault();
          setFocusedIndex((prev) => (prev - 1 + count) % count);
          break;
        }
        case 'Enter':
        case ' ': {
          if (focusedIndex >= 0 && focusedIndex < count) {
            e.preventDefault();
            handleSelect(options[focusedIndex]);
          }
          break;
        }
        default: {
          const num = parseInt(e.key, 10);
          if (num >= 1 && num <= count) {
            e.preventDefault();
            handleSelect(options[num - 1]);
          }
          break;
        }
      }
    },
    [options, focusedIndex, handleSelect],
  );

  const setButtonRef = useCallback(
    (index: number) => (el: HTMLButtonElement | null) => {
      buttonRefs.current[index] = el;
    },
    [],
  );

  const handleFreeformSubmit = useCallback(() => {
    if (freeformText.trim()) {
      setSelectedId('freeform');
      setTimeout(() => {
        onSend?.(freeformText.trim());
      }, 150);
    }
  }, [freeformText, onSend]);

  if (options.length === 0 && !allowFreeform) return null;

  const questionIcon = (
    <svg
      className="h-3.5 w-3.5 text-amber-500 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );

  const starIcon = (
    <svg className="h-2 w-2" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );

  const checkIcon = (
    <svg
      className="flex-shrink-0 h-3.5 w-3.5 text-sky-500 mt-0.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );

  return (
    <div
      ref={containerRef}
      className="my-2 rounded-lg border ide-border ide-surface-inset overflow-hidden"
      role="listbox"
      aria-label="Clarification options"
      aria-live="polite"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onFocus={() => {
        if (focusedIndex < 0) setFocusedIndex(0);
      }}
      onBlur={(e) => {
        if (!containerRef.current?.contains(e.relatedTarget as Node)) {
          setFocusedIndex(-1);
        }
      }}
    >
      <div className="px-3 py-2 border-b ide-border-subtle">
        <div className="flex items-center gap-1.5">
          {questionIcon}
          <p className="text-xs ide-text-1 font-medium">{question}</p>
          {round != null && maxRounds != null && (
            <span className="ml-auto text-[9px] ide-text-quiet whitespace-nowrap">
              {round}/{maxRounds}
            </span>
          )}
        </div>
        {description && (
          <p className="text-[10px] ide-text-2 mt-1 ml-5">{description}</p>
        )}
      </div>

      <div className="p-1.5 flex flex-col gap-1">
        {options.map((option, i) => {
          const isRecommended = option.recommended === true;
          const isSelected = selectedId === option.id;
          const isFocused = focusedIndex === i;
          const { actionType } = option;

          const base =
            'relative flex items-start gap-2 w-full text-left text-xs rounded-md px-3 py-2 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60 disabled:opacity-60 disabled:cursor-default';

          let state: string;
          if (isSelected) {
            state = 'bg-sky-500/15 border border-sky-500/40 text-sky-600 dark:text-sky-300';
          } else if (actionType === 'apply_anyway') {
            state =
              'bg-amber-500/10 dark:bg-amber-500/20 border border-amber-500/25 text-amber-600 dark:text-amber-400 hover:bg-amber-500/15 dark:hover:bg-amber-500/25 hover:border-amber-500/40';
          } else if (actionType === 'cancel') {
            state =
              'ide-surface hover:ide-surface-input border ide-border-subtle text-stone-400 dark:text-stone-500 hover:text-stone-500 dark:hover:text-stone-400';
          } else if (isRecommended) {
            state =
              'bg-emerald-500/5 border border-emerald-500/25 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10 hover:border-emerald-500/40';
          } else {
            state =
              'ide-surface hover:ide-surface-input border ide-border-subtle ide-text-2 hover:ide-text';
          }

          const numStyle =
            actionType === 'apply_anyway'
              ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
              : actionType === 'cancel'
                ? 'ide-surface-inset text-stone-400 dark:text-stone-500'
                : isRecommended
                  ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300'
                  : 'ide-surface-inset ide-text-3';

          const actionIcon =
            actionType === 'view_reference' ? (
              <Eye className="h-3 w-3 shrink-0 text-sky-500 dark:text-sky-400 mt-0.5" aria-hidden="true" />
            ) : actionType === 'apply_anyway' ? (
              <AlertTriangle className="h-3 w-3 shrink-0 text-amber-500 dark:text-amber-400 mt-0.5" aria-hidden="true" />
            ) : actionType === 'cancel' ? (
              <X className="h-3 w-3 shrink-0 text-stone-400 dark:text-stone-500 mt-0.5" aria-hidden="true" />
            ) : null;

          const ariaLabel = actionType
            ? `${option.label} (${actionType.replace(/_/g, ' ')})`
            : undefined;

          return (
            <button
              key={option.id}
              ref={setButtonRef(i)}
              type="button"
              role="option"
              aria-selected={isFocused}
              aria-label={ariaLabel}
              tabIndex={isFocused ? 0 : -1}
              onClick={() => handleSelect(option)}
              disabled={selectedId !== null}
              className={`${base} ${state}`}
            >
              <span
                className={`flex-shrink-0 w-4 h-4 rounded flex items-center justify-center text-[10px] font-semibold mt-0.5 ${numStyle}`}
              >
                {i + 1}
              </span>

              {actionIcon}

              <span className="flex-1 leading-relaxed">{option.label}</span>

              {isRecommended && !isSelected && (
                <span className="flex-shrink-0 inline-flex items-center gap-0.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mt-0.5">
                  {starIcon}
                  Best
                </span>
              )}

              {isSelected && checkIcon}
            </button>
          );
        })}
      </div>

      {/* EPIC V4: Freeform text input */}
      {allowFreeform && (
        <div className="px-3 py-2 border-t ide-border-subtle">
          <div className="flex items-center gap-1.5">
            <input
              ref={inputRef}
              type="text"
              value={freeformText}
              onChange={(e) => setFreeformText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.stopPropagation();
                  handleFreeformSubmit();
                }
              }}
              placeholder="Or type your own response..."
              disabled={selectedId !== null}
              className="flex-1 text-xs rounded-md px-2 py-1.5 ide-surface-input ide-border ide-text placeholder:ide-text-quiet focus:outline-none focus:ring-1 focus:ring-sky-500/60 disabled:opacity-60"
            />
            <button
              type="button"
              onClick={handleFreeformSubmit}
              disabled={selectedId !== null || !freeformText.trim()}
              className="text-xs px-2 py-1.5 rounded-md bg-sky-500/15 text-sky-600 dark:text-sky-300 hover:bg-sky-500/25 disabled:opacity-40 disabled:cursor-default transition-colors"
            >
              Send
            </button>
          </div>
        </div>
      )}

      <div className="px-3 py-1.5 border-t ide-border-subtle">
        <p className="text-[10px] ide-text-quiet">
          {options.length > 0 && (
            <>
              {'Press '}
              <kbd className="px-1 py-0.5 rounded ide-surface-inset ide-border text-[9px] font-mono">1</kbd>
              {'-'}
              <kbd className="px-1 py-0.5 rounded ide-surface-inset ide-border text-[9px] font-mono">{options.length}</kbd>
              {' or click to select'}
            </>
          )}
          {options.length > 0 && allowFreeform && ' · '}
          {allowFreeform && 'Type a custom response below'}
        </p>
      </div>
    </div>
  );
}
