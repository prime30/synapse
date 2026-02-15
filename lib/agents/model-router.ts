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
  | 'classify_trivial'; // Trivial-tier PM execution (Haiku)

// ── Model identifiers ───────────────────────────────────────────────────────

export const MODELS = {
  // Anthropic
  CLAUDE_OPUS: 'claude-opus-4-6',
  CLAUDE_SONNET: 'claude-sonnet-4-5-20250929',
  CLAUDE_HAIKU: 'claude-haiku-4-5-20251001',

  // OpenAI
  GPT_4O: 'gpt-4o',
  GPT_4O_MINI: 'gpt-4o-mini',

  // Google
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
  analyze:          MODELS.CLAUDE_OPUS,      // PM needs deep reasoning
  generate:         MODELS.CLAUDE_SONNET,    // Specialists use Sonnet for speed/quality
  review:           MODELS.GPT_4O,           // Review uses GPT-4o
  summary:          MODELS.CLAUDE_HAIKU,     // Summaries use Haiku (fast + cheap)
  fix:              MODELS.CLAUDE_SONNET,    // Quick fixes use Sonnet
  explain:          MODELS.CLAUDE_SONNET,    // Explanations use Sonnet
  refactor:         MODELS.CLAUDE_SONNET,    // Refactoring uses Sonnet
  document:         MODELS.CLAUDE_SONNET,    // Documentation uses Sonnet
  plan:             MODELS.CLAUDE_OPUS,      // Plans need deep reasoning
  chat:             MODELS.CLAUDE_SONNET,    // General chat uses Sonnet
  classify:         MODELS.CLAUDE_HAIKU,     // Request classification (fast + cheap)
  classify_trivial: MODELS.CLAUDE_HAIKU,     // Trivial-tier PM execution (Haiku)
};

// ── Agent defaults ──────────────────────────────────────────────────────────

export type AgentRole = 'project_manager' | 'liquid' | 'javascript' | 'css' | 'review' | 'summary';

/** Default model for each agent role (used when no action override exists). */
export const AGENT_DEFAULTS: Record<AgentRole, ModelId> = {
  project_manager: MODELS.CLAUDE_OPUS,
  liquid:          MODELS.CLAUDE_SONNET,
  javascript:      MODELS.CLAUDE_SONNET,
  css:             MODELS.CLAUDE_SONNET,
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
};

/** Actions that benefit from adaptive thinking (deep reasoning). */
export const THINKING_ACTIONS = new Set<AIAction>(['analyze', 'plan']);

// ── System default ──────────────────────────────────────────────────────────

export const SYSTEM_DEFAULT_MODEL: ModelId = MODELS.CLAUDE_SONNET;

// ── Provider detection ──────────────────────────────────────────────────────

export type ProviderName = 'anthropic' | 'openai' | 'google';

/** Detect which provider a model ID belongs to. */
export function getProviderForModel(model: string): ProviderName {
  if (model.startsWith('claude-')) return 'anthropic';
  if (model.startsWith('gpt-') || model.startsWith('o1') || model.startsWith('o3')) return 'openai';
  if (model.startsWith('gemini-')) return 'google';
  // Default to anthropic for unknown models
  return 'anthropic';
}

// ── Model resolution ────────────────────────────────────────────────────────

export interface ResolveModelOptions {
  /** The AI action being performed (highest priority override). */
  action?: AIAction;
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
 *   1. Action override  -> MODEL_MAP[action]
 *   2. User preference  -> userOverride (if provided and non-empty)
 *   3. Agent default    -> AGENT_DEFAULTS[agentRole]
 *   4. System default   -> SYSTEM_DEFAULT_MODEL
 *
 * The `action` override is highest because certain actions (e.g. summary)
 * MUST use specific models regardless of user preference.
 */
export function resolveModel(options: ResolveModelOptions = {}): string {
  const { action, userOverride, agentRole, tier } = options;

  // 0. ARCHITECTURAL tier escalation (EPIC V5): PM uses Opus for all work,
  //    specialists use Sonnet (which is already the default). This overrides
  //    action-level mappings for ARCHITECTURAL tasks to ensure deep reasoning.
  if (tier === 'ARCHITECTURAL') {
    // PM and analysis actions get Opus for the extended context window
    if (agentRole === 'project_manager' || action === 'analyze' || action === 'plan') {
      return MODELS.CLAUDE_OPUS;
    }
    // Specialists keep Sonnet (already the default for generate/fix)
    if (action === 'generate' || action === 'fix' || action === 'refactor') {
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
