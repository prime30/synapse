'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { RailStep, RailPhaseStatus } from '@/lib/agents/phase-mapping';

// -- Constants --

/** Minimum time a phase must be visible before transitioning (prevents flicker). */
const MIN_PHASE_DISPLAY_MS = 500;

// -- Props --

interface ProgressRailProps {
  steps: RailStep[];
  isStreaming: boolean;
}

// -- Indicator helpers --

function getIndicatorClasses(status: RailPhaseStatus): string {
  const base = 'flex items-center justify-center w-4 h-4 rounded-full border shrink-0 transition-colors';
  switch (status) {
    case 'active':
      return `${base} bg-sky-500 dark:bg-sky-400 border-sky-500 dark:border-sky-400 text-white`;
    case 'completed':
      return `${base} bg-[oklch(0.745_0.189_148)] border-[oklch(0.745_0.189_148)] text-white`;
    case 'error':
      return `${base} bg-red-500 dark:bg-red-400 border-red-500 dark:border-red-400 text-white`;
    case 'skipped':
      return `${base} bg-stone-200 dark:bg-[#1e1e1e] border-stone-300 dark:border-white/20 text-stone-500 dark:text-[#636059]`;
    case 'pending':
    default:
      return `${base} bg-stone-100 dark:bg-white/5 border-stone-300 dark:border-white/10 text-stone-400 dark:text-[#4a4a4a]`;
  }
}

function IndicatorIcon({ status }: { status: RailPhaseStatus }) {
  switch (status) {
    case 'active':
      return <span className="h-2.5 w-2.5 rounded-full bg-current opacity-80 inline-block" aria-hidden />;
    case 'completed':
      return (
        <svg className="h-2.5 w-2.5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      );
    case 'error':
      return (
        <svg className="h-2.5 w-2.5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      );
    case 'skipped':
      return (
        <svg className="h-2.5 w-2.5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
        </svg>
      );
    case 'pending':
    default:
      return <span className="w-1.5 h-1.5 rounded-full bg-current opacity-30" />;
  }
}

function getLabelClasses(status: RailPhaseStatus): string {
  const base = 'text-[10px] font-medium whitespace-nowrap';
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
      return `${base} text-stone-400 dark:text-[#636059]`;
  }
}

function getLineClasses(leftStatus: RailPhaseStatus, rightStatus: RailPhaseStatus): string {
  if (leftStatus === 'completed' && rightStatus === 'completed') {
    return 'bg-[oklch(0.745_0.189_148)]';
  }
  if (leftStatus === 'completed' && rightStatus === 'active') {
    return 'bg-gradient-to-r from-[oklch(0.745_0.189_148)] to-stone-200 dark:to-white/10';
  }
  if (leftStatus === 'completed') {
    return 'bg-[oklch(0.745_0.189_148)]';
  }
  return 'bg-stone-200 dark:bg-[#1e1e1e]';
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

export function ProgressRail({ steps, isStreaming }: ProgressRailProps) {
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
        className="px-2.5 pb-1 pt-0.5"
        role="progressbar"
        aria-label="Agent progress"
      >
        {/* Screen reader live region for phase transitions */}
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {liveAnnouncement}
        </div>

        <div className="flex items-center">
          {/* Phase rail */}
          <div className="flex items-center flex-1 min-w-0">
            {debouncedSteps.map((step, index) => (
              <React.Fragment key={step.railPhase}>
                {/* Phase step */}
                <div
                  className="flex items-center gap-1 shrink-0"
                  aria-current={step.status === 'active' ? 'step' : undefined}
                >
                  <div className={getIndicatorClasses(step.status)}>
                    <IndicatorIcon status={step.status} />
                  </div>
                  <span className={`${getLabelClasses(step.status)} ${step.status === 'active' ? 'animate-pulse' : ''}`}>{step.label}</span>
                </div>
                {/* Connecting line */}
                {index < debouncedSteps.length - 1 && (
                  <div
                    className={`flex-1 h-px mx-1 ${getLineClasses(step.status, debouncedSteps[index + 1].status)}`}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
