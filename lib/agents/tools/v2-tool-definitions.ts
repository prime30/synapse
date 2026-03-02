/**
 * V2 Agent Architecture - Tool Definitions
 *
 * These tools are available to the PM in the v2 streaming agent loop.
 * The key additions over v1 are `run_specialist` and `run_review`,
 * which let the PM delegate to specialist agents inline during the loop
 * instead of requiring a separate orchestrated pipeline.
 */
import type { ToolDefinition } from '@/lib/ai/types';
import { AI_FEATURES } from '@/lib/ai/feature-flags';
import {
  AGENT_TOOLS,
  CHECK_LINT_TOOL,
  PROPOSE_CODE_EDIT_TOOL,
  SEARCH_REPLACE_TOOL,
  CREATE_FILE_TOOL,
  PROPOSE_PLAN_TOOL,
  ASK_CLARIFICATION_TOOL,
  NAVIGATE_PREVIEW_TOOL,
  CREATE_PLAN_TOOL,
  UPDATE_PLAN_TOOL,
  READ_PLAN_TOOL,
} from './definitions';

// -- New V2-only tools --------------------------------------------------

/**
 * Delegate a scoped task to a specialist agent (Liquid, CSS, JavaScript, JSON).
 * The specialist executes with domain-specific knowledge and returns code changes.
 * The PM sees the result and can continue reasoning.
 */
export const RUN_SPECIALIST_TOOL: ToolDefinition = {
  name: 'run_specialist',
  description:
    'Delegate a scoped coding task to a specialist agent. Use this for domain-specific edits. ' +
    'For feature additions, call run_specialist MULTIPLE TIMES in the SAME response — once for each file type needed ' +
    '(liquid for markup, css for styling, javascript for behavior). All specialists run in parallel. ' +
    'Each specialist reads the target file and makes edits using edit_lines (for files >300 lines) or search_replace (for smaller files). ' +
    'Include line ranges from the STRUCTURAL BRIEF in your task description so the specialist can skip discovery and edit precisely.',
  input_schema: {
    type: 'object',
    properties: {
      agent: {
        type: 'string',
        enum: ['liquid', 'javascript', 'css', 'json'],
        description: 'Which specialist to invoke',
      },
      task: {
        type: 'string',
        description:
          'Detailed instruction for the specialist. Be specific about what to change, ' +
          'in which files, and why. Include relevant context the specialist needs.',
      },
      affectedFiles: {
        type: 'array',
        items: { type: 'string' },
        description: 'File paths the specialist should focus on',
      },
      files: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Files this specialist will modify. Declaring files enables parallel execution with other specialists targeting different files.',
      },
    },
    required: ['agent', 'task', 'affectedFiles'],
    additionalProperties: false,
  },
};

/**
 * Run the review agent on accumulated code changes.
 * Returns a structured review with approval status, issues, and suggestions.
 */
export const RUN_REVIEW_TOOL: ToolDefinition = {
  name: 'run_review',
  description:
    'Run the review agent to validate code changes. Use after making complex or cross-file changes ' +
    'to catch syntax errors, breaking changes, truncation, and consistency issues. ' +
    'Returns approval status and any issues found.',
  input_schema: {
    type: 'object',
    properties: {
      scope: {
        type: 'string',
        enum: ['all', 'recent'],
        description: 'Review scope: "all" reviews all accumulated changes, "recent" reviews only changes since last review (default: all)',
      },
    },
    additionalProperties: false,
  },
};

/**
 * Get a second opinion from GPT-4o on a plan or refactor summary.
 */
export const GET_SECOND_OPINION_TOOL: ToolDefinition = {
  name: 'get_second_opinion',
  description:
    'Get a critical second opinion from GPT-4o on a plan or refactor summary. Use when the user asks for a second opinion, or before large refactors. Returns risks, alternatives, or improvements in 2–4 short paragraphs.',
  input_schema: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'The plan, refactor summary, or approach to get a second opinion on',
      },
    },
    required: ['content'],
    additionalProperties: false,
  },
};

/**
 * Refresh the agent's memory of what files were read, edited, and what
 * the current goal is. Call this when you feel uncertain about the state
 * of the session, or after long tool sequences where earlier context may
 * have been compacted. Returns a structured summary (not the file contents).
 */
export const REFRESH_MEMORY_ANCHOR_TOOL: ToolDefinition = {
  name: 'refresh_memory_anchor',
  description:
    'Retrieve a structured summary of your current session state: files read, files edited, ' +
    'recent tool sequence, and current goal. Call this when you are uncertain about what you ' +
    'have already done, rather than re-reading files. Zero cost, instant response.',
  input_schema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
};

/**
 * Recall past successful patterns and decisions for a specific specialist role.
 * Enables the PM to check for reusable approaches before dispatching work.
 */
export const RECALL_ROLE_MEMORY_TOOL: ToolDefinition = {
  name: 'recall_role_memory',
  description:
    'Recall past successful patterns and decisions for a specific specialist role. ' +
    'Use before starting work to check if a similar task was solved before.',
  input_schema: {
    type: 'object',
    properties: {
      role: {
        type: 'string',
        enum: ['liquid', 'javascript', 'css', 'json'],
        description: 'Which specialist role to recall memories for.',
      },
      query: {
        type: 'string',
        description: 'What pattern or task to search for in past outcomes.',
      },
    },
    required: ['role', 'query'],
    additionalProperties: false,
  },
};

/**
 * Look up design tokens for this project by category or query.
 * Returns token names, values, and usage guidance.
 */
export const GET_DESIGN_TOKENS_TOOL: ToolDefinition = {
  name: 'get_design_tokens',
  description:
    'Look up design tokens for this project by category or query. Returns token names, values, and usage guidance.',
  input_schema: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        enum: [
          'color',
          'typography',
          'spacing',
          'border',
          'shadow',
          'animation',
          'button_system',
          'all',
        ],
        description: 'Token category to retrieve',
      },
      query: {
        type: 'string',
        description: 'Optional search term to filter tokens',
      },
      include_ramps: {
        type: 'boolean',
        description:
          'Include color ramp steps for matched brand colors. Default false.',
      },
    },
    required: ['category'],
    additionalProperties: false,
  },
};

/**
 * Retrieve supplementary Shopify theme knowledge on demand.
 * Only registered when ENABLE_KNOWLEDGE_TOOL is active (core knowledge
 * stays in the system prompt; this covers Dawn conventions, diagnostics,
 * settings UX, CSS, and JS patterns).
 */
export const GET_KNOWLEDGE_TOOL: ToolDefinition = {
  name: 'get_knowledge',
  description:
    'Load supplementary Shopify theme development knowledge. Available domains: ' +
    'dawn_conventions (Dawn theme patterns), diagnostics (debugging methodology), ' +
    'settings_ux (settings schema UX), css (CSS architecture patterns), ' +
    'javascript (JS patterns). Call when working in these specific areas.',
  input_schema: {
    type: 'object',
    properties: {
      domain: {
        type: 'string',
        enum: ['dawn_conventions', 'diagnostics', 'settings_ux', 'css', 'javascript', 'all_supplementary'],
        description: 'Which knowledge domain to load',
      },
    },
    required: ['domain'],
    additionalProperties: false,
  },
};

// -- Specialist tool selection -------------------------------------------

type SpecialistType = 'liquid' | 'javascript' | 'css' | 'json' | 'schema' | 'general' | string;

const SPECIALIST_BASE_TOOL_NAMES = new Set([
  // Reading
  'read_file',
  'read_lines',
  'read_chunk',
  'extract_region',
  'list_files',
  'glob_files',
  // Search
  'search_files',
  'grep_content',
  'semantic_search',
  // Editing (search_replace & check_lint are pushed separately as standalone exports)
  'edit_lines',
  'write_file',
  'undo_edit',
  // Validation
  'validate_syntax',
  // Structural queries
  'get_dependency_graph',
  'find_references',
  'get_schema_settings',
]);

const SPECIALIST_TYPE_EXTRAS: Record<string, string[]> = {
  liquid: ['trace_rendering_chain', 'check_theme_setting', 'diagnose_visibility', 'analyze_variants'],
  css: ['inject_css'],
  javascript: ['read_console_logs'],
  json: [],
  schema: [],
  general: [],
};

/**
 * Select tools available to a specialist agent.
 * Returns a filtered subset of AGENT_TOOLS appropriate for the specialist's domain.
 */
export function selectSpecialistTools(specialistType: SpecialistType): ToolDefinition[] {
  const extras = new Set(SPECIALIST_TYPE_EXTRAS[specialistType] ?? []);
  const allowed = new Set([...SPECIALIST_BASE_TOOL_NAMES, ...extras]);

  const tools = AGENT_TOOLS.filter((t) => allowed.has(t.name));
  tools.push(CHECK_LINT_TOOL);
  tools.push(SEARCH_REPLACE_TOOL);
  return tools;
}

// -- PTC (Programmatic Tool Calling) -------------------------------------

/** PTC code execution tool type identifier. */
const CODE_EXEC_TYPE = 'code_execution_20250825';

/** Tools that can be called programmatically from code execution sandbox. */
const PTC_ELIGIBLE_TOOLS = new Set([
  'read_file',
  'read_lines',
  'search_files',
  'grep_content',
  'glob_files',
  'list_files',
  'get_dependency_graph',
  'extract_region',
  'run_diagnostics',
  'check_lint',
  'validate_syntax',
  'semantic_search',
  'edit_lines',
]);

/** Tools with large input params that benefit from eager (non-buffered) streaming. */
const EAGER_STREAMING_TOOLS = new Set([
  'propose_code_edit',
  'search_replace',
  'create_file',
  'write_file',
  'edit_lines',
]);

// -- V2 tool selection --------------------------------------------------

/**
 * Select the tools available to the PM in the v2 agent loop.
 * When PTC is enabled (default), read-only tools get allowed_callers
 * for code execution and the code_execution server tool is added.
 */
const BASE_TOOL_NAMES = new Set([
  // Reading
  'read_file',
  'search_files',
  'grep_content',
  'glob_files',
  'semantic_search',
  'extract_region',
  'list_files',
  // Structural reading
  'read_lines',
  'read_chunk',
  'parallel_batch_read',
  // Structural queries
  'get_dependency_graph',
  'find_references',
  'get_schema_settings',
  // Diagnostics (always available, not debug-only)
  'run_diagnostics',
  'analyze_variants',
  'check_performance',
  'retrieve_similar_tasks',
  'theme_check',
  'trace_rendering_chain',
  'check_theme_setting',
  'diagnose_visibility',
  // Web access
  'web_search',
  'fetch_url',
  // Shopify analysis
  'analyze_variants',
]);

const CODE_MODE_TOOL_NAMES = new Set([
  // Structural editing
  'edit_lines',
  // File management
  'write_file',
  'delete_file',
  'rename_file',
  // Recovery
  'undo_edit',
]);

const PREVIEW_TOOL_NAMES = new Set([
  'inspect_element',
  'get_page_snapshot',
  'query_selector',
  'inject_css',
  'inject_html',
  'read_console_logs',
  'screenshot_preview',
  'compare_screenshots',
]);

export function selectV2Tools(
  intentMode: string,
  hasPreview: boolean,
  enablePTC = true,
): ToolDefinition[] {
  const tools: ToolDefinition[] = [
    ...AGENT_TOOLS.filter((t) => BASE_TOOL_NAMES.has(t.name)),
    CHECK_LINT_TOOL,
    READ_PLAN_TOOL,
  ];

  if (intentMode === 'ask') {
    return enablePTC ? annotatePTC(tools) : annotateEagerStreaming(tools);
  }

  // Code/debug mode: add editing + mutation tools
  for (const t of AGENT_TOOLS) {
    if (CODE_MODE_TOOL_NAMES.has(t.name)) tools.push(t);
  }
  tools.push(PROPOSE_CODE_EDIT_TOOL);
  tools.push(SEARCH_REPLACE_TOOL);
  tools.push(CREATE_FILE_TOOL);
  tools.push(ASK_CLARIFICATION_TOOL);
  tools.push(RUN_SPECIALIST_TOOL);
  tools.push(RUN_REVIEW_TOOL);
  tools.push(GET_SECOND_OPINION_TOOL);
  tools.push(REFRESH_MEMORY_ANCHOR_TOOL);
  tools.push(RECALL_ROLE_MEMORY_TOOL);
  tools.push(GET_DESIGN_TOKENS_TOOL);

  if (AI_FEATURES.knowledgeTool) {
    tools.push(GET_KNOWLEDGE_TOOL);
  }

  if (intentMode === 'plan' || intentMode === 'summary') {
    tools.push(PROPOSE_PLAN_TOOL);
    tools.push(CREATE_PLAN_TOOL);
    tools.push(UPDATE_PLAN_TOOL);
  }

  // Preview tools (DOM inspection, CSS injection, screenshots)
  if (hasPreview) {
    tools.push(NAVIGATE_PREVIEW_TOOL);
    for (const t of AGENT_TOOLS) {
      if (PREVIEW_TOOL_NAMES.has(t.name)) tools.push(t);
    }
  }

  return enablePTC ? annotatePTC(tools) : annotateEagerStreaming(tools);
}

/**
 * Annotate PTC-eligible tools with allowed_callers, prepend the
 * code_execution server tool, and mark write-heavy tools for eager streaming.
 */
function annotatePTC(tools: ToolDefinition[]): ToolDefinition[] {
  const annotated = tools.map((t) => {
    const patches: Partial<ToolDefinition> = {};
    if (PTC_ELIGIBLE_TOOLS.has(t.name)) {
      patches.allowed_callers = [CODE_EXEC_TYPE] as ToolDefinition['allowed_callers'];
    }
    if (EAGER_STREAMING_TOOLS.has(t.name)) {
      patches.eager_input_streaming = true;
    }
    return Object.keys(patches).length > 0 ? { ...t, ...patches } : t;
  });

  annotated.unshift({
    type: CODE_EXEC_TYPE,
    name: 'code_execution',
    description:
      'Execute Python code in a sandboxed container. Can call PTC-eligible tools as async functions.',
    input_schema: {},
  });

  return annotated;
}

/**
 * Apply eager_input_streaming to write-heavy tools (non-PTC path).
 */
function annotateEagerStreaming(tools: ToolDefinition[]): ToolDefinition[] {
  return tools.map((t) =>
    EAGER_STREAMING_TOOLS.has(t.name) ? { ...t, eager_input_streaming: true } : t,
  );
}

const ORCHESTRATION_TOOL_NAMES = new Set([
  'run_specialist',
  'run_review',
  'get_second_opinion',
  'refresh_memory_anchor',
  'recall_role_memory',
]);

/**
 * Select tools for the flat coordinator (no orchestration tools).
 * Returns ~15 essential tools + mode-specific extensions.
 */
export function selectFlatTools(
  intentMode: string,
  opts: { hasPreview?: boolean; hasShopify?: boolean } = {},
): ToolDefinition[] {
  const base = selectV2Tools(intentMode, !!opts.hasPreview, false);
  return base.filter(t => !ORCHESTRATION_TOOL_NAMES.has(t.name));
}
