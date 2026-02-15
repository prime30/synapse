'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Edit3, X, ChevronRight } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

export interface PlanStep {
  number: number;
  /** Step description (legacy field used by parsePlanSteps). */
  description?: string;
  /** Step text (used by tool-based plan cards). Fallback to description. */
  text?: string;
  complexity?: 'simple' | 'moderate' | 'complex';
  files?: string[];
}

interface PlanApprovalModalProps {
  /** The plan steps extracted from the AI response */
  steps: PlanStep[];
  /** Whether the modal is visible */
  isOpen: boolean;
  /** Called when user approves the plan */
  onApprove: (steps: PlanStep[]) => void;
  /** Called when user wants to modify (returns to chat with modification request) */
  onModify: (feedback: string) => void;
  /** Called when user cancels the plan */
  onCancel: () => void;
}

// ── Complexity keyword map ───────────────────────────────────────────────────

const COMPLEXITY_KEYWORDS: Record<string, PlanStep['complexity']> = {
  trivial: 'simple',
  simple: 'simple',
  easy: 'simple',
  straightforward: 'simple',
  moderate: 'moderate',
  medium: 'moderate',
  complex: 'complex',
  difficult: 'complex',
  hard: 'complex',
  advanced: 'complex',
};

// ── parsePlanSteps ───────────────────────────────────────────────────────────

/**
 * Parse numbered steps from AI response text.
 *
 * Supported formats:
 *  - "1. Step text"
 *  - "1) Step text"
 *  - "Step 1: Step text"
 *
 * Detects complexity hints from keywords in the step text.
 */
export function parsePlanSteps(text: string): PlanStep[] {
  const steps: PlanStep[] = [];

  // Match "1. text", "1) text", or "Step 1: text"
  const stepRegex = /(?:^|\n)\s*(?:(?:(\d+)[.)]\s+)|(?:[Ss]tep\s+(\d+)[:\s]+))(.+)/g;
  let match: RegExpExecArray | null;

  while ((match = stepRegex.exec(text)) !== null) {
    const number = parseInt(match[1] || match[2], 10);
    const description = match[3].trim();

    // Detect complexity from keywords
    const lowerDesc = description.toLowerCase();
    let complexity: PlanStep['complexity'] | undefined;

    for (const [keyword, level] of Object.entries(COMPLEXITY_KEYWORDS)) {
      if (lowerDesc.includes(keyword)) {
        complexity = level;
        break;
      }
    }

    steps.push({ number, description, complexity });
  }

  return steps;
}

// ── Complexity badge ─────────────────────────────────────────────────────────

const complexityStyles: Record<NonNullable<PlanStep['complexity']>, string> = {
  simple: 'bg-green-900/50 text-green-400 border-green-700/50',
  moderate: 'bg-amber-900/50 text-amber-400 border-amber-700/50',
  complex: 'bg-red-900/50 text-red-400 border-red-700/50',
};

function ComplexityBadge({ complexity }: { complexity: NonNullable<PlanStep['complexity']> }) {
  return (
    <span
      className={`ml-2 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium border ${complexityStyles[complexity]}`}
    >
      {complexity}
    </span>
  );
}

// ── Step row ─────────────────────────────────────────────────────────────────

interface StepRowProps {
  step: PlanStep;
  checked: boolean;
  onToggle: () => void;
}

function StepRow({ step, checked, onToggle }: StepRowProps) {
  return (
    <label
      className="flex items-start gap-2.5 rounded-lg border ide-border-subtle ide-surface-inset px-3 py-2.5 cursor-pointer ide-hover transition-colors"
    >
      {/* Checkbox */}
      <span className="mt-0.5 flex-shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="sr-only"
        />
        <span
          className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
            checked
              ? 'border-sky-500 bg-sky-500 dark:bg-sky-600 text-white'
              : 'ide-border ide-surface text-transparent'
          }`}
        >
          <Check size={10} strokeWidth={3} />
        </span>
      </span>

      {/* Step number */}
      <span className="flex-shrink-0 text-xs font-mono ide-text-muted mt-0.5 w-5 text-right">
        {step.number}.
      </span>

      {/* Description + complexity */}
      <span className="flex-1 text-xs ide-text-2 leading-relaxed">
        {step.description ?? step.text}
        {step.complexity && <ComplexityBadge complexity={step.complexity} />}
      </span>
    </label>
  );
}

// ── PlanApprovalModal ────────────────────────────────────────────────────────

export function PlanApprovalModal({
  steps,
  isOpen,
  onApprove,
  onModify,
  onCancel,
}: PlanApprovalModalProps) {
  const [checkedSteps, setCheckedSteps] = useState<Set<number>>(() =>
    new Set(steps.map((s) => s.number)),
  );
  const [showModifyInput, setShowModifyInput] = useState(false);
  const [modifyFeedback, setModifyFeedback] = useState('');

  // Reset checked state when steps change
  React.useEffect(() => {
    setCheckedSteps(new Set(steps.map((s) => s.number)));
    setShowModifyInput(false);
    setModifyFeedback('');
  }, [steps]);

  const toggleStep = (num: number) => {
    setCheckedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(num)) {
        next.delete(num);
      } else {
        next.add(num);
      }
      return next;
    });
  };

  const handleApprove = () => {
    const approved = steps.filter((s) => checkedSteps.has(s.number));
    onApprove(approved);
  };

  const handleModifySubmit = () => {
    if (modifyFeedback.trim()) {
      onModify(modifyFeedback.trim());
      setShowModifyInput(false);
      setModifyFeedback('');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 z-40 ide-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onCancel}
          />

          {/* Panel */}
          <motion.div
            className="absolute inset-x-0 bottom-0 z-50 flex flex-col rounded-t-xl border-t ide-border ide-surface shadow-2xl"
            style={{ maxHeight: '80%' }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b ide-border-subtle px-4 py-2.5 flex-shrink-0">
              <div className="flex items-center gap-2">
                <ChevronRight size={14} className="text-sky-500 dark:text-sky-400" />
                <span className="text-xs font-semibold ide-text-2">
                  AI Plan &mdash; {steps.length} step{steps.length !== 1 ? 's' : ''}
                </span>
              </div>
              <button
                type="button"
                onClick={onCancel}
                className="rounded p-1 ide-text-3 ide-hover hover:ide-text-2 transition-colors"
                aria-label="Close plan"
              >
                <X size={14} />
              </button>
            </div>

            {/* Steps list */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
              {steps.map((step) => (
                <StepRow
                  key={step.number}
                  step={step}
                  checked={checkedSteps.has(step.number)}
                  onToggle={() => toggleStep(step.number)}
                />
              ))}
            </div>

            {/* Modify feedback input */}
            <AnimatePresence>
              {showModifyInput && (
                <motion.div
                  className="border-t ide-border-subtle px-4 py-3"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <textarea
                    value={modifyFeedback}
                    onChange={(e) => setModifyFeedback(e.target.value)}
                    placeholder="Describe how to modify the plan..."
                    className="w-full resize-none rounded-lg border ide-border ide-surface-input px-3 py-2 text-xs ide-text placeholder-ide-text-muted focus:border-sky-500 dark:focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-500/30"
                    rows={3}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        handleModifySubmit();
                      }
                    }}
                  />
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowModifyInput(false)}
                      className="rounded px-2.5 py-1 text-xs ide-text-muted ide-hover hover:ide-text-2 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleModifySubmit}
                      disabled={!modifyFeedback.trim()}
                      className="rounded bg-sky-500 px-3 py-1 text-xs font-medium text-white hover:bg-sky-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Send Feedback
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 border-t ide-border-subtle px-4 py-2.5 flex-shrink-0">
              <button
                type="button"
                onClick={onCancel}
                className="rounded px-3 py-1.5 text-xs font-medium ide-text-muted ide-hover hover:ide-text-2 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setShowModifyInput((v) => !v)}
                className="flex items-center gap-1.5 rounded bg-sky-500/20 dark:bg-sky-500/20 px-3 py-1.5 text-xs font-medium text-sky-600 dark:text-sky-400 hover:bg-sky-500/30 transition-colors"
              >
                <Edit3 size={12} />
                Modify
              </button>
              <button
                type="button"
                onClick={handleApprove}
                disabled={checkedSteps.size === 0}
                className="flex items-center gap-1.5 rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Check size={12} />
                Approve Plan
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
