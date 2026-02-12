'use client';

import { useCallback, useMemo } from 'react';
import type { WorkflowMatch, WorkflowStep } from '@/lib/ai/workflow-patterns';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IntentCompletionPanelProps {
  /** The active workflow match to display. */
  match: WorkflowMatch;
  /** Progress: { total, completed, pending, percentage }. */
  progress: { total: number; completed: number; pending: number; percentage: number } | null;
  /** Toggle a step's completion. */
  onToggleStep: (stepId: string) => void;
  /** Apply a single step. */
  onApplyStep: (stepId: string) => void;
  /** Apply all pending steps. */
  onApplyAll: () => void;
  /** Open the preview/diff modal for all pending steps. */
  onPreviewAll: () => void;
  /** Dismiss the panel. */
  onDismiss: () => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Pattern icons
// ---------------------------------------------------------------------------

const PATTERN_ICONS: Record<string, string> = {
  'rename-propagation': 'A',
  'section-creation': '+',
  'component-extraction': '{...}',
  'locale-sync': 'T',
};

// ---------------------------------------------------------------------------
// StepItem sub-component
// ---------------------------------------------------------------------------

function StepItem({
  step,
  onToggle,
  onApply,
}: {
  step: WorkflowStep;
  onToggle: () => void;
  onApply: () => void;
}) {
  return (
    <li className="flex items-start gap-2 py-1 group">
      {/* Checkbox */}
      <button
        type="button"
        onClick={onToggle}
        className={`
          mt-0.5 flex-shrink-0 w-4 h-4 rounded border transition-colors duration-150
          ${
            step.completed
              ? 'bg-green-500/20 border-green-500/40 text-green-400'
              : 'border-gray-600 hover:border-gray-400 text-transparent'
          }
          flex items-center justify-center
        `}
        aria-label={step.completed ? `Uncheck: ${step.label}` : `Check: ${step.label}`}
      >
        {step.completed && (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      {/* Label */}
      <span
        className={`flex-1 text-xs leading-relaxed ${
          step.completed ? 'text-gray-500 line-through' : 'text-gray-300'
        }`}
      >
        {step.label}
      </span>

      {/* Apply button (shown on hover for pending steps) */}
      {!step.completed && (
        <button
          type="button"
          onClick={onApply}
          className="
            flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity
            rounded px-1.5 py-0.5 text-[10px] font-medium
            text-blue-400 hover:bg-blue-500/10 border border-blue-500/20
          "
          aria-label={`Apply: ${step.label}`}
        >
          Apply
        </button>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * IntentCompletionPanel — displays a checkbox tree of remaining workflow
 * steps with "Preview All" and "Apply All" buttons.
 *
 * Renders inside the AI sidebar when a workflow pattern is matched.
 */
export function IntentCompletionPanel({
  match,
  progress,
  onToggleStep,
  onApplyStep,
  onApplyAll,
  onPreviewAll,
  onDismiss,
  className = '',
}: IntentCompletionPanelProps) {
  const patternIcon = PATTERN_ICONS[match.patternId] ?? '?';

  const handleToggle = useCallback(
    (stepId: string) => () => onToggleStep(stepId),
    [onToggleStep],
  );

  const handleApply = useCallback(
    (stepId: string) => () => onApplyStep(stepId),
    [onApplyStep],
  );

  const pendingCount = useMemo(
    () => match.steps.filter((s) => !s.completed).length,
    [match.steps],
  );

  return (
    <div
      className={`
        flex flex-col border border-indigo-500/20 bg-indigo-500/5 rounded-lg
        mx-2 mb-2 overflow-hidden
        ${className}
      `}
      role="region"
      aria-label="Intent completion suggestions"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-indigo-500/10">
        <span
          className="flex-shrink-0 text-xs font-mono text-indigo-400 bg-indigo-500/10 rounded px-1.5 py-0.5"
          aria-hidden="true"
        >
          {patternIcon}
        </span>
        <span className="flex-1 text-xs font-medium text-gray-200 truncate min-w-0">
          {match.title}
        </span>
        <button
          type="button"
          onClick={onDismiss}
          className="flex-shrink-0 rounded p-0.5 text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
          aria-label="Dismiss intent completion"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Progress bar */}
      {progress && (
        <div className="px-3 pt-2">
          <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1">
            <span>{progress.completed}/{progress.total} steps</span>
            <span>{progress.percentage}%</span>
          </div>
          <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-300"
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
        </div>
      )}

      {/* Step list (checkbox tree) */}
      <ul className="px-3 py-2 space-y-0">
        {match.steps.map((step) => (
          <StepItem
            key={step.id}
            step={step}
            onToggle={handleToggle(step.id)}
            onApply={handleApply(step.id)}
          />
        ))}
      </ul>

      {/* Action buttons */}
      {pendingCount > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 border-t border-indigo-500/10">
          <button
            type="button"
            onClick={onPreviewAll}
            className="
              flex-1 rounded px-3 py-1.5 text-xs font-medium
              text-indigo-300 hover:bg-indigo-500/10
              border border-indigo-500/20 transition-colors
            "
          >
            Preview All
          </button>
          <button
            type="button"
            onClick={onApplyAll}
            className="
              flex-1 rounded px-3 py-1.5 text-xs font-medium
              text-white bg-indigo-600 hover:bg-indigo-500
              transition-colors
            "
          >
            Apply All ({pendingCount})
          </button>
        </div>
      )}
    </div>
  );
}
