/**
 * Action-based multi-model routing.
 *
 * Priority chain for model resolution:
 *   1. Action-level override (e.g. summary always uses Haiku)
 *   2. User preference (from useAgentSettings / localStorage)
 *   3. Agent default (PM uses Opus, specialists use Sonnet)
 *   4. System default (Sonnet 4)
 */

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
  | 'debug';            // Debug mode: Codex (GPT-4o) for investigation/diagnostics

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
} as const;

export type ModelId = (typeof MODELS)[keyof typeof MODELS];

// ── Default model map per action ────────────────────────────────────────────

/**
 * Maps each AI action to its default model.
 * These can be overridden by user preferences.
 */
export const MODEL_MAP: Record<AIAction, ModelId> = {
  analyze:          MODELS.CLAUDE_SONNET,    // PM orchestration (Sonnet 4.6 for rate-limit headroom)
  generate:         MODELS.CLAUDE_OPUS,      // Specialists (Liquid/JS/CSS): Opus for best code quality
  review:           MODELS.GPT_4O,           // Review uses GPT-4o
  summary:          MODELS.CLAUDE_HAIKU,     // Summaries use Haiku (fast + cheap)
  fix:              MODELS.CLAUDE_OPUS,      // Specialists: Opus for multi-step fixes
  explain:          MODELS.CLAUDE_SONNET,    // Explanations use Sonnet
  refactor:         MODELS.CLAUDE_OPUS,     // Specialists: Opus for refactoring
  document:         MODELS.CLAUDE_SONNET,    // Documentation uses Sonnet
  plan:             MODELS.CLAUDE_SONNET,    // PM orchestration (Sonnet 4.6)
  chat:             MODELS.CLAUDE_SONNET,    // General chat uses Sonnet
  classify:         MODELS.CLAUDE_HAIKU,     // Request classification (fast + cheap)
  classify_trivial: MODELS.CLAUDE_HAIKU,     // Trivial-tier PM execution (Haiku)
  ask:              MODELS.CLAUDE_HAIKU,     // Ask-mode fast path (3-5x faster)
  debug:            MODELS.GPT_4O,           // Debug: Codex (GPT-4o) for diagnostics
};

// ── Agent defaults ──────────────────────────────────────────────────────────

export type AgentRole = 'project_manager' | 'liquid' | 'javascript' | 'css' | 'review' | 'summary';

/** Default model for each agent role (used when no action override exists). */
export const AGENT_DEFAULTS: Record<AgentRole, ModelId> = {
  project_manager: MODELS.CLAUDE_SONNET,    // PM orchestration (Sonnet 4.6 for rate-limit headroom)
  liquid:          MODELS.CLAUDE_OPUS,      // Specialist: Opus for best code quality
  javascript:      MODELS.CLAUDE_OPUS,      // Specialist: Opus for best code quality
  css:             MODELS.CLAUDE_OPUS,      // Specialist: Opus for best code quality
  review:          MODELS.GPT_4O,
  summary:         MODELS.CLAUDE_HAIKU,
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

  // EPIC E: Check custom model prefixes
  for (const [prefix, provider] of customModelPrefixes) {
    if (model.startsWith(prefix)) return provider;
  }

  // Default to anthropic for unknown models
  return 'anthropic';
}

// ── Model resolution ────────────────────────────────────────────────────────

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
}

/**
 * Resolve which model to use for a given request.
 *
 * Priority chain:
 *   0. Forced model     -> forcedModel (benchmark/test override, bypasses everything)
 *   1. Action override  -> MODEL_MAP[action]
 *   2. User preference  -> userOverride (if provided and non-empty)
 *   3. Agent default    -> AGENT_DEFAULTS[agentRole]
 *   4. System default   -> SYSTEM_DEFAULT_MODEL
 *
 * The `action` override is highest in normal operation because certain
 * actions (e.g. summary) MUST use specific models regardless of user
 * preference. `forcedModel` exists for benchmarks that need to bypass
 * all routing to test specific model behavior.
 */
export function resolveModel(options: ResolveModelOptions = {}): string {
  const { action, forcedModel, userOverride, agentRole, tier } = options;

  // 0. Forced model — bypasses all routing (benchmark/test use only)
  if (forcedModel && forcedModel.trim()) {
    return forcedModel;
  }

  // 0. TRIVIAL / SIMPLE tier: use Haiku for fast, cheap execution (asks and simple edits).
  if (tier === 'TRIVIAL' || tier === 'SIMPLE') {
    if (
      action === 'ask' ||
      action === 'classify_trivial' ||
      action === 'analyze' ||
      action === 'plan' ||
      action === 'generate' ||
      action === 'fix' ||
      action === 'refactor' ||
      action === 'explain' ||
      action === 'chat'
    ) {
      return MODELS.CLAUDE_HAIKU;
    }
  }

  // 0. Review by tier: Codex (GPT-4o) for SIMPLE/TRIVIAL, Opus for COMPLEX/ARCHITECTURAL
  if (action === 'review' && tier) {
    if (tier === 'TRIVIAL' || tier === 'SIMPLE') return MODELS.GPT_4O;   // Codex: fast, consistent
    if (tier === 'COMPLEX' || tier === 'ARCHITECTURAL') return MODELS.CLAUDE_OPUS; // Opus: deeper review
  }

  // 0. ARCHITECTURAL tier: Opus for generation/fix/refactor (including PM in solo mode).
  //    Only pure analysis/planning stays on Sonnet for speed.
  if (tier === 'ARCHITECTURAL') {
    if (action === 'generate' || action === 'fix' || action === 'refactor') {
      return MODELS.CLAUDE_OPUS;
    }
    if (action === 'analyze' || action === 'plan') {
      return MODELS.CLAUDE_SONNET;
    }
  }

  // 1. Action override — certain actions are locked to specific models
  if (action && MODEL_MAP[action]) {
    return MODEL_MAP[action];
  }

  // 2. User preference
  if (userOverride && userOverride.trim()) {
    return userOverride;
  }

  // 3. Agent default
  if (agentRole && AGENT_DEFAULTS[agentRole]) {
    return AGENT_DEFAULTS[agentRole];
  }

  // 4. System default
  return SYSTEM_DEFAULT_MODEL;
}
