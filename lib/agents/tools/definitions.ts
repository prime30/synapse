import type { ToolDefinition } from '@/lib/ai/types';

// ── Coordinator tools (file analysis, used during coordinator phase) ──────

export const AGENT_TOOLS: ToolDefinition[] = [
  {
    name: 'read_file',
    description: 'Read the full content of a file by its file ID or file name.',
    input_schema: {
      type: 'object',
      properties: {
        fileId: { type: 'string', description: 'The file ID or file name to read' },
      },
      required: ['fileId'],
      additionalProperties: false,
    },
  },
  {
    name: 'search_files',
    description: 'Search across all theme file names and content for a query string. Returns matching file names and relevant excerpts.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (file name, content keyword, or natural language description)' },
        maxResults: { type: 'number', description: 'Maximum results to return (default 5)' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'validate_syntax',
    description: 'Validate the syntax of code content for Liquid, CSS, or JavaScript.',
    input_schema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The code content to validate' },
        fileType: { type: 'string', enum: ['liquid', 'css', 'javascript'], description: 'The type of code to validate' },
      },
      required: ['content', 'fileType'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_files',
    description: 'Get the full file manifest showing all file names, types, and sizes in the project.',
    input_schema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'get_dependency_graph',
    description: 'Get the dependency graph for a file (what it renders/includes and what renders/includes it).',
    input_schema: {
      type: 'object',
      properties: {
        fileId: { type: 'string', description: 'The file ID or file name to get dependencies for' },
      },
      required: ['fileId'],
      additionalProperties: false,
    },
  },

  // ── Search tools (Phase 1: Agent Tooling Upgrade) ──────────────────────
  {
    name: 'grep_content',
    description: 'Search file contents using a regex or substring pattern. Returns matching lines with file names and line numbers. Use for finding specific code patterns, variable usage, or CSS selectors.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regex or substring pattern to search for' },
        filePattern: { type: 'string', description: 'Glob pattern to filter files (e.g. "*.liquid", "assets/*.css")' },
        caseSensitive: { type: 'boolean', description: 'Case-sensitive search (default false)' },
        maxResults: { type: 'number', description: 'Max matches to return (default 50)' },
      },
      required: ['pattern'],
      additionalProperties: false,
    },
  },
  {
    name: 'glob_files',
    description: 'Find files matching a glob pattern. Returns file names, types, and sizes. Use for finding all files of a certain type or in a directory.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern (e.g. "sections/*.liquid", "assets/**/*.css", "*.json")' },
      },
      required: ['pattern'],
      additionalProperties: false,
    },
  },
  {
    name: 'semantic_search',
    description: 'Search for files by meaning and relevance. Returns ranked results with excerpts. Use when you need to find files related to a concept rather than an exact text match.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural language description of what you are looking for' },
        limit: { type: 'number', description: 'Max results (default 10)' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },

  // ── Diagnostics tool (Phase 2: Agent Tooling Upgrade) ──────────────────
  {
    name: 'run_diagnostics',
    description: 'Run syntax and type diagnostics on a file. Returns errors, warnings, and suggestions with line numbers. Use to validate code changes before committing.',
    input_schema: {
      type: 'object',
      properties: {
        fileName: { type: 'string', description: 'File name or file ID to diagnose' },
        content: { type: 'string', description: 'Optional: code content to diagnose (if omitted, reads from project files)' },
      },
      required: ['fileName'],
      additionalProperties: false,
    },
  },

  // ── Worker pool tool (Phase 3: Agent Tooling Upgrade) ──────────────────
  {
    name: 'spawn_workers',
    description: 'Spawn parallel research workers. Each worker can search files, run diagnostics, and analyze code concurrently. Use when you need to gather information from multiple sources before making a decision.',
    input_schema: {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              instruction: { type: 'string', description: 'What to research/investigate' },
              files: {
                type: 'array',
                items: { type: 'string' },
                description: 'Optional file names to scope the research',
              },
            },
            required: ['instruction'],
            additionalProperties: false,
          },
          maxItems: 4,
          description: 'Up to 4 parallel research tasks',
        },
      },
      required: ['tasks'],
      additionalProperties: false,
    },
  },

  // ── URL fetch tool ─────────────────────────────────────────────────────
  {
    name: 'fetch_url',
    description: 'Fetch a public URL and convert it to clean Markdown. Use when you need to read external documentation, reference pages, Shopify help articles, or any web content mentioned by the user. Returns ~80% fewer tokens than raw HTML.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The public HTTP/HTTPS URL to fetch (e.g. https://shopify.dev/docs/themes)' },
        method: {
          type: 'string',
          enum: ['auto', 'ai', 'browser'],
          description: 'Conversion method. "auto" (default) tries the fastest first. Use "browser" for JS-heavy SPAs.',
        },
      },
      required: ['url'],
      additionalProperties: false,
    },
  },

  // ── Web search tool (Agent Power Tools Phase 2) ─────────────────────────
  {
    name: 'web_search',
    description: 'Search the web for documentation, code patterns, Shopify references, or any other information. Returns up to 5 results with titles, URLs, and snippets. Results are cached for 1 hour.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (e.g. "shopify liquid section schema", "css grid responsive layout")' },
        maxResults: { type: 'number', description: 'Maximum results to return (default 5, max 5)' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },

  // ── Preview DOM tools (Agent Power Tools Phase 3) ──────────────────────
  {
    name: 'inspect_element',
    description: 'Query the live preview DOM with a CSS selector and return matching elements with their attributes, text content, and computed styles.',
    input_schema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector to query (e.g. ".header__logo", "#main-content", "section.hero")' },
      },
      required: ['selector'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_page_snapshot',
    description: 'Get a lightweight DOM tree snapshot of the current preview page. Returns a formatted tree structure optimized for LLM consumption (~3500 tokens max).',
    input_schema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'query_selector',
    description: 'Get detailed information about a single DOM element: tag name, attributes, computed styles, parent chain, and sibling elements.',
    input_schema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector targeting a single element' },
      },
      required: ['selector'],
      additionalProperties: false,
    },
  },
  {
    name: 'inject_css',
    description: 'Inject CSS into the live preview for testing visual changes. The CSS is applied immediately but does not persist.',
    input_schema: {
      type: 'object',
      properties: {
        css: { type: 'string', description: 'CSS rules to inject (e.g. ".header { background: red; }")' },
      },
      required: ['css'],
      additionalProperties: false,
    },
  },
  {
    name: 'inject_html',
    description: 'Inject HTML into a specific element in the live preview for testing. The HTML is applied immediately but does not persist.',
    input_schema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector of the target element' },
        html: { type: 'string', description: 'HTML content to inject' },
        position: { type: 'string', enum: ['replace', 'prepend', 'append'], description: 'Where to inject relative to the target (default: replace)' },
      },
      required: ['selector', 'html'],
      additionalProperties: false,
    },
  },

  // ── Shopify operation tools (Agent Power Tools Phase 4) ─────────────────
  {
    name: 'push_to_shopify',
    description:
      'Push all pending file changes to the connected Shopify dev theme. Automatically debounced and rate-limited.',
    input_schema: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'Brief description of what changed (for the sync log)',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'pull_from_shopify',
    description:
      'Pull the latest theme files from the connected Shopify store, overwriting local files.',
    input_schema: {
      type: 'object',
      properties: {
        themeId: {
          type: 'string',
          description: 'Optional theme ID to pull from (defaults to the dev theme)',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'list_themes',
    description:
      'List all themes on the connected Shopify store with their IDs, names, and roles (main, unpublished, development).',
    input_schema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'list_store_resources',
    description:
      'List products, collections, and pages from the connected Shopify store. Useful for understanding available content when building templates.',
    input_schema: {
      type: 'object',
      properties: {
        resourceType: {
          type: 'string',
          enum: ['products', 'collections', 'pages', 'all'],
          description: 'Type of resources to list (default: all)',
        },
        limit: {
          type: 'number',
          description: 'Maximum resources per type (default 10, max 25)',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_shopify_asset',
    description:
      'Read a specific theme asset directly from Shopify (bypassing local cache). Useful for checking the live version of a file.',
    input_schema: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'Asset key (e.g. "sections/header.liquid", "assets/theme.css")',
        },
        themeId: {
          type: 'string',
          description: 'Optional theme ID (defaults to the dev theme)',
        },
      },
      required: ['key'],
      additionalProperties: false,
    },
  },

  // ── Visual regression tools (Agent Power Tools Phase 5) ─────────────────
  {
    name: 'screenshot_preview',
    description: 'Capture a screenshot of the current preview page. Returns a storage URL (not base64). Requires a connected Shopify store with a preview theme.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'URL path to screenshot (e.g. "/", "/collections/all", "/products/example"). Defaults to "/".' },
        viewport: {
          type: 'object',
          properties: {
            width: { type: 'number', description: 'Viewport width (default 1280)' },
            height: { type: 'number', description: 'Viewport height (default 800)' },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'compare_screenshots',
    description: 'Compare two screenshot URLs for visual regression. Returns diff percentage and whether regression threshold is exceeded.',
    input_schema: {
      type: 'object',
      properties: {
        beforeUrl: { type: 'string', description: 'URL of the "before" screenshot' },
        afterUrl: { type: 'string', description: 'URL of the "after" screenshot' },
        threshold: { type: 'number', description: 'Regression threshold percentage (default 2.0)' },
      },
      required: ['beforeUrl', 'afterUrl'],
      additionalProperties: false,
    },
  },

  // ── Theme validation tools (Agent Power Tools Phase 6) ──────────────────
  {
    name: 'theme_check',
    description: 'Run comprehensive Shopify theme validation. Checks for broken references, missing assets, unclosed tags, required files, schema validation, and more. Can check a single file or the entire theme.',
    input_schema: {
      type: 'object',
      properties: {
        fileName: { type: 'string', description: 'Optional: specific file to check (omit to check entire theme)' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'generate_placeholder',
    description: 'Generate an SVG placeholder image with specified dimensions, colors, and text. Returns the SVG string that can be saved as a theme asset.',
    input_schema: {
      type: 'object',
      properties: {
        width: { type: 'number', description: 'Image width in pixels (default 800)' },
        height: { type: 'number', description: 'Image height in pixels (default 600)' },
        text: { type: 'string', description: 'Label text to display (default "Placeholder")' },
        bgColor: { type: 'string', description: 'Background color hex (default "#f5f5f4")' },
        textColor: { type: 'string', description: 'Text color hex (default "#78716c")' },
      },
      additionalProperties: false,
    },
  },

  // ── File mutation tools (Agent Power Tools Phase 1) ─────────────────────
  {
    name: 'write_file',
    description: 'Update the content of an existing project file. The file is resolved by name or path (fuzzy matching). Automatically triggers Shopify sync if connected. Maximum file size: 1MB.',
    input_schema: {
      type: 'object',
      properties: {
        fileName: { type: 'string', description: 'File name or path to write (e.g. "sections/header.liquid", "assets/custom.css")' },
        content: { type: 'string', description: 'The complete new file content' },
        reasoning: { type: 'string', description: 'Brief explanation of why this change is being made' },
      },
      required: ['fileName', 'content'],
      additionalProperties: false,
    },
  },
  {
    name: 'delete_file',
    description: 'Delete a file from the project. The file is resolved by name or path (fuzzy matching). This action cannot be undone.',
    input_schema: {
      type: 'object',
      properties: {
        fileName: { type: 'string', description: 'File name or path to delete' },
        reasoning: { type: 'string', description: 'Brief explanation of why this file should be deleted' },
      },
      required: ['fileName'],
      additionalProperties: false,
    },
  },
  {
    name: 'rename_file',
    description: 'Rename or move a file within the project. Resolves the source file by name/path (fuzzy matching).',
    input_schema: {
      type: 'object',
      properties: {
        fileName: { type: 'string', description: 'Current file name or path' },
        newFileName: { type: 'string', description: 'New file name or path' },
        reasoning: { type: 'string', description: 'Brief explanation of why the file is being renamed' },
      },
      required: ['fileName', 'newFileName'],
      additionalProperties: false,
    },
  },
];

// ── PM exploration tools (used during the pre-decision exploration phase) ──────
// A lightweight subset of AGENT_TOOLS that the PM uses to explore the codebase
// before producing its JSON decision. Read-only + diagnostics only.

export const CHECK_LINT_TOOL: ToolDefinition = {
  name: 'check_lint',
  description: 'Run syntax and lint checks on a file. Returns errors and warnings with line numbers. Use to validate code before or after changes.',
  input_schema: {
    type: 'object',
    properties: {
      fileName: { type: 'string', description: 'File name or path to check' },
      content: { type: 'string', description: 'Optional: code content to check (if omitted, reads from project files)' },
    },
    required: ['fileName'],
    additionalProperties: false,
  },
};

/** Tools available to the PM during the exploration phase (read-only + diagnostics). */
export const PM_EXPLORATION_TOOLS: ToolDefinition[] = [
  AGENT_TOOLS.find(t => t.name === 'read_file')!,
  AGENT_TOOLS.find(t => t.name === 'search_files')!,
  AGENT_TOOLS.find(t => t.name === 'grep_content')!,
  AGENT_TOOLS.find(t => t.name === 'list_files')!,
  AGENT_TOOLS.find(t => t.name === 'get_dependency_graph')!,
  CHECK_LINT_TOOL,
];

// ── Summary-phase tools (user-facing, used during the summary/response phase) ──

export const PROPOSE_PLAN_TOOL: ToolDefinition = {
  name: 'propose_plan',
  description: 'Propose an implementation plan when the user requests planning, architecture, or multi-step changes. Call this instead of writing numbered steps in plain text.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Short plan title (3-8 words)' },
      description: { type: 'string', description: 'One paragraph summary of what the plan accomplishes' },
      steps: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            number: { type: 'number' },
            text: { type: 'string', description: 'What this step does' },
            complexity: { type: 'string', enum: ['simple', 'moderate', 'complex'] },
            files: {
              type: 'array',
              items: { type: 'string' },
              description: 'File paths this step touches (optional)',
            },
          },
          required: ['number', 'text'],
          additionalProperties: false,
        },
        description: 'Ordered implementation steps (2-15 steps)',
      },
    },
    required: ['title', 'description', 'steps'],
    additionalProperties: false,
  },
};

export const PROPOSE_CODE_EDIT_TOOL: ToolDefinition = {
  name: 'propose_code_edit',
  description: 'Propose a code edit to an existing project file. Provide the complete new file content. Use this when search_replace fails repeatedly, or when making large structural changes. The user will see a diff and can approve or reject.',
  input_schema: {
    type: 'object',
    properties: {
      filePath: { type: 'string', description: 'Relative file path (e.g., sections/header.liquid)' },
      reasoning: { type: 'string', description: 'Brief explanation of the change' },
      newContent: { type: 'string', description: 'Complete new file content' },
    },
    required: ['filePath', 'newContent'],
    additionalProperties: false,
  },
};

export const ASK_CLARIFICATION_TOOL: ToolDefinition = {
  name: 'ask_clarification',
  description: 'Ask the user a clarifying question with specific options to choose from. Use when the request is ambiguous or has multiple valid approaches.',
  input_schema: {
    type: 'object',
    properties: {
      question: { type: 'string', description: 'The question to ask' },
      options: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            label: { type: 'string' },
          },
          required: ['id', 'label'],
          additionalProperties: false,
        },
        description: '2-6 options for the user to choose from',
      },
      allowMultiple: { type: 'boolean', description: 'Whether user can select multiple options (default false)' },
    },
    required: ['question', 'options'],
    additionalProperties: false,
  },
};

export const NAVIGATE_PREVIEW_TOOL: ToolDefinition = {
  name: 'navigate_preview',
  description: 'Navigate the live preview panel to a specific template or page path so the user can see the changes.',
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'URL path (e.g., /collections/all, /products/example, /cart)' },
      description: { type: 'string', description: 'Why navigating here' },
    },
    required: ['path'],
    additionalProperties: false,
  },
};

export const SEARCH_REPLACE_TOOL: ToolDefinition = {
  name: 'search_replace',
  description: 'Make a targeted edit to an existing file by replacing a specific text span. Provide enough context lines in old_text to uniquely identify the location. Prefer this over propose_code_edit for small, focused changes. If search_replace fails twice due to old_text mismatch, switch to propose_code_edit.',
  input_schema: {
    type: 'object',
    properties: {
      filePath: { type: 'string', description: 'Relative file path (e.g., sections/header.liquid)' },
      old_text: { type: 'string', description: 'Exact text to find (include 2-3 surrounding context lines for uniqueness)' },
      new_text: { type: 'string', description: 'Replacement text (must differ from old_text)' },
      reasoning: { type: 'string', description: 'Brief explanation of the change' },
    },
    required: ['filePath', 'old_text', 'new_text'],
    additionalProperties: false,
  },
};

export const CREATE_FILE_TOOL: ToolDefinition = {
  name: 'create_file',
  description: 'Create a new file in the project. The user will see the file content and can confirm or cancel.',
  input_schema: {
    type: 'object',
    properties: {
      fileName: { type: 'string', description: 'File name with path (e.g., sections/hero-banner.liquid)' },
      content: { type: 'string', description: 'Full file content' },
      reasoning: { type: 'string', description: 'Why this file is needed' },
    },
    required: ['fileName', 'content'],
    additionalProperties: false,
  },
};

// ── Plan management tools (agent-facing, persistent plans) ──────────────────

export const CREATE_PLAN_TOOL: ToolDefinition = {
  name: 'create_plan',
  description: 'Create a persistent plan with optional todos. The plan is saved to the database and shown as a card in chat.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Short plan name' },
      content: { type: 'string', description: 'Full plan content in markdown' },
      status: { type: 'string', enum: ['draft', 'active'], description: 'Plan status (default: draft)' },
      todos: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            content: { type: 'string', description: 'Todo description' },
            status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] },
          },
          required: ['content'],
        },
        description: 'Optional list of actionable todos',
      },
    },
    required: ['name', 'content'],
    additionalProperties: false,
  },
};

export const UPDATE_PLAN_TOOL: ToolDefinition = {
  name: 'update_plan',
  description: 'Update an existing plan. Requires expectedVersion for conflict detection.',
  input_schema: {
    type: 'object',
    properties: {
      planId: { type: 'string', description: 'Plan ID to update' },
      expectedVersion: { type: 'number', description: 'Current version of the plan (for conflict detection)' },
      name: { type: 'string' },
      content: { type: 'string' },
      status: { type: 'string', enum: ['draft', 'active', 'archived'] },
      addTodos: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            content: { type: 'string', description: 'Todo description' },
          },
          required: ['content'],
        },
        description: 'New todos to add to the plan',
      },
      removeTodoIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'IDs of todos to remove from the plan',
      },
      todoStatusChanges: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            todoId: { type: 'string', description: 'Todo ID to update' },
            status: { type: 'string', enum: ['pending', 'in_progress', 'completed'], description: 'New status' },
          },
          required: ['todoId', 'status'],
        },
        description: 'Status changes for existing todos',
      },
    },
    required: ['planId', 'expectedVersion'],
    additionalProperties: false,
  },
};

export const READ_PLAN_TOOL: ToolDefinition = {
  name: 'read_plan',
  description: "Read a plan's full content and todos to use as context for implementation.",
  input_schema: {
    type: 'object',
    properties: {
      planId: { type: 'string', description: 'Plan ID to read' },
    },
    required: ['planId'],
    additionalProperties: false,
  },
};

/** All summary-phase tools. */
export const SUMMARY_TOOLS: ToolDefinition[] = [
  PROPOSE_PLAN_TOOL,
  PROPOSE_CODE_EDIT_TOOL,
  SEARCH_REPLACE_TOOL,
  ASK_CLARIFICATION_TOOL,
  NAVIGATE_PREVIEW_TOOL,
  CREATE_FILE_TOOL,
  CREATE_PLAN_TOOL,
  UPDATE_PLAN_TOOL,
  READ_PLAN_TOOL,
];

/**
 * Select which summary-phase tools to include based on context.
 * All tools are always available — intent mode is a preference, not a capability gate.
 * The agent decides which tools to use based on the conversation.
 */
export function selectToolsForRequest(
  _intentMode: string,
  _request: string,
  hasPreview: boolean,
): ToolDefinition[] {
  const tools: ToolDefinition[] = [
    ASK_CLARIFICATION_TOOL,
    PROPOSE_PLAN_TOOL,
    PROPOSE_CODE_EDIT_TOOL,
    SEARCH_REPLACE_TOOL,
    CREATE_FILE_TOOL,
  ];

  if (hasPreview) {
    tools.push(NAVIGATE_PREVIEW_TOOL);
  }

  return tools;
}
