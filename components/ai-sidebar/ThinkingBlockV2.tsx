'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { safeTransition } from '@/lib/accessibility';
import { AnimatePresence, motion } from 'framer-motion';

interface ThinkingBlockV2Props {
  reasoningText: string;
  isComplete: boolean;
  startedAt: number;
  elapsedMs: number;
}

function formatElapsed(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}

export function ThinkingBlockV2({
  reasoningText,
  isComplete,
  startedAt,
  elapsedMs,
}: ThinkingBlockV2Props) {
  const [expanded, setExpanded] = useState(true);
  const [liveElapsed, setLiveElapsed] = useState(0);
  const userToggledRef = useRef(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const hasReasoning = reasoningText.length > 0;

  // Live elapsed counter: tick every second while active, freeze on completion
  useEffect(() => {
    if (isComplete) {
      // Use requestAnimationFrame to defer the setState to avoid synchronous cascade
      const raf = requestAnimationFrame(() => {
        if (elapsedMs > 0) setLiveElapsed(elapsedMs);
      });
      return () => cancelAnimationFrame(raf);
    }
    if (!startedAt) return;
    const id = setInterval(() => {
      setLiveElapsed(prev => prev + 1000);
    }, 1000);
    return () => clearInterval(id);
  }, [isComplete, startedAt, elapsedMs]);

  // Auto-collapse after completion
  useEffect(() => {
    if (!isComplete || userToggledRef.current) return;
    const id = setTimeout(() => setExpanded(false), 500);
    return () => clearTimeout(id);
  }, [isComplete]);

  // Auto-scroll reasoning body to bottom
  useEffect(() => {
    if (!bodyRef.current || !expanded) return;
    const el = bodyRef.current;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (isAtBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [reasoningText, expanded]);

  const toggle = useCallback(() => {
    userToggledRef.current = true;
    setExpanded(prev => !prev);
  }, []);

  // Don't render body section if no reasoning
  if (!hasReasoning && isComplete) {
    return (
      <div className="my-1.5">
        <div className="flex items-center gap-1.5 px-1 py-1 text-xs font-medium ide-text-2">
          <Check className="h-3 w-3 text-accent shrink-0" aria-hidden />
          <span>Thought for {formatElapsed(liveElapsed)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="my-1.5">
      <button
        type="button"
        onClick={hasReasoning ? toggle : undefined}
        aria-expanded={expanded}
        className={`flex w-full items-center gap-1.5 rounded-lg ide-surface-inset border ide-border-subtle px-3 py-1.5 text-xs font-medium transition-colors ${hasReasoning ? 'cursor-pointer ide-hover' : 'cursor-default'}`}
      >
        {/* Status icon */}
        {isComplete ? (
          <Check className="h-3 w-3 text-accent shrink-0" aria-hidden />
        ) : (
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-sky-500/50 dark:border-sky-400/50 bg-sky-500/10 dark:bg-sky-400/10 motion-safe:animate-pulse"
            aria-hidden
          />
        )}

        {/* Label */}
        <span className={`ide-text-2 flex-1 ${!isComplete ? 'motion-safe:animate-pulse' : ''}`}>
          {isComplete ? `Thought for ${formatElapsed(liveElapsed)}` : 'Thinking...'}
        </span>

        {/* Elapsed time */}
        {!isComplete && liveElapsed > 0 && (
          <span className="text-[10px] tabular-nums ide-text-quiet font-mono ml-auto" aria-live="polite">
            {formatElapsed(liveElapsed)}
          </span>
        )}

        {/* Chevron (only if has reasoning) */}
        {hasReasoning && (
          <ChevronDown
            className={`h-3 w-3 ide-text-3 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
            aria-hidden
          />
        )}
      </button>

      {/* Reasoning body */}
      {hasReasoning && (
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={safeTransition(0.2)}
              className="overflow-hidden"
            >
              <div
                ref={bodyRef}
                className="text-xs ide-text-3 leading-relaxed whitespace-pre-wrap px-3 py-2 border-t ide-border-subtle max-h-[200px] overflow-y-auto"
              >
                {reasoningText}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}
