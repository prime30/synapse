import type { RoutingTier } from './classifier';

type IntentMode = 'code' | 'ask' | 'plan' | 'debug';

const PLAN_APPROVAL_RE =
  /\b(approved plan|approve(?:d)? the plan|execute (?:these|the) .*steps|implement (?:the|this) plan|proceed with (?:the )?plan)\b/i;

const NON_TRIVIAL_HINT_RE =
  /\b(multi[- ]file|across .*files|entire theme|architecture|refactor|migration|system[- ]wide|shopify theme)\b/i;

const DIRECT_EDIT_INTENT_RE =
  /\b(apply|edit|replace|update|fix|implement|make (?:the|those) changes)\b/i;
const EXPLICIT_ENACTMENT_RE =
  /\b(?:implement|apply|make|execute|ship|do)\b[\s\S]{0,80}\b(?:change|changes|edit|edits|fix|fixes|update|updates|that|those|this)\b/i;
const SCOPED_EDIT_SIGNAL_RE =
  /\b(selected code in editor|active file:|lines?\s+\d+\s*-\s*\d+|\[(?:liquid|css|javascript|json)\])\b/i;
const BROAD_SCOPE_RE =
  /\b(entire theme|across .*files|migration|refactor|architecture|system[- ]wide|all files?)\b/i;

export function hasPlanApprovalSignal(recentMessages: string[] | undefined, userRequest: string): boolean {
  const haystack = [userRequest, ...(recentMessages ?? [])].join('\n');
  return PLAN_APPROVAL_RE.test(haystack);
}

function isNonTrivial(tier: RoutingTier, userRequest: string): boolean {
  if (tier === 'ARCHITECTURAL') return true;
  return NON_TRIVIAL_HINT_RE.test(userRequest);
}

function isScopedDirectEditRequest(userRequest: string): boolean {
  if (BROAD_SCOPE_RE.test(userRequest)) return false;
  return DIRECT_EDIT_INTENT_RE.test(userRequest) && SCOPED_EDIT_SIGNAL_RE.test(userRequest);
}

function isExplicitDirectCodeChangeRequest(userRequest: string): boolean {
  return DIRECT_EDIT_INTENT_RE.test(userRequest) || EXPLICIT_ENACTMENT_RE.test(userRequest);
}

export function shouldRequirePlanModeFirst(input: {
  intentMode: IntentMode;
  tier: RoutingTier;
  userRequest: string;
  recentMessages?: string[];
  isReferentialCodePrompt?: boolean;
}): boolean {
  if (input.isReferentialCodePrompt) return false;
  if (input.intentMode !== 'code') return false;
  // If the user directly asks to implement/apply code changes, enact immediately.
  // This avoids blocking explicit execution requests behind plan mode.
  if (isExplicitDirectCodeChangeRequest(input.userRequest)) return false;
  if (!isNonTrivial(input.tier, input.userRequest)) return false;
  // Micro-edit exemption: direct, scoped edit requests should enact immediately.
  if (isScopedDirectEditRequest(input.userRequest)) return false;
  return !hasPlanApprovalSignal(input.recentMessages, input.userRequest);
}

export function buildPlanModeRequiredMessage(tier: RoutingTier): string {
  return (
    `This is a theme-wide architectural change (${tier}). ` +
    'Switch to Plan mode to review and approve a plan before code is written.'
  );
}

export function buildMaximumEffortPolicyMessage(): string {
  return (
    'Maximum-effort execution policy: do not stop at quick wins or partial subsets. ' +
    'When recommendations are identified, implement the full recommendation set end-to-end unless the user explicitly narrows scope. ' +
    'Maximum-effort applies to IMPLEMENTATION, not investigation. Read files once, then implement changes. Do not loop on investigation.'
  );
}

/* ------------------------------------------------------------------ */
/*  Referential Enactment Policy                                      */
/* ------------------------------------------------------------------ */

export interface ReferentialPolicy {
  /** Pre-edit lookup budget — referential mode is mutating-first. */
  preEditLookupBudget: 0;
  /** Whether to attempt replay fallback before terminal no-op. */
  useReplayFallback: true;
  /** Only theme files are in scope for Shopify-safe edits. */
  allowedFileScopes: readonly string[];
  /** Code-mode runs with zero changes cannot be persisted as "completed". */
  noChangeCompletedBlocked: true;
}

const SHOPIFY_THEME_SCOPES = [
  'sections/',
  'snippets/',
  'templates/',
  'layout/',
  'assets/',
  'config/',
  'locales/',
] as const;

/**
 * Returns the policy constraints governing referential enactment.
 *
 * Contract:
 * - Referential mode enforces mutating-first (pre-edit lookup budget = 0).
 * - Uses replay fallback before terminal no-op.
 * - Preserves Shopify-safe file scope (only theme directories).
 * - Code-mode no-change runs cannot be persisted as `completed`.
 */
export function getReferentialPolicy(): ReferentialPolicy {
  return {
    preEditLookupBudget: 0,
    useReplayFallback: true,
    allowedFileScopes: SHOPIFY_THEME_SCOPES,
    noChangeCompletedBlocked: true,
  };
}
