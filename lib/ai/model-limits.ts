/**
 * Per-model context window sizes (in tokens).
 *
 * Used by the context meter to show how much of the model's window is consumed.
 */
export const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  'claude-sonnet-4-6': 200_000,
  'claude-opus-4-6': 200_000,
  'claude-haiku-4-5-20251001': 200_000,
  'gemini-2.5-pro': 1_000_000,
  'gemini-2.5-flash': 1_000_000,
};

/** Fallback when the selected model isn't in the map. */
export const DEFAULT_CONTEXT_LIMIT = 200_000;

/**
 * Estimated token overhead for the agent system prompt, tool definitions,
 * and other scaffolding that isn't part of user-visible messages.
 */
export const SYSTEM_PROMPT_OVERHEAD = 2_000;

/**
 * Rough per-file token estimate used when we don't have actual file contents.
 * Average Shopify theme file is ~200-400 lines, ~1200 chars → ~300 tokens.
 */
export const AVG_TOKENS_PER_FILE = 300;
