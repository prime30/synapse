/**
 * Phase Mapping - maps coordinator ThinkingEvent phases to high-level rail phases.
 *
 * The rail is dynamic: it renders only the phases that apply to the current
 * execution mode (orchestrated, solo, plan-only). Ask mode has no rail.
 */

import type { ThinkingStep } from '@/components/ai-sidebar/ThinkingBlock';

// -- Rail Phase Types --

export type RailPhase =
  | 'understanding'
  | 'planning'
  | 'executing'
  | 'reviewing'
  | 'complete';

export type RailPhaseStatus =
  | 'pending'
  | 'active'
  | 'completed'
  | 'error'
  | 'skipped';

export type SubPhase =
  // Understanding
  | 'analyzing_files'
  | 'building_context'
  | 'reasoning'
  | 'exploring'
  // Planning
  | 'creating_delegations'
  | 'assessing_scope'
  // Executing
  | 'specialist_liquid'
  | 'specialist_css'
  | 'specialist_javascript'
  | 'specialist_json'
  | 'general_subagent'
  | 'coordinating_changes'
  | 'fixing_errors'
  | 'change_ready'
  // Reviewing
  | 'running_review'
  | 'validating_syntax'
  | 'checking_consistency'
  // Complete
  | 'persisting'
  | 'finalizing';

export type ExecutionMode = 'orchestrated' | 'solo' | 'plan' | 'general';

// -- Rail Step --

export interface RailStep {
  railPhase: RailPhase;
  status: RailPhaseStatus;
  label: string;
  summary?: string;
  startedAt?: number;
  completedAt?: number;
  error?: { message: string; recoverable: boolean };
}

// -- Human-readable labels --

export const RAIL_PHASE_LABELS: Record<RailPhase, string> = {
  understanding: 'Understanding',
  planning: 'Planning',
  executing: 'Executing',
  reviewing: 'Reviewing',
  complete: 'Complete',
};

// -- Phase configuration per mode --

const MODE_PHASES: Record<ExecutionMode, RailPhase[]> = {
  orchestrated: ['understanding', 'planning', 'executing', 'reviewing', 'complete'],
  general: ['understanding', 'planning', 'executing', 'reviewing', 'complete'],
  solo: ['understanding', 'complete'],
  plan: ['understanding', 'planning', 'complete'],
};

/**
 * Returns the ordered list of rail phases for a given execution mode.
 */
export function getRailPhases(mode: ExecutionMode): RailPhase[] {
  return MODE_PHASES[mode] ?? MODE_PHASES.orchestrated;
}

// -- Coordinator phase to rail phase mapping --

type CoordinatorPhase = ThinkingStep['phase'];

const PHASE_MAP: Record<CoordinatorPhase, RailPhase> = {
  analyzing: 'understanding',
  reasoning: 'understanding',
  planning: 'planning',
  executing: 'executing',
  change_ready: 'executing',
  fixing: 'executing',
  reviewing: 'reviewing',
  validating: 'reviewing',
  clarification: 'understanding',
  budget_warning: 'understanding',
  complete: 'complete',
};

/**
 * Maps a coordinator ThinkingEvent phase string to the corresponding rail phase.
 */
export function mapCoordinatorPhase(phase: string): RailPhase {
  return PHASE_MAP[phase as CoordinatorPhase] ?? 'understanding';
}

// -- Derive rail steps from thinking steps --

/**
 * Derives the current rail step state from an array of ThinkingStep objects.
 *
 * Groups steps by their rail phase, determines each phase's status (pending,
 * active, completed, error), and attaches summary text for completed phases.
 *
 * Error detection: if the most recent step has error metadata or a budget_warning
 * phase with an error-like label, the currently active rail phase gets error status.
 */
export function deriveRailSteps(
  steps: ThinkingStep[],
  mode: ExecutionMode,
  /** Optional: marks the currently active rail phase as errored with this message. */
  errorMessage?: string,
): RailStep[] {
  const phases = getRailPhases(mode);

  // Group steps by rail phase
  const grouped = new Map<RailPhase, ThinkingStep[]>();
  for (const step of steps) {
    const rail = step.railPhase ?? mapCoordinatorPhase(step.phase);
    if (!grouped.has(rail)) grouped.set(rail, []);
    grouped.get(rail)!.push(step);
  }

  // Find the latest active (non-done, non-complete) step's rail phase
  const latestActive = [...steps].reverse().find(
    (s) => !s.done && s.phase !== 'complete',
  );
  const activeRailPhase = latestActive
    ? (latestActive.railPhase ?? mapCoordinatorPhase(latestActive.phase))
    : null;

  // Check if everything is complete
  const hasComplete = steps.some((s) => s.phase === 'complete');

  // Detect error conditions: external error message or error metadata on steps
  const hasError = !!errorMessage;
  const errorPhase = hasError ? activeRailPhase : null;

  return phases.map((railPhase): RailStep => {
    const phaseSteps = grouped.get(railPhase) ?? [];

    let status: RailPhaseStatus;
    let summary: string | undefined;
    let startedAt: number | undefined;
    let completedAt: number | undefined;
    let error: RailStep['error'];

    // Error overlay: if this phase has an external error, show error state
    if (railPhase === errorPhase && hasError) {
      status = 'error';
      error = { message: errorMessage!, recoverable: true };
      startedAt = phaseSteps[0]?.startedAt;
    } else if (phaseSteps.length === 0) {
      // No steps emitted for this phase yet
      if (hasComplete && railPhase !== 'complete') {
        status = 'skipped';
      } else {
        status = 'pending';
      }
    } else {
      startedAt = phaseSteps[0]?.startedAt;
      const allDone = phaseSteps.every((s) => s.done || s.phase === 'complete');

      if (railPhase === activeRailPhase && !hasComplete) {
        status = 'active';
      } else if (allDone || (hasComplete && railPhase !== 'complete')) {
        status = 'completed';
        completedAt = phaseSteps[phaseSteps.length - 1]?.startedAt;
        summary = phaseSteps
          .map((s) => s.summary)
          .filter(Boolean)
          .pop();
      } else if (railPhase === 'complete' && hasComplete) {
        status = 'completed';
        summary = phaseSteps.find((s) => s.phase === 'complete')?.summary;
      } else {
        status = 'pending';
      }
    }

    return {
      railPhase,
      status,
      label: RAIL_PHASE_LABELS[railPhase],
      summary,
      startedAt,
      completedAt,
      error,
    };
  });
}
