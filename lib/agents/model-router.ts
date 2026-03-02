/**
 * Action-based multi-model routing.
 *
 * Priority chain for model resolution:
 *   0. Forced model (benchmark/test bypass)
 *   0.5 Tuned model canary (hybrid router, for routed actions)
 *   1. Action-level override (e.g. summary always uses Haiku)
 *   2. User preference (from useAgentSettings / localStorage)
 *   3. Agent default (PM uses Opus, specialists use Sonnet)
 *   4. System default (Sonnet 4)
 */

import { shouldUseTunedModel } from '../finetune/hybrid-router';

// ── AI Action types ─────────────────────────────────────────────────────────

export type AIAction =
  | 'analyze'           // PM analysis of user request
  | 'generate'          // Specialist code generation
  | 'review'            // Review agent quality check
  | 'summary'           // Conversational summary of results
  | 'fix'               // Quick fix / error correction
  | 'explain'           // Explain code / concept
  | 'refactor'          // Code refactoring
  | 'document'          // Generate documentation
  | 'plan'              // Multi-step plan generation
  | 'chat'              // General conversational response
  | 'classify'          // Request complexity classification (Haiku)
  | 'classify_trivial'  // Trivial-tier PM execution (Haiku)
  | 'ask'               // Ask-mode informational questions (Haiku fast path)
  | 'debug'             // Debug mode: Codex (GPT-4o) for investigation/diagnostics
  | 'scout';            // Structural Scout: lightweight brief enrichment (Grok Code Fast)

// ── Model identifiers ───────────────────────────────────────────────────────

export const MODELS = {
  // Anthropic
  CLAUDE_OPUS: 'claude-opus-4-6',
  CLAUDE_SONNET: 'claude-sonnet-4-6',
  CLAUDE_HAIKU: 'claude-haiku-4-5-20251001',

  // OpenAI
  GPT_4O: 'gpt-4o',
  GPT_4O_MINI: 'gpt-4o-mini',

  // Google -- Gemini 3
  GEMINI_3_FLASH: 'gemini-3-flash-preview',
  GEMINI_3_PRO: 'gemini-3-pro-preview',       // Text/reasoning; orchestration fallback
  GEMINI_3_PRO_IMAGE: 'gemini-3-pro-image-preview',

  // Google -- Gemini 2 (legacy)
  GEMINI_PRO: 'gemini-2.0-flash',
  GEMINI_FLASH: 'gemini-2.0-flash-lite',

  // xAI -- Grok
  GROK_4: 'grok-4',
  GROK_FAST: 'grok-4-1-fast-reasoning',
  GROK_CODE: 'grok-code-fast-1',
} as const;

export type ModelId = (typeof MODELS)[keyof typeof MODELS];

// ── Default model map per action ────────────────────────────────────────────

/**
 * Maps each AI action to its default model.
 * These can be overridden by user preferences.
 */
export const MODEL_MAP: Record<AIAction, ModelId> = {
  analyze:          MODELS.CLAUDE_OPUS,      // PM orchestration: Opus for reliable delegation
  generate:         MODELS.CLAUDE_SONNET,    // Specialists: Sonnet for fast targeted edits
  review:           MODELS.CLAUDE_SONNET,    // Review: Sonnet (Opus via tier routing for COMPLEX+)
  summary:          MODELS.CLAUDE_HAIKU,     // Summaries: Haiku (fast + cheap)
  fix:              MODELS.CLAUDE_SONNET,    // Fix: Sonnet for fast single-file fixes
  explain:          MODELS.CLAUDE_SONNET,    // Explanations: Sonnet
  refactor:         MODELS.CLAUDE_SONNET,    // Refactoring: Sonnet (Opus via tier routing for COMPLEX+)
  document:         MODELS.CLAUDE_SONNET,    // Documentation: Sonnet
  plan:             MODELS.CLAUDE_OPUS,      // Planning: Opus for deep reasoning
  chat:             MODELS.CLAUDE_SONNET,    // General chat: Sonnet
  classify:         MODELS.CLAUDE_HAIKU,     // Classification: Haiku (fast + cheap)
  classify_trivial: MODELS.CLAUDE_HAIKU,     // Trivial classification: Haiku
  ask:              MODELS.CLAUDE_SONNET,    // Ask mode: Sonnet for quality answers
  debug:            MODELS.CLAUDE_OPUS,      // Debug: Opus for reliable diagnosis + edits
  scout:            MODELS.GROK_CODE,        // Scout: Grok Code Fast (cheap + fast; Sonnet fallback)
};

// ── Agent defaults ──────────────────────────────────────────────────────────

export type AgentRole = 'project_manager' | 'liquid' | 'javascript' | 'css' | 'review' | 'summary';

/** Default model for each agent role (used when no action override exists). */
export const AGENT_DEFAULTS: Record<AgentRole, ModelId> = {
  project_manager: MODELS.CLAUDE_OPUS,      // PM: Opus for reliable orchestration + delegation
  liquid:          MODELS.CLAUDE_SONNET,    // Specialist: Sonnet for fast targeted edits
  javascript:      MODELS.CLAUDE_SONNET,    // Specialist: Sonnet for fast targeted edits
  css:             MODELS.CLAUDE_SONNET,    // Specialist: Sonnet for fast targeted edits
  review:          MODELS.CLAUDE_SONNET,    // Review: Sonnet for speed (Opus via tier routing for COMPLEX+)
  summary:         MODELS.CLAUDE_HAIKU,     // Summary: Haiku for speed
};

// ── Effort mapping (Phase 4: Adaptive Thinking) ─────────────────────────────

/** Effort level for each action when adaptive thinking is enabled. */
export const ACTION_EFFORT: Record<AIAction, 'low' | 'medium' | 'high' | 'max'> = {
  analyze:          'high',
  plan:             'max',
  generate:         'high',
  review:           'high',
  fix:              'medium',
  explain:          'medium',
  refactor:         'high',
  document:         'medium',
  summary:          'low',
  chat:             'medium',
  classify:         'low',
  classify_trivial: 'low',
  ask:              'low',
  debug:            'high',
  scout:            'low',
};

/** Actions that benefit from adaptive thinking (deep reasoning). */
export const THINKING_ACTIONS = new Set<AIAction>(['analyze', 'plan']);

// ── System default ──────────────────────────────────────────────────────────

export const SYSTEM_DEFAULT_MODEL: ModelId = MODELS.CLAUDE_SONNET;

// ── Provider detection ──────────────────────────────────────────────────────

export type ProviderName = 'anthropic' | 'openai' | 'google' | (string & {});

// EPIC E: Custom provider model prefix registry
// e.g. registerCustomModelPrefix('deepseek', 'deepseek') maps deepseek-* models to 'deepseek' provider
const customModelPrefixes = new Map<string, string>();

export function registerCustomModelPrefix(prefix: string, providerName: string): void {
  customModelPrefixes.set(prefix, providerName);
}

/** Detect which provider a model ID belongs to. */
export function getProviderForModel(model: string): ProviderName {
  if (model.startsWith('claude-')) return 'anthropic';
  if (model.startsWith('gpt-') || model.startsWith('o1') || model.startsWith('o3')) return 'openai';
  if (model.startsWith('gemini-')) return 'google';
  if (model.startsWith('grok-')) return 'xai';
  if (model.startsWith('synapse-')) return 'openai-compat';

  // EPIC E: Check custom model prefixes
  for (const [prefix, provider] of customModelPrefixes) {
    if (model.startsWith(prefix)) return provider;
  }

  // Default to anthropic for unknown models
  return 'anthropic';
}

// ── Tier-based model resolution ─────────────────────────────────────────────

const SPECIALIST_ROLES = new Set<AgentRole>(['liquid', 'javascript', 'css']);
const SPECIALIST_ACTIONS = new Set<AIAction>(['generate', 'fix', 'refactor']);

function resolveTierModel(
  tier: 'TRIVIAL' | 'SIMPLE' | 'COMPLEX' | 'ARCHITECTURAL',
  action?: AIAction,
  agentRole?: AgentRole,
): string | null {
  const isSpecialist = (agentRole && SPECIALIST_ROLES.has(agentRole)) ||
    (action && SPECIALIST_ACTIONS.has(action));
  const hasGrok = Boolean(process.env.XAI_API_KEY);

  let model: string;

  const reviewModelOverride = process.env.REVIEW_MODEL;

  switch (tier) {
    case 'TRIVIAL':
      if (action === 'review') { model = reviewModelOverride ?? MODELS.CLAUDE_HAIKU; break; }
      if (isSpecialist) { model = hasGrok ? MODELS.GROK_CODE : MODELS.CLAUDE_HAIKU; break; }
      model = MODELS.CLAUDE_SONNET;
      break;

    case 'SIMPLE':
      if (action === 'review') { model = reviewModelOverride ?? MODELS.CLAUDE_HAIKU; break; }
      if (isSpecialist) { model = hasGrok ? MODELS.GROK_CODE : MODELS.CLAUDE_SONNET; break; }
      model = MODELS.CLAUDE_SONNET;
      break;

    case 'COMPLEX':
      if (action === 'review') { model = reviewModelOverride ?? MODELS.CLAUDE_OPUS; break; }
      if (isSpecialist) { model = MODELS.CLAUDE_SONNET; break; }
      model = MODELS.CLAUDE_OPUS;
      break;

    case 'ARCHITECTURAL':
      model = MODELS.CLAUDE_OPUS;
      break;

    default:
      return null;
  }

  console.log(`[ModelRouter] tier=${tier} action=${action ?? '-'} role=${agentRole ?? '-'} → ${model}`);
  return model;
}

// ── Model resolution ────────────────────────────────────────────────────────

// ── Execution tier routing ───────────────────────────────────────────────────

export type ExecutionTier = 'planning' | 'editing' | 'review';

/**
 * Map execution tier to cheapest viable model.
 * Planning: user's model (or Opus). Editing: cheapest tool-use model. Review: mid-tier.
 */
function resolveExecutionTierModel(executionTier: ExecutionTier): ModelId {
  const hasGrok = Boolean(process.env.XAI_API_KEY);
  switch (executionTier) {
    case 'editing':
      return hasGrok ? MODELS.GROK_CODE : MODELS.CLAUDE_HAIKU;
    case 'review':
      return MODELS.CLAUDE_SONNET;
    case 'planning':
      return MODELS.CLAUDE_OPUS;
  }
}

/** Approximate cost per 1M output tokens in USD for tier comparison / monitoring. */
export const MODEL_COST_PER_M_OUTPUT: Record<string, number> = {
  [MODELS.CLAUDE_OPUS]:    60,
  [MODELS.CLAUDE_SONNET]:  15,
  [MODELS.CLAUDE_HAIKU]:   5,
  [MODELS.GPT_4O]:         30,
  [MODELS.GPT_4O_MINI]:    2.4,
  [MODELS.GEMINI_3_FLASH]: 1.5,
  [MODELS.GEMINI_3_PRO]:   7,
  [MODELS.GEMINI_PRO]:     2.5,
  [MODELS.GEMINI_FLASH]:   0.3,
  [MODELS.GROK_4]:         20,
  [MODELS.GROK_FAST]:      6,
  [MODELS.GROK_CODE]:      2,
};

/** Approximate cost per 1M input tokens in USD. */
export const MODEL_COST_PER_M_INPUT: Record<string, number> = {
  [MODELS.CLAUDE_OPUS]:    15,
  [MODELS.CLAUDE_SONNET]:  3,
  [MODELS.CLAUDE_HAIKU]:   1,
  [MODELS.GPT_4O]:         5,
  [MODELS.GPT_4O_MINI]:    0.6,
  [MODELS.GEMINI_3_FLASH]: 0.15,
  [MODELS.GEMINI_3_PRO]:   1.25,
  [MODELS.GEMINI_PRO]:     0.1,
  [MODELS.GEMINI_FLASH]:   0.075,
  [MODELS.GROK_4]:         6,
  [MODELS.GROK_FAST]:      2,
  [MODELS.GROK_CODE]:      0.5,
};

/** Structured cost event emitted after each agent phase for monitoring. */
export interface AgentCostEvent {
  executionId: string;
  projectId: string;
  phase: 'pm' | 'specialist' | 'review';
  modelId: string;
  executionTier: ExecutionTier | 'default';
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  durationMs: number;
}

export interface ResolveModelOptions {
  /** The AI action being performed (highest priority override). */
  action?: AIAction;
  /** Forced model that bypasses ALL routing (used by benchmarks/tests). */
  forcedModel?: string;
  /** User's preferred model from settings (second priority). */
  userOverride?: string;
  /** The agent role making the request (third priority). */
  agentRole?: AgentRole;
  /** Routing tier for adaptive model escalation (EPIC V5). */
  tier?: 'TRIVIAL' | 'SIMPLE' | 'COMPLEX' | 'ARCHITECTURAL';
  /** Max Quality mode: force Opus for all agents including specialists. */
  maxQuality?: boolean;
  /** Execution tier: overrides model selection for cost optimization.
   *  Planning uses the user's model, editing drops to cheapest tool-use,
   *  review uses mid-tier. Takes priority over tier routing when set. */
  executionTier?: ExecutionTier;
}

/**
 * Resolve which model to use for a given request.
 *
 * Priority chain:
 *   0. Forced model       -> forcedModel (benchmark/test override)
 *   0.5 Tuned model canary -> hybrid router
 *   1. User preference    -> userOverride (highest normal priority)
 *   2. Infrastructure     -> classify/summary locked to Haiku/Grok
 *   3. Tier routing       -> TRIVIAL=Grok, SIMPLE=Sonnet, COMPLEX+=Opus
 *   4. Grok routing       -> explain/document/chat when XAI_API_KEY set
 *   5. Action default     -> MODEL_MAP[action]
 *   6. Agent default      -> AGENT_DEFAULTS[agentRole]
 *   7. System default     -> SYSTEM_DEFAULT_MODEL
 */
export function resolveModel(options: ResolveModelOptions = {}): string {
  const { action, forcedModel, userOverride, agentRole, tier, maxQuality, executionTier } = options;

  // 0. Forced model — bypasses all routing (benchmark/test use only)
  if (forcedModel && forcedModel.trim()) {
    return forcedModel;
  }

  // 0.1 Max Quality mode — Opus for PM/plan/debug/ask/review/explain.
  // Specialists get Sonnet (or Grok Code if available) to avoid rate limits.
  if (maxQuality) {
    if (action === 'classify' || action === 'classify_trivial') return MODELS.CLAUDE_HAIKU;
    if (action === 'summary') return MODELS.CLAUDE_HAIKU;
    if (action === 'generate' || action === 'fix' || action === 'refactor') {
      return process.env.XAI_API_KEY ? MODELS.GROK_CODE : MODELS.CLAUDE_SONNET;
    }
    return MODELS.CLAUDE_OPUS;
  }

  // 0.5 Hybrid router: tuned model canary
  if (action) {
    const canary = shouldUseTunedModel(action);
    if (canary.useTunedModel) {
      return canary.modelId;
    }
  }

  // 1. User preference — HIGHEST priority in normal operation.
  // Only classify/summary are exempt (infrastructure actions that need specific models).
  const infraActions = new Set<AIAction>(['classify', 'classify_trivial', 'summary', 'scout']);
  if (userOverride && userOverride.trim()) {
    if (!action || !infraActions.has(action)) {
      // executionTier 'editing' overrides user preference — the whole point
      // is to drop specialists to the cheapest model regardless of user's pick.
      if (executionTier === 'editing') {
        const model = resolveExecutionTierModel('editing');
        console.log(`[ModelRouter] executionTier=editing overrides user pref → ${model}`);
        return model;
      }
      return userOverride;
    }
  }

  // 2. Infrastructure actions always use their designated models
  if (action && infraActions.has(action)) {
    if (action === 'summary' && process.env.XAI_API_KEY) return MODELS.GROK_FAST;
    if (action === 'scout') return process.env.XAI_API_KEY ? MODELS.GROK_CODE : MODELS.CLAUDE_SONNET;
    return MODEL_MAP[action];
  }

  // 2.5 Execution tier routing — cost optimization for specialist edits
  if (executionTier) {
    const model = resolveExecutionTierModel(executionTier);
    console.log(`[ModelRouter] executionTier=${executionTier} → ${model}`);
    return model;
  }

  // 3. Tier-based routing (when no user override)
  // TRIVIAL  → Grok Code (specialists) / Haiku (fallback)
  // SIMPLE   → Grok Code (specialists when XAI key) / Sonnet (PM + fallback)
  // COMPLEX  → Opus (PM) / Sonnet (specialists)
  // ARCHITECTURAL → Opus everywhere
  if (tier) {
    const resolved = resolveTierModel(tier, action, agentRole);
    if (resolved) return resolved;
  }

  // 4. Grok routing for non-tool conversational actions (when no tier set)
  if (process.env.XAI_API_KEY) {
    if (action === 'explain') return MODELS.GROK_4;
    if (action === 'document') return MODELS.GROK_FAST;
    if (action === 'chat') return MODELS.GROK_4;
  }

  // 5. Action default
  if (action && MODEL_MAP[action]) {
    return MODEL_MAP[action];
  }

  // 6. Agent role default
  if (agentRole && AGENT_DEFAULTS[agentRole]) {
    return AGENT_DEFAULTS[agentRole];
  }

  // 7. System default
  return SYSTEM_DEFAULT_MODEL;
}
