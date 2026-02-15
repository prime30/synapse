/**
 * AI feature flags — gated via environment variables.
 * All default to `false` (disabled). Enable per-feature by setting the
 * corresponding env var to 'true'.
 */
export const AI_FEATURES = {
  /** Anthropic prompt caching (reduces input token costs ~90% on repeat calls). */
  promptCaching: process.env.ENABLE_PROMPT_CACHING === 'true',

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
} as const;
