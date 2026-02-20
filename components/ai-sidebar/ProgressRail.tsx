'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Square } from 'lucide-react';
import type { RailStep, RailPhaseStatus } from '@/lib/agents/phase-mapping';

// -- Constants --

/** Minimum time a phase must be visible before transitioning (prevents flicker). */
const MIN_PHASE_DISPLAY_MS = 500;

// -- Props --

interface ProgressRailProps {
  steps: RailStep[];
  isStreaming: boolean;
  onStop?: () => void;
}

// -- Indicator helpers --

function getIndicatorClasses(status: RailPhaseStatus): string {
  const base = 'flex items-center justify-center w-6 h-6 rounded-full border-2 shrink-0 transition-colors';
  switch (status) {
    case 'active':
      return `${base} bg-sky-500 dark:bg-sky-400 border-sky-500 dark:border-sky-400 text-white`;
    case 'completed':
      return `${base} bg-[#28CD56] border-[#28CD56] text-white`;
    case 'error':
      return `${base} bg-red-500 dark:bg-red-400 border-red-500 dark:border-red-400 text-white`;
    case 'skipped':
      return `${base} bg-stone-200 dark:bg-white/10 border-stone-300 dark:border-white/20 text-stone-500 dark:text-white/40`;
    case 'pending':
    default:
      return `${base} bg-stone-100 dark:bg-white/5 border-stone-300 dark:border-white/10 text-stone-400 dark:text-white/30`;
  }
}

function IndicatorIcon({ status }: { status: RailPhaseStatus }) {
  switch (status) {
    case 'active':
      return <span className="h-3.5 w-3.5 rounded-full bg-current opacity-80 inline-block" aria-hidden />;
    case 'completed':
      return (
        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      );
    case 'error':
      return (
        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      );
    case 'skipped':
      return (
        <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
        </svg>
      );
    case 'pending':
    default:
      return <span className="w-2 h-2 rounded-full bg-current opacity-30" />;
  }
}

function getLabelClasses(status: RailPhaseStatus): string {
  const base = 'text-xs font-medium whitespace-nowrap';
  switch (status) {
    case 'active':
      return `${base} text-stone-900 dark:text-white`;
    case 'completed':
      return `${base} text-stone-600 dark:text-stone-400`;
    case 'error':
      return `${base} text-red-500 dark:text-red-400`;
    case 'skipped':
    case 'pending':
    default:
      return `${base} text-stone-400 dark:text-white/40`;
  }
}

function getLineClasses(leftStatus: RailPhaseStatus, rightStatus: RailPhaseStatus): string {
  if (leftStatus === 'completed' && rightStatus === 'completed') {
    return 'bg-[#28CD56]';
  }
  if (leftStatus === 'completed' && rightStatus === 'active') {
    return 'bg-gradient-to-r from-[#28CD56] to-stone-200 dark:to-white/10';
  }
  if (leftStatus === 'completed') {
    return 'bg-[#28CD56]';
  }
  return 'bg-stone-200 dark:bg-white/10';
}

// -- 500ms minimum phase display hook --

/**
 * Debounces rail step transitions so each phase is visible for at least
 * MIN_PHASE_DISPLAY_MS before transitioning. Prevents visual flicker when
 * fast phases complete in <100ms.
 *
 * Uses a ref + timeout pattern to avoid synchronous setState in effects.
 */
function useDebouncedSteps(steps: RailStep[]): RailStep[] {
  const [displaySteps, setDisplaySteps] = useState(steps);
  const lastUpdateRef = useRef(0);
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Clear any pending debounce from previous render
    if (pendingRef.current) {
      clearTimeout(pendingRef.current);
      pendingRef.current = null;
    }

    const now = Date.now();
    // First update: initialize the timestamp and schedule immediate
    if (lastUpdateRef.current === 0) lastUpdateRef.current = now;
    const elapsed = now - lastUpdateRef.current;

    // Schedule the update — always via setTimeout to avoid synchronous setState in effect
    const delay = elapsed >= MIN_PHASE_DISPLAY_MS ? 0 : MIN_PHASE_DISPLAY_MS - elapsed;
    pendingRef.current = setTimeout(() => {
      setDisplaySteps(steps);
      lastUpdateRef.current = Date.now();
      pendingRef.current = null;
    }, delay);

    return () => {
      if (pendingRef.current) clearTimeout(pendingRef.current);
    };
  }, [steps]);

  return displaySteps;
}

// -- Component --

export function ProgressRail({ steps, isStreaming, onStop }: ProgressRailProps) {
  const debouncedSteps = useDebouncedSteps(steps);

  // Derive the active phase label for the aria-live announcement
  const activeStep = debouncedSteps.find((s) => s.status === 'active');
  const liveAnnouncement = activeStep
    ? `${activeStep.label}: in progress`
    : debouncedSteps.every((s) => s.status === 'completed' || s.status === 'skipped')
      ? 'All phases complete'
      : '';

  if (!isStreaming || debouncedSteps.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="progress-rail"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="sticky top-0 z-20 backdrop-blur-sm border-b px-3 py-2.5 bg-[#fafaf9]/95 dark:bg-[#0a0a0a]/95 border-stone-200 dark:border-white/5"
        role="progressbar"
        aria-label="Agent progress"
      >
        {/* Screen reader live region for phase transitions */}
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {liveAnnouncement}
        </div>

        <div className="flex items-center justify-between">
          {/* Phase rail */}
          <div className="flex items-center flex-1 min-w-0">
            {debouncedSteps.map((step, index) => (
              <React.Fragment key={step.railPhase}>
                {/* Phase step */}
                <div
                  className="flex flex-col items-center gap-1 shrink-0"
                  aria-current={step.status === 'active' ? 'step' : undefined}
                >
                  <div className={getIndicatorClasses(step.status)}>
                    <IndicatorIcon status={step.status} />
                  </div>
                  <span className={`${getLabelClasses(step.status)} ${step.status === 'active' ? 'animate-pulse' : ''}`}>{step.label}</span>
                  {step.status === 'completed' && step.summary && (
                    <span className="text-[10px] text-stone-500 dark:text-stone-500 truncate max-w-[80px]">
                      {step.summary}
                    </span>
                  )}
                  {step.status === 'error' && step.error && (
                    <span className="text-[10px] text-red-500 dark:text-red-400 truncate max-w-[100px]">
                      {step.error.message}
                    </span>
                  )}
                </div>
                {/* Connecting line */}
                {index < debouncedSteps.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-1 self-start mt-3 ${getLineClasses(step.status, debouncedSteps[index + 1].status)}`}
                  />
                )}
              </React.Fragment>
            ))}
          </div>

          {/* Stop button */}
          {onStop && (
            <button
              type="button"
              onClick={onStop}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-red-400 bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 transition-colors shrink-0 ml-3 focus-visible:ring-2 focus-visible:ring-red-500/50 focus-visible:outline-none"
              aria-label="Stop generation"
            >
              <Square className="h-3 w-3 fill-current" />
              Stop
            </button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
