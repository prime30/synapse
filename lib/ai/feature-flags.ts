/**
 * AI feature flags — gated via environment variables.
 * All default to `false` (disabled). Enable per-feature by setting the
 * corresponding env var to 'true'.
 */
export const AI_FEATURES = {
  /** Anthropic prompt caching (reduces input token costs ~90% on repeat calls). */
  promptCaching: process.env.ENABLE_PROMPT_CACHING !== 'false',

  /** Claude adaptive thinking with effort control. */
  adaptiveThinking: process.env.ENABLE_ADAPTIVE_THINKING === 'true',

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

  /** Conditional summary: skip/thin the Summary LLM call when PM already used tools. */
  conditionalSummary: process.env.ENABLE_CONDITIONAL_SUMMARY === 'true',

  /** V2 agent architecture: single-stream tool-calling loop (no Summary phase). */
  v2Agent: process.env.ENABLE_V2_AGENT === 'true',

  /** Programmatic Tool Calling: let Claude batch read-only tools in a Python sandbox. */
  programmaticToolCalling: process.env.ENABLE_PTC !== 'false',

  /** Server-side context editing: auto-clear old tool results and thinking blocks (beta). */
  contextEditing: process.env.ENABLE_CONTEXT_EDITING === 'true',

  /** Prompt cache TTL: '5m' (default free refresh) or '1h' (2x write cost, same read cost). */
  promptCacheTtl: (process.env.PROMPT_CACHE_TTL ?? '1h') as '5m' | '1h',
} as const;
