/**
 * Unified file-size thresholds for agent tool guards.
 *
 * Single source of truth — tuned for real-world large themes and Cursor-like
 * workflows (edit quickly, cost secondary). Override via env if needed.
 */
export const TOOL_THRESHOLDS = {
  /** Below this, search_replace is the recommended editing tool. */
  SEARCH_REPLACE_RECOMMENDED_LINES: 200,

  /** Hard runtime block: search_replace returns an error above this. */
  SEARCH_REPLACE_HARD_BLOCK_LINES: 300,

  /** Character-based guard in base.ts specialist loop. */
  SEARCH_REPLACE_HARD_BLOCK_CHARS: 8_000,

  /** propose_code_edit is blocked above this line count (Cursor-like: allow large sections). */
  PROPOSE_CODE_EDIT_BLOCK_LINES: 1_000,

  /** Files larger than this get an outline instead of full content in context (Cursor-like: show full for more files). */
  LARGE_FILE_OUTLINE_CHARS: 16_000,

  /** Files larger than this escalate the task tier toward GOD_MODE. */
  GOD_MODE_ESCALATION_CHARS: 10_000,
} as const;

/**
 * Context editing thresholds — controls when Anthropic's server-side
 * clear_tool_uses kicks in and how much history to retain.
 *
 * SIMPLE strategies use less context, so we can be more aggressive.
 * GOD_MODE/HYBRID need deep history to avoid amnesia loops.
 */
export const CONTEXT_EDITING = {
  /** Input tokens before clear_tool_uses triggers (SIMPLE strategy). */
  SIMPLE_TRIGGER_TOKENS: 60_000,
  /** Input tokens before clear_tool_uses triggers (HYBRID/GOD_MODE). */
  COMPLEX_TRIGGER_TOKENS: 100_000,

  /** Number of recent tool_uses to keep after clearing (SIMPLE). */
  SIMPLE_KEEP_TOOL_USES: 6,
  /** Number of recent tool_uses to keep after clearing (HYBRID/GOD_MODE). */
  COMPLEX_KEEP_TOOL_USES: 12,

  /** Minimum tokens to clear per edit pass. */
  CLEAR_AT_LEAST_TOKENS: 10_000,

  /** Number of thinking turns to keep (all strategies). */
  KEEP_THINKING_TURNS: 2,

  /** Cleared tool_uses threshold that triggers a memory anchor injection. */
  ANCHOR_INJECTION_THRESHOLD: 5,

  /**
   * Percentage of the context editing trigger at which we proactively inject
   * a memory anchor BEFORE context editing fires (0.0 - 1.0).
   * E.g. 0.75 = inject when input tokens reach 75% of the trigger threshold.
   */
  PROACTIVE_ANCHOR_RATIO: 0.75,
} as const;
