/**
 * V2 Agent Architecture - Tool Definitions
 *
 * These tools are available to the PM in the v2 streaming agent loop.
 * The key additions over v1 are `run_specialist` and `run_review`,
 * which let the PM delegate to specialist agents inline during the loop
 * instead of requiring a separate orchestrated pipeline.
 */
import type { ToolDefinition } from '@/lib/ai/types';
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
    'Delegate a scoped coding task to a specialist agent. Use this for complex domain-specific edits ' +
    'that benefit from specialist knowledge (Liquid templating, CSS styling, JavaScript logic, JSON schema). ' +
    'The specialist will generate code changes that the user sees as diffs. ' +
    'You receive a summary of what changed so you can continue planning.',
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

// -- PTC (Programmatic Tool Calling) -------------------------------------

/** PTC code execution tool type identifier. */
const CODE_EXEC_TYPE = 'code_execution_20250825';

/** Tools that can be called programmatically from code execution sandbox. */
const PTC_ELIGIBLE_TOOLS = new Set([
  'read_file',
  'search_files',
  'grep_content',
  'glob_files',
  'list_files',
  'get_dependency_graph',
  'run_diagnostics',
  'check_lint',
  'validate_syntax',
  'semantic_search',
]);

/** Tools with large input params that benefit from eager (non-buffered) streaming. */
const EAGER_STREAMING_TOOLS = new Set([
  'propose_code_edit',
  'search_replace',
  'create_file',
  'write_file',
]);

// -- V2 tool selection --------------------------------------------------

/**
 * Select the tools available to the PM in the v2 agent loop.
 * When PTC is enabled (default), read-only tools get allowed_callers
 * for code execution and the code_execution server tool is added.
 */
export function selectV2Tools(
  intentMode: string,
  hasPreview: boolean,
  enablePTC = true,
): ToolDefinition[] {
  const tools: ToolDefinition[] = [
    ...AGENT_TOOLS.filter(
      (t) =>
        t.name === 'read_file' ||
        t.name === 'search_files' ||
        t.name === 'grep_content' ||
        t.name === 'glob_files' ||
        t.name === 'semantic_search' ||
        t.name === 'list_files' ||
        t.name === 'get_dependency_graph' ||
        t.name === 'run_diagnostics',
    ),
    CHECK_LINT_TOOL,
    READ_PLAN_TOOL,
  ];

  if (intentMode === 'ask') {
    return enablePTC ? annotatePTC(tools) : annotateEagerStreaming(tools);
  }

  tools.push(PROPOSE_CODE_EDIT_TOOL);
  tools.push(SEARCH_REPLACE_TOOL);
  tools.push(CREATE_FILE_TOOL);
  tools.push(ASK_CLARIFICATION_TOOL);
  tools.push(RUN_SPECIALIST_TOOL);
  tools.push(RUN_REVIEW_TOOL);
  tools.push(GET_SECOND_OPINION_TOOL);

  // Keep planning explicit: only expose propose_plan and plan mutation tools in plan mode.
  // This prevents code/debug turns from looping back into planning.
  if (intentMode === 'plan' || intentMode === 'summary') {
    tools.push(PROPOSE_PLAN_TOOL);
    tools.push(CREATE_PLAN_TOOL);
    tools.push(UPDATE_PLAN_TOOL);
  }

  if (hasPreview) {
    tools.push(NAVIGATE_PREVIEW_TOOL);
  }

  if (intentMode === 'debug') {
    const themeCheck = AGENT_TOOLS.find((t) => t.name === 'theme_check');
    if (themeCheck) tools.push(themeCheck);
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
