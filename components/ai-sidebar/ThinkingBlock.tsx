'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ── Types ─────────────────────────────────────────────────────────────

export interface ThinkingStep {
  phase: 'analyzing' | 'planning' | 'executing' | 'reviewing' | 'complete';
  label: string;
  detail?: string;
  agent?: string;
  analysis?: string;
  summary?: string;
  /** Set automatically when the next step arrives or stream completes. */
  done?: boolean;
}

interface ThinkingBlockProps {
  steps: ThinkingStep[];
  isComplete: boolean;
  defaultExpanded?: boolean;
}

// ── Phase Icons ─────────────────────────────────────────────────────────

function PhaseIcon({ phase, done }: { phase: ThinkingStep['phase']; done?: boolean }) {
  if (done) {
    return (
      <svg className="h-3.5 w-3.5 text-green-500 dark:text-green-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
      </svg>
    );
  }

  // Spinner for active step
  if (phase !== 'complete') {
    return (
      <svg className="h-3.5 w-3.5 text-sky-500 dark:text-sky-400 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    );
  }

  // Phase-specific icon for 'complete'
  return (
    <svg className="h-3.5 w-3.5 text-green-500 dark:text-green-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
    </svg>
  );
}

const phaseSvg: Record<ThinkingStep['phase'], React.ReactNode> = {
  analyzing: (
    <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  planning: (
    <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    </svg>
  ),
  executing: (
    <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  reviewing: (
    <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  complete: (
    <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
};

function PhaseLabel({ phase }: { phase: ThinkingStep['phase'] }) {
  return <span className="opacity-60 mr-0.5 inline-flex">{phaseSvg[phase]}</span>;
}

// ── Agent badges ────────────────────────────────────────────────────────

const AGENT_BADGE_CLASSES: Record<string, string> = {
  project_manager: 'text-sky-600 dark:text-sky-400 border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-950',
  liquid: 'text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950',
  javascript: 'text-indigo-600 dark:text-indigo-400 border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950',
  css: 'text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950',
  json: 'text-purple-600 dark:text-purple-400 border-purple-300 dark:border-purple-700 bg-purple-50 dark:bg-purple-950',
  review: 'text-green-600 dark:text-green-400 border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950',
};

function getAgentBadgeClasses(agent: string): string {
  return AGENT_BADGE_CLASSES[agent] ?? 'text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-950';
}

// ── Component ───────────────────────────────────────────────────────────

export function ThinkingBlock({ steps, isComplete, defaultExpanded = true }: ThinkingBlockProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const wasCompleteRef = useRef(isComplete);
  const userInteractedRef = useRef(false);

  // Auto-collapse when thinking completes (4s delay; skip if user manually toggled)
  useEffect(() => {
    if (isComplete && !wasCompleteRef.current) {
      if (!userInteractedRef.current) {
        const timer = setTimeout(() => setExpanded(false), 4000);
        return () => clearTimeout(timer);
      }
    }
    wasCompleteRef.current = isComplete;
  }, [isComplete]);

  const handleToggle = () => {
    userInteractedRef.current = true;
    setExpanded((e) => !e);
  };

  if (steps.length === 0) return null;

  const completedCount = steps.filter((s) => s.done || s.phase === 'complete').length;
  const latestActiveStep = [...steps].reverse().find((s) => !s.done && s.phase !== 'complete');

  return (
    <div className="mb-2">
      {/* Collapsed header */}
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full items-center gap-1.5 rounded-lg ide-surface-inset border ide-border-subtle px-3 py-1.5 text-left transition-colors ide-hover"
      >
        {!isComplete && (
          <svg className="h-3 w-3 text-sky-500 dark:text-sky-400 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {isComplete && (
          <svg className="h-3 w-3 text-green-500 dark:text-green-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        )}
        <span className="text-xs ide-text-2 font-medium">
          {isComplete
            ? `Thinking (${steps.length} steps)`
            : `Thinking... (${completedCount}/${steps.length})`}
          {!isComplete && latestActiveStep?.agent && (
            <span className={`ml-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium border ${getAgentBadgeClasses(latestActiveStep.agent)}`}>
              {latestActiveStep.agent}
            </span>
          )}
        </span>
        <svg
          className={`ml-auto h-3 w-3 ide-text-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>

      {/* Expanded content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="mt-1 space-y-0.5 rounded-lg ide-surface-inset border ide-border-subtle px-3 py-2">
              {steps.map((step, i) => (
                <div key={`${step.phase}-${i}`} className="flex items-start gap-2 py-0.5">
                  <div className="mt-0.5">
                    <PhaseIcon phase={step.phase} done={step.done} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <PhaseLabel phase={step.phase} />
                      <span className={`text-xs font-medium ${step.done ? 'ide-text-muted' : 'ide-text'}`}>
                        {step.label}
                      </span>
                      {step.agent && (
                        <span className={`ml-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium border ${getAgentBadgeClasses(step.agent)}`}>
                          {step.agent}
                        </span>
                      )}
                    </div>
                    {step.detail && (
                      <p className="text-[11px] ide-text-3 truncate">{step.detail}</p>
                    )}
                    {/* "Next: ..." hint for active (not-done) step */}
                    {!step.done && step.phase !== 'complete' && (() => {
                      const nextPhase: Record<string, string> = {
                        analyzing: 'Planning changes',
                        planning: 'Executing changes',
                        executing: 'Reviewing result',
                        reviewing: 'Finishing up',
                      };
                      const hint = nextPhase[step.phase];
                      return hint ? (
                        <p className="text-[10px] ide-text-muted italic mt-0.5">Next: {hint}</p>
                      ) : null;
                    })()}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
