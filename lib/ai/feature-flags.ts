/**
 * AI feature flags — gated via environment variables.
 * All default to `false` (disabled). Enable per-feature by setting the
 * corresponding env var to 'true'.
 */
export const AI_FEATURES = {
  /** Anthropic prompt caching (reduces input token costs ~90% on repeat calls). */
  promptCaching: process.env.ENABLE_PROMPT_CACHING !== 'false',

  /** Claude adaptive thinking with effort control. */
  adaptiveThinking: process.env.ENABLE_ADAPTIVE_THINKING !== 'false',

  /** Structured JSON outputs via output_config (Anthropic only). */
  structuredOutputs: process.env.ENABLE_STRUCTURED_OUTPUTS === 'true',

  /** Streaming tool use for summary-phase interactive cards. */
  streamingToolUse: process.env.ENABLE_STREAMING_TOOL_USE === 'true',

  /** Citation support for Ask mode and Review agent. */
  citations: process.env.ENABLE_CITATIONS === 'true',

  /** Message Batches API for bulk operations at reduced cost. */
  batchProcessing: process.env.ENABLE_BATCH_PROCESSING === 'true',

  /** PM exploration tools phase: PM uses read_file, search, grep before JSON decision. */
  pmExplorationTools: process.env.ENABLE_PM_EXPLORATION_TOOLS === 'true',

  /** Programmatic Tool Calling: let Claude batch read-only tools in a Python sandbox.
   *  DISABLED: PTC causes broken tool calls (empty patterns, wrong async signatures).
   *  Direct tool calling is more reliable. Re-enable when Anthropic improves PTC stability. */
  programmaticToolCalling: process.env.ENABLE_PTC === 'true',

  /** Server-side context editing: auto-clear old tool results and thinking blocks. */
  contextEditing: process.env.ENABLE_CONTEXT_EDITING !== 'false',

  /** Prompt cache TTL: '5m' (default free refresh) or '1h' (2x write cost, same read cost). */
  promptCacheTtl: (process.env.PROMPT_CACHE_TTL ?? '1h') as '5m' | '1h',

  /** Lean pipeline: efficiency overhaul single-pass agent loop. */
  leanPipeline: process.env.AGENT_LEAN_PIPELINE === 'true' || process.env.AGENT_LEAN_PIPELINE === '1',

  /** Knowledge modules: dynamic injection of domain knowledge based on user message keywords. */
  knowledgeModules: process.env.ENABLE_KNOWLEDGE_MODULES !== 'false',

  /** Semantic skill matching: hybrid keyword + word-vector similarity for module selection. */
  semanticSkillMatching: process.env.ENABLE_SEMANTIC_SKILL_MATCHING !== 'false',

  /** God Mode: full-context single-agent execution for complex tasks. */
  godMode: process.env.ENABLE_GOD_MODE !== 'false',

  /** Preview verification: post-edit snapshot + reflection loop. */
  previewVerification: process.env.ENABLE_PREVIEW_VERIFICATION === 'true',

  /** Structural Scout LLM enrichment for COMPLEX+ tiers (requires XAI_API_KEY or Anthropic key). */
  scoutEnrichment: process.env.ENABLE_SCOUT_ENRICHMENT === 'true'
    || (process.env.XAI_API_KEY != null && process.env.XAI_API_KEY !== ''),
} as const;
