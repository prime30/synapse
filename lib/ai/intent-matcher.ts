/**
 * Intent Matcher — matches incoming action-stream events against
 * workflow patterns and computes remaining steps as a checkbox tree.
 *
 * Pure functions, no React dependencies.
 * @module lib/ai/intent-matcher
 */

import type { FileAction } from './action-stream';
import type {
  WorkflowMatch,
  WorkflowContext,
  WorkflowStep,
  WorkflowPatternDef,
} from './workflow-patterns';
import { WORKFLOW_PATTERNS } from './workflow-patterns';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of running the intent matcher on an action. */
export interface MatchResult {
  /** All matched workflow patterns, sorted by confidence. */
  matches: WorkflowMatch[];
  /** The highest-confidence match, or null. */
  topMatch: WorkflowMatch | null;
}

/** Options for the intent matcher. */
export interface IntentMatcherOptions {
  /** Minimum confidence to include a match. Default: 0.5. */
  minConfidence?: number;
  /** Maximum number of recent actions to consider for context. Default: 20. */
  maxRecentActions?: number;
  /** Time window (ms) for recent actions. Default: 120_000 (2 min). */
  recentWindowMs?: number;
}

// ---------------------------------------------------------------------------
// Matcher
// ---------------------------------------------------------------------------

/**
 * Match a new action against all workflow patterns.
 *
 * @param action - The new action that just occurred.
 * @param recentActions - Recent action history for context.
 * @param context - Project file context for step computation.
 * @param options - Matcher configuration.
 * @returns All matching patterns with computed steps.
 */
export function matchIntent(
  action: FileAction,
  recentActions: FileAction[],
  context: WorkflowContext,
  options: IntentMatcherOptions = {},
): MatchResult {
  const {
    minConfidence = 0.5,
    maxRecentActions = 20,
    recentWindowMs = 120_000,
  } = options;

  // Filter recent actions by time window and cap count
  const cutoff = Date.now() - recentWindowMs;
  const recent = recentActions
    .filter((a) => a.timestamp >= cutoff && a.id !== action.id)
    .slice(-maxRecentActions);

  const matches: WorkflowMatch[] = [];

  for (const pattern of WORKFLOW_PATTERNS) {
    if (!pattern.matches(action, recent)) continue;

    const steps = pattern.buildSteps(action, context);
    if (steps.length === 0) continue;

    // Compute confidence: base + bonuses for pattern specificity
    const confidence = computeConfidence(pattern, action, recent, steps);

    if (confidence < minConfidence) continue;

    matches.push({
      patternId: pattern.id,
      title: pattern.title(action),
      confidence,
      triggerAction: action,
      steps,
      computedAt: Date.now(),
    });
  }

  // Sort by confidence (highest first)
  matches.sort((a, b) => b.confidence - a.confidence);

  return {
    matches,
    topMatch: matches[0] ?? null,
  };
}

/**
 * Update step completion status based on subsequent actions.
 *
 * When the user performs an action that matches a pending step, mark it
 * as completed.
 *
 * @param match - The workflow match to update.
 * @param action - The new action that just occurred.
 * @returns Updated match (new object if changed, same reference if not).
 */
export function updateMatchProgress(
  match: WorkflowMatch,
  action: FileAction,
): WorkflowMatch {
  let changed = false;
  const updatedSteps = match.steps.map((step) => {
    if (step.completed) return step;

    // Check if this action completes this step
    if (doesActionCompleteStep(action, step)) {
      changed = true;
      return { ...step, completed: true };
    }

    return step;
  });

  if (!changed) return match;

  return {
    ...match,
    steps: updatedSteps,
  };
}

/**
 * Check if all steps in a workflow match are completed.
 */
export function isWorkflowComplete(match: WorkflowMatch): boolean {
  return match.steps.every((s) => s.completed);
}

/**
 * Get the pending (uncompleted) steps from a workflow match.
 */
export function getPendingSteps(match: WorkflowMatch): WorkflowStep[] {
  return match.steps.filter((s) => !s.completed);
}

/**
 * Get a summary of the workflow progress.
 */
export function getProgressSummary(match: WorkflowMatch): {
  total: number;
  completed: number;
  pending: number;
  percentage: number;
} {
  const total = match.steps.length;
  const completed = match.steps.filter((s) => s.completed).length;
  const pending = total - completed;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return { total, completed, pending, percentage };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Compute the confidence score for a pattern match.
 *
 * Factors:
 * - Base confidence from pattern definition
 * - Number of steps (more steps = more complete workflow = higher value)
 * - Recency of trigger (very recent actions get a small boost)
 * - Supporting evidence from recent actions
 */
function computeConfidence(
  pattern: WorkflowPatternDef,
  action: FileAction,
  recentActions: FileAction[],
  steps: WorkflowStep[],
): number {
  let confidence = pattern.baseConfidence;

  // Bonus for having concrete steps (capped at +0.1)
  confidence += Math.min(0.1, steps.length * 0.02);

  // Small boost for patterns with supporting evidence
  const supportingActions = recentActions.filter((a) => {
    // For rename propagation: recent edits to the same file boost confidence
    if (pattern.id === 'rename-propagation') {
      return a.type === 'edit' && a.fileId === action.fileId;
    }
    // For section creation: recent schema edits boost confidence
    if (pattern.id === 'section-creation') {
      return a.changeType === 'schema';
    }
    // For component extraction: recent section edits
    if (pattern.id === 'component-extraction') {
      const path = a.filePath ?? a.fileName;
      return a.type === 'edit' && path.includes('sections/');
    }
    // For locale sync: recent locale edits
    if (pattern.id === 'locale-sync') {
      return a.changeType === 'locale';
    }
    return false;
  });

  confidence += Math.min(0.1, supportingActions.length * 0.03);

  // Cap at 1.0
  return Math.min(1.0, Math.round(confidence * 100) / 100);
}

/**
 * Check if an action completes a specific workflow step.
 */
function doesActionCompleteStep(action: FileAction, step: WorkflowStep): boolean {
  // Check by target file match
  if (step.targetFiles && step.targetFiles.length > 0) {
    const actionPath = action.filePath ?? action.fileName;
    const matchesTarget = step.targetFiles.some(
      (f) => f === actionPath || f === action.fileName,
    );

    if (!matchesTarget) return false;

    // Check action type compatibility
    switch (step.actionType) {
      case 'create':
        return action.type === 'create';
      case 'edit-reference':
        return action.type === 'edit' && (action.changeType === 'reference' || action.changeType === 'content');
      case 'edit-schema':
        return action.type === 'edit' && action.changeType === 'schema';
      case 'edit-locale':
        return action.type === 'edit' && (action.changeType === 'locale' || action.changeType === 'content');
      case 'rename':
        return action.type === 'rename';
      case 'delete':
        return action.type === 'delete';
      case 'edit':
        return action.type === 'edit';
      default:
        return false;
    }
  }

  return false;
}
