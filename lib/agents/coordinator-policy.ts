/**
 * Policy check functions extracted from the coordinator-v2 main loop.
 *
 * Each function reads LoopState and CoordinatorContext and returns a
 * PolicyAction describing what the coordinator should do next. The
 * coordinator applies the returned action (break, push messages,
 * update state) at the call site.
 */

import type { LoopState, CoordinatorContext, MutationFailure } from './coordinator-types';
import type { AIMessage } from '@/lib/ai/types';
import { buildMemoryAnchorFn } from './coordinator-helpers';
import { extractPromptMentionedFiles } from './coordinator-context';
import {
  FIRST_EDIT_TOOL_CALL_SLA,
  FIRST_EDIT_TOOL_CALL_ABORT,
  MAX_STUCK_RECOVERIES,
  CODE_ZERO_TOOL_STREAK_LIMIT,
  POST_EDIT_STAGNATION_THRESHOLD,
  POST_EDIT_TOOL_BUDGET_SOFT_CAP,
} from './coordinator-constants';

// ── PolicyAction type ────────────────────────────────────────────────────────

export type PolicyAction =
  | { action: 'continue'; stateUpdates?: Partial<LoopState> }
  | { action: 'break'; reason: string; stateUpdates?: Partial<LoopState> }
  | { action: 'nudge'; message: string; stateUpdates?: Partial<LoopState> }
  | { action: 'clarify'; message: string; options?: unknown[]; stateUpdates?: Partial<LoopState> }
  | { action: 'block_lookup'; reason: string; stateUpdates?: Partial<LoopState> };

// ── Snapshot types for per-iteration data ────────────────────────────────────

export interface PostEditSnapshot {
  addedChangesThisIteration: boolean;
  hadExecution: boolean;
  maxRethinks: number;
}

// ── 1. Edit SLA ──────────────────────────────────────────────────────────────

/**
 * First-edit SLA enforcement. If the agent has consumed too many tool calls
 * without ever attempting a mutation, nudge it to edit immediately or request
 * clarification.
 */
export function checkEditSLA(state: LoopState, ctx: CoordinatorContext): PolicyAction {
  if (ctx.intentMode !== 'code' || state.hasAttemptedEdit || state.totalToolCalls < FIRST_EDIT_TOOL_CALL_SLA) {
    return { action: 'continue' };
  }

  if (state.firstEditSlaNudges === 0) {
    const primaryTarget = ctx.currentScoutBrief?.suggestedEditOrder?.[0]
      ?? ctx.currentScoutBrief?.keyFiles?.[0]?.path
      ?? ctx.preloaded[0]?.fileName;

    return {
      action: 'nudge',
      message:
        `SYSTEM: Edit SLA reached (${state.totalToolCalls} tool calls without a mutation). ` +
        `Stop exploration now and make a direct edit using read_lines -> edit_lines on ${primaryTarget ?? 'the primary target file'}. ` +
        'Do not call additional lookup tools before the edit.',
      stateUpdates: {
        firstEditSlaNudges: 1,
        forceNoLookupUntilEdit: true,
      },
    };
  }

  if (state.totalToolCalls >= FIRST_EDIT_TOOL_CALL_ABORT) {
    return {
      action: 'clarify',
      message:
        `I still cannot safely mutate after ${state.totalToolCalls} tool calls. ` +
        'Please confirm the exact file/path and intended line-level change.',
      options: [
        { id: 'confirm-target', label: 'Confirm exact target file/path', recommended: true },
        { id: 'provide-before-after', label: 'Provide exact before/after snippet' },
      ],
      stateUpdates: {
        needsClarification: true,
        hasStructuredClarification: true,
      },
    };
  }

  return { action: 'continue' };
}

// ── 2. Stuck Detection ──────────────────────────────────────────────────────

/**
 * Stuck-loop detector integration. When the StuckDetector fires, either
 * abort (max recoveries) or truncate context and inject a recovery nudge.
 *
 * On recovery the returned stateUpdates.messages contains the full
 * replacement array — the caller must clear-and-push rather than
 * Object.assign for the messages field.
 */
export function checkStuckDetection(state: LoopState, ctx: CoordinatorContext): PolicyAction {
  if (state.iteration <= 0) return { action: 'continue' };

  const stuckResult = ctx.stuckDetector.detect();
  if (!stuckResult.isStuck) return { action: 'continue' };

  console.warn(
    `[V2-Stuck] Pattern "${stuckResult.pattern}" detected at iteration ${state.iteration}: ${stuckResult.details}`,
  );

  if (state.stuckRecoveryCount >= MAX_STUCK_RECOVERIES) {
    console.error(`[V2-Stuck] Max recoveries (${MAX_STUCK_RECOVERIES}) reached — aborting`);
    return { action: 'break', reason: `Max stuck recoveries (${MAX_STUCK_RECOVERIES}) reached` };
  }

  const anchor = buildMemoryAnchorFn({
    fileReadLog: state.fileReadLog,
    fileEditLog: state.fileEditLog,
    toolSequenceLog: state.toolSequenceLog,
    toolSummaryLog: state.toolSummaryLog,
    accumulatedChanges: state.accumulatedChanges,
    userRequest: ctx.userRequest,
  });

  const keepCount = 6;
  const systemMsg0 = state.messages[0];
  const contextMsg1 = state.messages.length > 1 ? state.messages[1] : undefined;
  const tail = state.messages.slice(-keepCount);

  const newMessages: AIMessage[] = [systemMsg0];
  if (contextMsg1) newMessages.push(contextMsg1);
  newMessages.push({ role: 'user', content: anchor } as AIMessage);
  newMessages.push(...tail);

  const stuckMsg =
    `SYSTEM: Stuck loop detected (${stuckResult.pattern}). Previous approach failed: ${stuckResult.details}. ` +
    'Try a DIFFERENT strategy — use different tools, different files, or different edit approach.';
  newMessages.push({ role: 'user', content: stuckMsg } as AIMessage);

  console.log(
    `[V2-Stuck] Recovery ${state.stuckRecoveryCount + 1}: truncated to ${newMessages.length} messages, injected anchor`,
  );

  return {
    action: 'nudge',
    message: stuckMsg,
    stateUpdates: {
      stuckRecoveryCount: state.stuckRecoveryCount + 1,
      failedMutationCount: 0,
      debugFixAttemptCount: 0,
      preEditLookupBlockedCount: 0,
      messages: newMessages,
    },
  };
}

// ── 3. Zero-Tool Forced ─────────────────────────────────────────────────────

/**
 * Handles consecutive iterations where the model produced no tool calls.
 *
 * The caller must update `state.zeroToolIterationStreak` before calling.
 *
 * Returns:
 * - `block_lookup` with reason `force_read_first_iteration` when the caller
 *   should force-read the primary file (async dispatch stays at call site).
 * - `clarify` when the streak exceeds the limit.
 * - `continue` otherwise.
 */
export function checkZeroToolForced(state: LoopState, ctx: CoordinatorContext): PolicyAction {
  if (
    ctx.intentMode === 'code' &&
    state.zeroToolIterationStreak === 1 &&
    state.totalToolCalls === 0 &&
    state.iteration <= 1
  ) {
    return {
      action: 'block_lookup',
      reason: 'force_read_first_iteration',
    };
  }

  if (ctx.intentMode === 'code' && state.zeroToolIterationStreak >= CODE_ZERO_TOOL_STREAK_LIMIT) {
    return {
      action: 'clarify',
      message:
        'I am pausing because no actionable tool calls were made in consecutive iterations. ' +
        'Please confirm the exact target file/region, or say "apply the previous plan now" to continue with direct edits.',
      options: [
        { id: 'confirm-target', label: 'Confirm exact file/path to edit', recommended: true },
        { id: 'apply-previous-plan', label: 'Apply previous plan directly' },
      ],
      stateUpdates: {
        needsClarification: true,
        hasStructuredClarification: true,
      },
    };
  }

  return { action: 'continue' };
}

// ── 4. Completion Validator ─────────────────────────────────────────────────

/**
 * Multi-layer completion check. If edits exist but haven't covered all
 * expected file types mentioned in the prompt, nudge continuation.
 */
export function checkCompletionValidator(state: LoopState, ctx: CoordinatorContext): PolicyAction {
  if (
    ctx.intentMode !== 'code' ||
    state.accumulatedChanges.length === 0 ||
    state.prematureStopNudges >= 2 ||
    state.iteration >= state.MAX_ITERATIONS - 2
  ) {
    return { action: 'continue' };
  }

  const expectedFiles = extractPromptMentionedFiles(ctx.userRequest, ctx.files);
  const editedFileNames = new Set(state.accumulatedChanges.map(c => c.fileName));
  const getExtType = (name: string): string => {
    if (name.endsWith('.liquid')) return 'liquid';
    if (name.endsWith('.css')) return 'css';
    if (name.endsWith('.js')) return 'js';
    if (name.endsWith('.json')) return 'json';
    return 'other';
  };
  const expectedTypes = new Set(expectedFiles.map(f => getExtType(f.fileName)));
  const editedTypes = new Set([...editedFileNames].map(getExtType));
  const missingTypes = [...expectedTypes].filter(t => !editedTypes.has(t));

  if (missingTypes.length > 0 && expectedTypes.size > editedTypes.size) {
    console.log(
      `[V2-CompletionValidator] Incomplete edit: edited [${[...editedTypes].join(',')}] ` +
      `but expected [${[...expectedTypes].join(',')}], missing [${missingTypes.join(',')}]`,
    );
    return {
      action: 'nudge',
      message:
        `SYSTEM: You have only edited ${[...editedTypes].join(', ')} files. ` +
        `The user also expects changes to ${missingTypes.join(', ')} files. ` +
        'Continue editing the remaining file types.',
      stateUpdates: {
        prematureStopNudges: state.prematureStopNudges + 1,
        fullText: '',
      },
    };
  }

  return { action: 'continue' };
}

// ── 5. Confirmation Gate ────────────────────────────────────────────────────

/**
 * Destructive-operation confirmation gate. Blocks push_to_shopify and
 * bulk deletes (≥3) until the user confirms.
 */
export function checkConfirmationGate(
  state: LoopState,
  _ctx: CoordinatorContext,
  pendingServerTools: { name: string; [key: string]: unknown }[],
): PolicyAction {
  if (pendingServerTools.length === 0 || state.needsClarification) {
    return { action: 'continue' };
  }

  const hasPushToShopify = pendingServerTools.some(t => t.name === 'push_to_shopify');
  const deleteCount = pendingServerTools.filter(t => t.name === 'delete_file').length;
  const needsConfirmation = hasPushToShopify || deleteCount >= 3;

  if (!needsConfirmation) return { action: 'continue' };

  const actionDesc = hasPushToShopify
    ? 'push changes to Shopify'
    : `delete ${deleteCount} files`;

  console.log(`[V2-ConfirmGate] Blocking destructive operation: ${actionDesc}`);

  return {
    action: 'clarify',
    message: `SYSTEM: Confirmation required before ${actionDesc}. Pausing for user approval.`,
    options: [
      { id: 'confirm', label: `Confirm ${actionDesc}`, recommended: true, actionType: 'apply_anyway' },
      { id: 'cancel', label: 'Cancel', actionType: 'cancel' },
    ],
    stateUpdates: {
      needsClarification: true,
      hasStructuredClarification: true,
    },
  };
}

// ── 6. Premature Stop ───────────────────────────────────────────────────────

/**
 * Premature stop nudge. If the model stops in code mode without producing
 * changes and we still have budget, inject a forceful continuation message.
 *
 * The caller should push the current assistant text (state.fullText) as a
 * turn before applying the nudge message, then clear fullText.
 */
export function checkPrematureStop(
  state: LoopState,
  ctx: CoordinatorContext,
  stopReason: string | undefined,
): PolicyAction {
  const canNudge =
    ctx.intentMode === 'code' &&
    state.accumulatedChanges.length === 0 &&
    !state.needsClarification &&
    state.prematureStopNudges < 2 &&
    state.iteration < state.MAX_ITERATIONS - 2 &&
    stopReason !== 'max_tokens';

  if (!canNudge) return { action: 'continue' };

  console.log(
    `[V2] Premature stop nudge #${state.prematureStopNudges + 1} — model stopped without changes, forcing continuation`,
  );

  const nudgeTools = ctx.preloaded.length > 0
    ? `Available files: ${ctx.preloaded.slice(0, 5).map(f => f.fileName || f.path).join(', ')}. ` +
      'Use read_lines to get exact content, then edit_lines to make changes.'
    : '';

  return {
    action: 'nudge',
    message:
      'You stopped without making any code changes. This is a CODE mode request — ' +
      'you MUST make the requested edit before finishing. Do NOT explain what you would do. ' +
      'Do NOT ask for permission. ACT NOW with your editing tools.\n\n' +
      'If search_replace failed, use read_lines to see the exact file content, ' +
      'then edit_lines with the correct line numbers.\n\n' +
      (nudgeTools ? nudgeTools + '\n\n' : '') +
      'Proceed immediately with the edit.',
    stateUpdates: {
      prematureStopNudges: state.prematureStopNudges + 1,
      fullText: '',
    },
  };
}

// ── 7. Read-Only Stagnation ─────────────────────────────────────────────────

/**
 * Read-only iteration guard. After consecutive read-only iterations
 * (configurable by strategy), nudge the agent to actually make edits.
 *
 * The caller must compute `onlyReadToolsThisIter` (whether only read/lookup
 * tools were used this iteration with no pending server tools).
 */
export function checkReadOnlyStagnation(
  state: LoopState,
  ctx: CoordinatorContext,
  onlyReadToolsThisIter: boolean,
): PolicyAction {
  if (!onlyReadToolsThisIter || (ctx.intentMode !== 'code' && ctx.intentMode !== 'debug')) {
    return { action: 'continue', stateUpdates: { readOnlyIterationCount: 0 } };
  }

  const newCount = (state.readOnlyIterationCount ?? 0) + 1;
  const readOnlyLimit = state.currentStrategy === 'GOD_MODE' ? 1 : 3;

  if (newCount >= readOnlyLimit) {
    const message = state.currentStrategy === 'GOD_MODE'
      ? 'SYSTEM: You have read files without editing. You MUST now call edit_lines (preferred) or search_replace (fallback) to make the change. ' +
        'You already have enough context. Pick a target and edit NOW. Do NOT read more files.'
      : 'SYSTEM: You have investigated for 3 iterations without making changes. ' +
        'You MUST now either: (1) call edit_lines or search_replace to make the change, ' +
        '(2) call run_specialist to delegate the work, or (3) respond with your findings. ' +
        'Do NOT read more files.';
    return {
      action: 'nudge',
      message,
      stateUpdates: { readOnlyIterationCount: 0 },
    };
  }

  return { action: 'continue', stateUpdates: { readOnlyIterationCount: newCount } };
}

// ── 8. Post-Edit Stagnation ─────────────────────────────────────────────────

/**
 * Post-edit no-change guard. If mutations are happening but producing no
 * net new changes, trigger rethink cycles or break after exhausting the
 * rethink budget.
 *
 * On `break`, the caller should append `reason` to state.fullText.
 */
export function checkPostEditStagnation(
  state: LoopState,
  ctx: CoordinatorContext,
  snap: PostEditSnapshot,
): PolicyAction {
  if (ctx.intentMode !== 'code' || !state.hasAttemptedEdit) {
    return { action: 'continue' };
  }

  if (snap.addedChangesThisIteration) {
    return {
      action: 'continue',
      stateUpdates: { postEditNoChangeIterations: 0, rethinkCount: 0 },
    };
  }

  if (!snap.hadExecution) return { action: 'continue' };

  const newCount = state.postEditNoChangeIterations + 1;
  if (newCount < POST_EDIT_STAGNATION_THRESHOLD) {
    return {
      action: 'continue',
      stateUpdates: { postEditNoChangeIterations: newCount },
    };
  }

  const maxRethinks = snap.maxRethinks;

  if (state.rethinkCount < maxRethinks) {
    const newRethink = state.rethinkCount + 1;
    const recentTools = state.toolSequenceLog.slice(-8).join(', ') || 'none';
    const lastErr = state.lastMutationFailure
      ? `Last failure: ${(state.lastMutationFailure as MutationFailure).reason} on ${(state.lastMutationFailure as MutationFailure).filePath ?? 'unknown'}`
      : 'Edits produced no net change';

    return {
      action: 'nudge',
      message:
        `SYSTEM RETHINK (${newRethink}/${maxRethinks}): You have attempted edits for ${state.iteration + 1} iterations without producing a net change.\n\n` +
        `What you tried: ${recentTools}\n` +
        `What failed: ${lastErr}\n\n` +
        'Step back. Consider:\n' +
        '1. Is the target file correct? Check the rendering chain.\n' +
        '2. Is there a different section or line range that needs editing?\n' +
        '3. Should you read the file again to see its current state after previous edits?\n\n' +
        'Try a DIFFERENT approach NOW. Do not repeat the same edit.',
      stateUpdates: {
        rethinkCount: newRethink,
        postEditNoChangeIterations: 0,
      },
    };
  }

  return {
    action: 'break',
    reason:
      `Stopped after ${maxRethinks} rethink attempt(s) with no net code changes. ` +
      'The current approach may need manual review or a different strategy.',
  };
}

// ── 9. Finalization Nudge ───────────────────────────────────────────────────

/**
 * Soft-cap finalization. Once edits exist and the tool budget soft cap is
 * reached, first nudge the agent to finalize, then hard-break on the
 * second pass.
 */
export function checkFinalizationNudge(state: LoopState, ctx: CoordinatorContext): PolicyAction {
  if (
    ctx.intentMode !== 'code' ||
    state.accumulatedChanges.length === 0 ||
    state.totalToolCalls < POST_EDIT_TOOL_BUDGET_SOFT_CAP
  ) {
    return { action: 'continue' };
  }

  if (!state.finalizationNudgeSent) {
    return {
      action: 'nudge',
      message:
        'SYSTEM: You already have valid edits. Stop additional exploration and finalize now. ' +
        'Only perform one final targeted fix if absolutely required; otherwise finish.',
      stateUpdates: { finalizationNudgeSent: true },
    };
  }

  return {
    action: 'break',
    reason: `Post-edit tool budget exceeded (${state.totalToolCalls})`,
  };
}
