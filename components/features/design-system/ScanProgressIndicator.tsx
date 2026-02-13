'use client';

import type { ScanProgress, ScanPhase } from '@/hooks/useDesignTokens';

/* ------------------------------------------------------------------ */
/*  Phase configuration                                                */
/* ------------------------------------------------------------------ */

interface PhaseConfig {
  phase: ScanPhase;
  label: string;
}

const PHASES: PhaseConfig[] = [
  { phase: 'loading', label: 'Loading files' },
  { phase: 'reading', label: 'Reading file contents' },
  { phase: 'extracting', label: 'Extracting tokens' },
  { phase: 'inferring', label: 'Analyzing patterns' },
  { phase: 'detecting', label: 'Detecting components' },
  { phase: 'persisting', label: 'Saving results' },
];

const PHASE_ORDER: ScanPhase[] = [
  'loading',
  'reading',
  'extracting',
  'inferring',
  'detecting',
  'persisting',
  'complete',
];

function phaseIndex(phase: ScanPhase): number {
  return PHASE_ORDER.indexOf(phase);
}

/* ------------------------------------------------------------------ */
/*  Icons                                                              */
/* ------------------------------------------------------------------ */

function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2.5}
      stroke="currentColor"
      className="w-3 h-3"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Step detail text                                                   */
/* ------------------------------------------------------------------ */

function StepDetail({ progress, stepPhase }: { progress: ScanProgress; stepPhase: ScanPhase }) {
  if (progress.phase !== stepPhase) return null;

  // Show current/total for phases that track it
  if (progress.current != null && progress.total != null) {
    const detail = `${progress.current}/${progress.total}`;
    const tokensLabel =
      progress.tokensFound != null && progress.tokensFound > 0
        ? ` · ${progress.tokensFound} found`
        : '';
    return (
      <span className="text-[10px] ide-text-muted tabular-nums ml-auto whitespace-nowrap">
        {detail}{tokensLabel}
      </span>
    );
  }

  if (progress.tokensFound != null && progress.tokensFound > 0) {
    return (
      <span className="text-[10px] ide-text-muted tabular-nums ml-auto">
        {progress.tokensFound} found
      </span>
    );
  }

  return null;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export interface ScanProgressIndicatorProps {
  progress: ScanProgress;
  onCancel?: () => void;
  /** Compact variant for sidebar — just bar + label, no step list */
  compact?: boolean;
}

export function ScanProgressIndicator({
  progress,
  onCancel,
  compact = false,
}: ScanProgressIndicatorProps) {
  const currentIdx = phaseIndex(progress.phase);

  // ── Compact variant ─────────────────────────────────────────────────
  if (compact) {
    return (
      <div
        className="px-3 py-2 space-y-1.5"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] ide-text-2 truncate">{progress.message}</p>
          {progress.current != null && progress.total != null && (
            <span className="text-[10px] ide-text-muted tabular-nums whitespace-nowrap">
              {progress.current}/{progress.total}
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div
          className="h-1.5 rounded-full ide-surface-inset overflow-hidden"
          role="progressbar"
          aria-valuenow={progress.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Scanning: ${progress.phase} — ${progress.percent}% complete`}
        >
          <div
            className="h-full rounded-full bg-sky-500 transition-all duration-300 ease-out"
            style={{ width: `${progress.percent}%` }}
          />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[10px] ide-text-muted tabular-nums">{progress.percent}%</span>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="text-[10px] ide-text-muted hover:ide-text-2 underline transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Full variant ────────────────────────────────────────────────────
  return (
    <div
      className="p-5 rounded-lg border ide-border ide-surface-panel max-w-md"
      role="status"
      aria-live="polite"
    >
      {/* Title */}
      <p className="text-sm font-medium ide-text mb-4">Scanning your theme...</p>

      {/* Progress bar */}
      <div className="mb-4">
        <div
          className="h-2 rounded-full ide-surface-inset overflow-hidden"
          role="progressbar"
          aria-valuenow={progress.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Scanning: ${progress.phase} — ${progress.percent}% complete`}
        >
          <div
            className="h-full rounded-full bg-sky-500 transition-all duration-300 ease-out"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[11px] ide-text-2 truncate max-w-[70%]">{progress.message}</span>
          <span className="text-[11px] ide-text-muted tabular-nums">{progress.percent}%</span>
        </div>
      </div>

      {/* Phase step list */}
      <div className="space-y-2 mb-4">
        {PHASES.map((step) => {
          const stepIdx = phaseIndex(step.phase);
          const isComplete = currentIdx > stepIdx;
          const isActive = progress.phase === step.phase;
          const isPending = currentIdx < stepIdx;

          return (
            <div key={step.phase} className="flex items-center gap-2.5">
              {/* Step dot / icon */}
              {isComplete && (
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-500 dark:text-emerald-400 flex-shrink-0">
                  <CheckIcon />
                </div>
              )}
              {isActive && (
                <div className="w-5 h-5 rounded-full bg-sky-500 motion-safe:animate-pulse flex-shrink-0" />
              )}
              {isPending && (
                <div className="w-5 h-5 rounded-full ide-surface-inset border ide-border flex-shrink-0" />
              )}

              {/* Label */}
              <span
                className={`text-xs ${
                  isComplete
                    ? 'ide-text-2'
                    : isActive
                      ? 'ide-text font-medium'
                      : 'ide-text-muted'
                }`}
              >
                {step.label}
              </span>

              {/* Detail (counter) */}
              <StepDetail progress={progress} stepPhase={step.phase} />
            </div>
          );
        })}
      </div>

      {/* Cancel */}
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="text-xs ide-text-muted hover:ide-text-2 underline transition-colors"
        >
          Cancel
        </button>
      )}
    </div>
  );
}
