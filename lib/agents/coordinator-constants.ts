/**
 * Tuning constants for the V2 coordinator agent loop.
 *
 * Extracted from coordinator-v2.ts so they can be tweaked
 * (or overridden in tests) without touching the main orchestration file.
 */

/** Iteration limits per intent mode (max tool-use rounds per run). */
export const ITERATION_LIMITS: Record<string, number> = {
  ask: 36,
  code: 40,
  plan: 36,
  debug: 48,
};

/** Total timeout for the entire streamV2 execution. Env AGENT_TOTAL_TIMEOUT_MS overrides. */
export const TOTAL_TIMEOUT_MS = Number(process.env.AGENT_TOTAL_TIMEOUT_MS) || 1_800_000; // 30 min default

/** Max characters for a single tool result before truncation. */
export const MAX_TOOL_RESULT_CHARS = 100_000;

export const LOOKUP_TOOL_NAMES = new Set([
  'read_file',
  'search_files',
  'grep_content',
  'glob_files',
  'semantic_search',
  'list_files',
  'get_dependency_graph',
]);

export const MUTATING_TOOL_NAMES = new Set([
  'propose_code_edit',
  'search_replace',
  'create_file',
  'edit_lines',
  'write_file',
  'delete_file',
  'rename_file',
  'undo_edit',
]);

export const PRE_EDIT_LOOKUP_BUDGET = 24;
export const PRE_EDIT_BLOCK_THRESHOLD = 16;
export const PRE_EDIT_ENFORCEMENT_ABORT_THRESHOLD = 6;
export const REFERENTIAL_PRE_EDIT_LOOKUP_BUDGET = 4;
export const REFERENTIAL_PRE_EDIT_BLOCK_THRESHOLD = 8;
export const GOD_MODE_PRE_EDIT_LOOKUP_BUDGET = 8;
export const GOD_MODE_PRE_EDIT_BLOCK_THRESHOLD = 4;
export const READ_LINES_DUPLICATE_PRE_EDIT_LIMIT = 1;
export const POST_EDIT_STAGNATION_THRESHOLD = 2;
export const POST_EDIT_TOOL_BUDGET_SOFT_CAP = 14;
export const CODE_ZERO_TOOL_STREAK_LIMIT = 2;
export const QUICK_EDIT_MAX_PRELOADED_FILES = 6;
export const QUICK_EDIT_MAX_SCOUT_TARGETS_PER_FILE = 4;
export const QUICK_EDIT_MAX_LARGE_PREVIEW_CHARS = 6_000;
export const QUICK_EDIT_MAX_INLINE_FILE_CHARS = 6_000;
export const FIRST_EDIT_TOOL_CALL_SLA = 8;
export const FIRST_EDIT_TOOL_CALL_ABORT = 14;

/** Tool call cap: 0 = no cap; iteration limit and timeout guard the run. */
export const MAX_TOOL_CALLS = 0;

/**
 * Tools executed server-side — results are fed back into the agent loop.
 * Client tools (propose_code_edit, search_replace, etc.) are forwarded to the UI.
 */
export const V2_SERVER_TOOLS = new Set([
  'read_file',
  'search_files',
  'grep_content',
  'glob_files',
  'semantic_search',
  'list_files',
  'get_dependency_graph',
  'run_diagnostics',
  'check_lint',
  'validate_syntax',
  'fetch_url',
  'web_search',
  'theme_check',
  'inspect_element',
  'get_page_snapshot',
  'read_console_logs',
  'query_selector',
  'run_specialist',
  'run_review',
  'read_lines',
  'edit_lines',
  'extract_region',
  'read_chunk',
  'parallel_batch_read',
  'find_references',
  'get_schema_settings',
  'search_replace',
  'write_file',
  'create_file',
  'delete_file',
  'rename_file',
  'undo_edit',
  'propose_code_edit',
  'inject_css',
  'inject_html',
  'screenshot_preview',
  'compare_screenshots',
  'push_to_shopify',
  'pull_from_shopify',
  'list_themes',
  'list_store_resources',
  'get_shopify_asset',
  'spawn_workers',
  'run_command',
  'read_network_requests',
  'generate_image',
  'update_scratchpad',
  'read_scratchpad',
  'generate_placeholder',
  'trace_rendering_chain',
  'check_theme_setting',
  'diagnose_visibility',
  'analyze_variants',
  'check_performance',
  'retrieve_similar_tasks',
  'navigate_preview',
  'refresh_memory_anchor',
  'recall_role_memory',
]);

export const MAX_STUCK_RECOVERIES = 2;
export const MAX_VERIFICATION_INJECTIONS = 6;
