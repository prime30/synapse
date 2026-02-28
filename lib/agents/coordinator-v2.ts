/**
 * V2 Streaming Coordinator — single-stream iterative agent loop.
 *
 * Replaces the two-phase pipeline (PM analysis → Summary) with a single
 * tool-using agent loop: think → tool → observe → repeat.
 *
 * Key differences from v1 (streamAgentLoop in coordinator.ts):
 *   - Single streaming loop — no separate summary phase
 *   - Uses v2 tool definitions (includes `run_specialist` and `run_review`)
 *   - Uses v2 PM prompt (tool-enabled, natural-language output)
 *   - All request modes (ask, code, plan, debug) route through streamV2
 *   - Specialist delegation via `run_specialist` tool during the loop
 *   - Review via `run_review` tool during the loop
 */

import type {
  AgentResult,
  CodeChange,
  FileContext,
  ReviewResult,
  UserPreference,
  ElementHint,
  OrchestrationActivitySignal,
} from '@/lib/types/agent';
import type {
  AIMessage,
  AICompletionOptions,
  AIToolCompletionResult,
  ToolStreamEvent,
  ToolStreamResult,
  ToolDefinition,
  ToolResult,
  ToolCall as AIToolCall,
} from '@/lib/ai/types';
import { AI_FEATURES } from '@/lib/ai/feature-flags';
import { AIProviderError } from '@/lib/ai/errors';
import { ContextEngine, getProjectContextEngine, contextBudgetMultiplier } from '@/lib/ai/context-engine';
import { SymbolGraphCache } from '@/lib/context/symbol-graph-cache';
import { DependencyGraphCache } from '@/lib/context/dependency-graph-cache';
import type { ThemeDependencyGraph } from '@/lib/context/cross-language-graph';
import type { FileContext as GraphFileContext } from '@/lib/context/types';
import { getAIProvider } from '@/lib/ai/get-provider';
import { isToolProvider } from './base';
import type { AIAction } from './model-router';
import { getProviderForModel, resolveModel } from './model-router';
import {
  saveAfterPM as checkpointSaveAfterPM,
  saveAfterSpecialist as checkpointSaveAfterSpecialist,
  saveAfterReview as checkpointSaveAfterReview,
  getCheckpoint,
  clearCheckpoint,
  createDeadlineTracker,
  isBackgroundResumeEnabled,
  type CheckpointData,
} from './checkpoint';
import { classifyRequest, escalateTier, type RoutingTier } from './classifier';
import {
  shouldRequirePlanModeFirst,
  buildPlanModeRequiredMessage,
  hasPlanApprovalSignal,
  buildMaximumEffortPolicyMessage,
} from './orchestration-policy';
import { verifyChanges, mergeThemeCheckIssues } from './verification';
import { validateChangeSet } from './validation/change-set-validator';
import { enforceRequestBudget } from '@/lib/ai/request-budget';
import { runThemeCheck } from './tools/theme-check';
import { buildThemePlanArtifact } from './theme-plan-artifact';
import { ensureCompletionResponseSections } from './completion-format-guard';
import {
  createExecution,
  updateExecutionStatus,
  persistExecution,
  setReviewResult,
  addMessage,
  storeChanges,
} from './execution-store';
import { learnFromExecution, extractQueryTerms } from '@/lib/ai/term-mapping-learner';
import { estimateTokens } from '@/lib/ai/token-counter';
import { persistToolTurn } from '@/lib/ai/message-persistence';
import { recordTierMetrics } from '@/lib/telemetry/tier-metrics';
import { selectV2Tools } from './tools/v2-tool-definitions';
import { TOOL_THRESHOLDS, CONTEXT_EDITING } from './tools/constants';
import { type ToolExecutorContext } from './tools/tool-executor';
import { type V2ToolExecutorContext } from './tools/v2-tool-executor';
import { dispatchToolCall, type UnifiedToolContext } from './tools/dispatcher';
import { FileStore } from './tools/file-store';
import { chunkFile, type ASTChunk } from '@/lib/parsers/ast-chunker';
// expandKeepExisting moved to tool-executor.ts (propose_code_edit case)
import { SpecialistLifecycleTracker } from './specialist-lifecycle';
import {
  defaultSpecialistReactionRules,
  evaluateSpecialistReactions,
} from './reaction-rules';
import { parseHandoff } from './handoff-parser';
import {
  createWorktree,
  getWorktreeSummary,
  mergeMultipleWorktrees,
} from './worktree/worktree-manager';
import {
  V2_PM_SYSTEM_PROMPT,
  V2_CODE_OVERLAY,
  V2_PLAN_OVERLAY,
  V2_DEBUG_OVERLAY,
  V2_ASK_OVERLAY,
  V2_GOD_MODE_OVERLAY,
  STRATEGY_SELECTION_BLOCK,
  getModelOverlay,
} from './prompts/v2-pm-prompt';
import { extractStrategy, getStrategyFromTier, type ExecutionStrategy } from './strategy';
import type { LoadContentFn } from '@/lib/supabase/file-loader';
import {
  isSectionFile,
  contentWithSchemaSummary,
  contentMarkupOnly,
  contentSchemaOnly,
} from '@/lib/liquid/schema-stripper';
import { recordHistogram } from '@/lib/observability/metrics';
import { getFileTree } from '@/lib/supabase/shopify-file-tree';
import type { ShopifyFileTree, ShopifyFileTreeEntry } from '@/lib/supabase/shopify-file-tree';
import { buildUnifiedStyleProfile } from '@/lib/ai/style-profile-builder';
import { PatternLearning } from '@/lib/agents/pattern-learning';
import { extractTargetRegion } from './tools/region-extractor';
export { extractTargetRegion };

// ── Constants ───────────────────────────────────────────────────────────────

/** Iteration limits per intent mode (max tool-use rounds per run). Cursor-like: generous for code/debug. */
const ITERATION_LIMITS: Record<string, number> = {
  ask: 36,
  code: 40,
  plan: 36,
  debug: 48,
};

/** Total timeout for the entire streamV2 execution. Env AGENT_TOTAL_TIMEOUT_MS overrides (e.g. 1800000 = 30 min). */
const TOTAL_TIMEOUT_MS = Number(process.env.AGENT_TOTAL_TIMEOUT_MS) || 1_800_000; // 30 min default

/** Max characters for a single tool result before truncation. 100K = functionally no-limit for theme files. */
const MAX_TOOL_RESULT_CHARS = 100_000;

/** Timeout for the first byte of a streaming response before falling back to batch. */
const STREAM_FIRST_BYTE_TIMEOUT_MS = 30_000;

/** How long to keep streaming marked as broken before retrying. */
const STREAM_HEALTH_TTL_MS = 5 * 60_000;

let v2StreamBroken = false;
let v2StreamBrokenAt = 0;

function isV2StreamBroken(): boolean {
  if (!v2StreamBroken) return false;
  if (Date.now() - v2StreamBrokenAt > STREAM_HEALTH_TTL_MS) {
    v2StreamBroken = false;
    v2StreamBrokenAt = 0;
    return false;
  }
  return true;
}

function markV2StreamBroken(): void {
  v2StreamBroken = true;
  v2StreamBrokenAt = Date.now();
  console.warn('[V2-StreamHealth] Streaming marked broken (TTL=5m)');
}

async function raceFirstByteV2(
  streamResult: ToolStreamResult,
  timeoutMs: number,
): Promise<ToolStreamResult | null> {
  if (timeoutMs <= 0) return streamResult;
  const reader = streamResult.stream.getReader();
  const readPromise = reader.read().then(({ done, value }) => (done ? null : value ?? null));
  const timeoutPromise = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), timeoutMs));
  const winner = await Promise.race([readPromise, timeoutPromise]);
  if (winner === 'timeout') {
    try { reader.cancel(); } catch { /* ignore */ }
    reader.releaseLock();
    return null;
  }
  const firstEvent = winner as ToolStreamEvent | null;
  reader.releaseLock();
  if (!firstEvent) return streamResult;
  const originalStream = streamResult.stream;
  const prependedStream = new ReadableStream<ToolStreamEvent>({
    async start(controller) {
      controller.enqueue(firstEvent!);
      const innerReader = originalStream.getReader();
      try {
        while (true) {
          const { done, value } = await innerReader.read();
          if (done) break;
          controller.enqueue(value);
        }
      } catch (err) { controller.error(err); }
      finally { innerReader.releaseLock(); controller.close(); }
    },
  });
  return { ...streamResult, stream: prependedStream, getUsage: streamResult.getUsage };
}

const LOOKUP_TOOL_NAMES = new Set([
  'read_file',
  'search_files',
  'grep_content',
  'glob_files',
  'semantic_search',
  'list_files',
  'get_dependency_graph',
]);
const MUTATING_TOOL_NAMES = new Set([
  'propose_code_edit',
  'search_replace',
  'create_file',
  'edit_lines',
  'write_file',
  'delete_file',
  'rename_file',
  'undo_edit',
]);

const PRE_EDIT_LOOKUP_BUDGET = 24;
const PRE_EDIT_BLOCK_THRESHOLD = 16;
const PRE_EDIT_ENFORCEMENT_ABORT_THRESHOLD = 6;
const REFERENTIAL_PRE_EDIT_LOOKUP_BUDGET = 4;
const REFERENTIAL_PRE_EDIT_BLOCK_THRESHOLD = 8;
const GOD_MODE_PRE_EDIT_LOOKUP_BUDGET = 8;
const GOD_MODE_PRE_EDIT_BLOCK_THRESHOLD = 4;
const READ_LINES_DUPLICATE_PRE_EDIT_LIMIT = 1;
const POST_EDIT_STAGNATION_THRESHOLD = 2;
const POST_EDIT_TOOL_BUDGET_SOFT_CAP = 14;
const CODE_ZERO_TOOL_STREAK_LIMIT = 2;
const QUICK_EDIT_MAX_PRELOADED_FILES = 6;
const QUICK_EDIT_MAX_SCOUT_TARGETS_PER_FILE = 4;
const QUICK_EDIT_MAX_LARGE_PREVIEW_CHARS = 6_000;
const QUICK_EDIT_MAX_INLINE_FILE_CHARS = 6_000;
const FIRST_EDIT_TOOL_CALL_SLA = 8;
const FIRST_EDIT_TOOL_CALL_ABORT = 14;

/** Tool call cap: 0 = no cap; iteration limit and timeout guard the run. */
const MAX_TOOL_CALLS = 0;

export interface MutationFailure {
  toolName: 'search_replace' | 'write_file' | 'propose_code_edit' | 'create_file';
  filePath: string;
  reason: 'old_text_not_found' | 'file_not_found' | 'validation_error' | 'unknown';
  attemptedOldText?: string;
  attemptCount: number;
  fileLineCount?: number;
}

/**
 * Builds a completion summary when a code-mode turn ends with no changes applied.
 * Always produces output — the user must never see an empty failure state.
 * Returns null only if fullText already contains a detailed breakdown.
 */
function buildCompletionSummary(
  fullText: string,
  toolSequenceLog: string[],
  iterations: number,
  lastFailure: MutationFailure | null,
  hasAttemptedEdit: boolean,
): string | null {
  const lower = fullText.toLowerCase();
  const alreadyHasSummary =
    (lower.includes('**what i tried') && lower.includes('**what went wrong')) ||
    (lower.includes('### what i\'ve changed') && lower.includes('### why'));
  if (alreadyHasSummary) return null;

  const parts: string[] = ['---', ''];

  const editTools = ['search_replace', 'edit_lines', 'write_file', 'propose_code_edit', 'create_file'];
  const readTools = ['read_file', 'read_lines', 'grep_search', 'grep_content', 'list_files', 'search_files'];
  const usedEditTools = [...new Set(toolSequenceLog.filter(t => editTools.includes(t)))];
  const usedReadTools = [...new Set(toolSequenceLog.filter(t => readTools.includes(t)))];
  const toolList = [...usedReadTools, ...usedEditTools];

  if (toolList.length > 0) {
    parts.push(`**What I tried:** ${toolList.join(', ')} across ${iterations} iteration(s).`);
  } else if (iterations > 0) {
    parts.push(`**What I tried:** Analyzed the request over ${iterations} iteration(s) but did not reach a concrete edit.`);
  }

  if (lastFailure) {
    const file = lastFailure.filePath || 'unknown file';
    const reason =
      lastFailure.reason === 'old_text_not_found'
        ? `Could not match the target text in \`${file}\` (${lastFailure.attemptCount} attempt(s)). The file content may differ from what I expected.`
        : lastFailure.reason === 'file_not_found'
          ? `File \`${file}\` was not found in the project.`
          : `Edit rejected for \`${file}\` — ${lastFailure.reason}.`;
    parts.push(`**What went wrong:** ${reason}`);
  } else if (hasAttemptedEdit) {
    parts.push('**What went wrong:** Edits were attempted but none produced a net change (possibly reverted by validation).');
  } else {
    parts.push('**What went wrong:** Could not determine a concrete edit target from the available context.');
  }

  parts.push(
    '**How to proceed:** You can rephrase the request with a specific file or section name, ' +
    'paste the exact code you want changed, or ask me to try a different approach.',
  );

  return '\n\n' + parts.join('\n');
}

export function parseReviewToolContent(content: string): ReviewResult | null {
  if (!content || !/^Review\s+(APPROVED|NEEDS CHANGES)/m.test(content)) return null;

  const lines = content.split(/\r?\n/);
  const approved = /^Review\s+APPROVED/i.test(lines[0] ?? '');
  const issues: ReviewResult['issues'] = [];

  let summary = '';
  let inIssues = false;
  for (const rawLine of lines.slice(1)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^Issues\s*\(\d+\):/i.test(line)) {
      inIssues = true;
      continue;
    }
    if (!inIssues && !summary) {
      summary = line;
      continue;
    }
    if (!inIssues) continue;

    const match = line.match(/^- \[(error|warning|info)\]\s+(.+?):\s+(.+)$/i);
    if (!match) continue;
    const sev = match[1].toLowerCase();
    const severity: 'error' | 'warning' | 'info' =
      sev === 'error' || sev === 'warning' || sev === 'info' ? sev : 'info';
    issues.push({
      severity,
      file: match[2].trim(),
      description: match[3].trim(),
      category: 'consistency',
    });
  }

  return {
    approved,
    summary: summary || (approved ? 'Review approved.' : 'Review needs changes.'),
    issues,
  };
}

function buildLookupSignature(toolName: string, input: Record<string, unknown> | undefined): string | null {
  const payload = input ?? {};
  switch (toolName) {
    case 'read_file': {
      const fileId = String(payload.fileId ?? '').trim().toLowerCase();
      return fileId ? `read_file:${fileId}` : null;
    }
    case 'search_files': {
      const query = String(payload.query ?? '').trim().toLowerCase();
      const max = Number(payload.maxResults ?? 5);
      return query ? `search_files:${query}:${max}` : null;
    }
    case 'grep_content': {
      const pattern = String(payload.pattern ?? '').trim();
      const fp = String(payload.filePattern ?? '').trim().toLowerCase();
      const cs = Boolean(payload.caseSensitive);
      const max = Number(payload.maxResults ?? 50);
      return pattern ? `grep_content:${pattern}:${fp}:${cs}:${max}` : null;
    }
    case 'glob_files': {
      const pattern = String(payload.pattern ?? '').trim().toLowerCase();
      return pattern ? `glob_files:${pattern}` : null;
    }
    case 'semantic_search': {
      const query = String(payload.query ?? '').trim().toLowerCase();
      const limit = Number(payload.limit ?? 5);
      return query ? `semantic_search:${query}:${limit}` : null;
    }
    case 'list_files':
      return 'list_files';
    case 'get_dependency_graph': {
      const fileId = String(payload.fileId ?? '').trim().toLowerCase();
      return fileId ? `get_dependency_graph:${fileId}` : null;
    }
    default:
      return null;
  }
}

/** No-op — kept for backward compat with benchmark test imports. */
export function resetV2StreamHealth(): void { /* no-op */ }

/**
 * Tools executed server-side — results are fed back into the agent loop.
 * Client tools (propose_code_edit, search_replace, etc.) are forwarded to the UI.
 */
const V2_SERVER_TOOLS = new Set([
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
  // Structural editing (formerly client tools, now unified via dispatcher)
  'read_lines',
  'edit_lines',
  'extract_region',
  'read_chunk',
  'parallel_batch_read',
  'find_references',
  'get_schema_settings',
  // File mutation (formerly client tools, now unified via dispatcher)
  'search_replace',
  'write_file',
  'create_file',
  'delete_file',
  'rename_file',
  'undo_edit',
  'propose_code_edit',
  // Other server tools
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

// V2_ONLY_TOOLS removed — routing is handled by dispatcher.ts

// ── Module-level caches ─────────────────────────────────────────────────────

const symbolGraphCache = new SymbolGraphCache();
const dependencyGraphCache = new DependencyGraphCache();



// ── Prompt file extraction ────────────────────────────────────────────────────

/**
 * Extract file references from the user's prompt and resolve them to FileContext.
 * Matches explicit paths (e.g., "product-thumbnail.liquid") and keyword fuzzy match.
 */
function extractPromptMentionedFiles(
  userRequest: string,
  files: FileContext[],
): FileContext[] {
  const matched: FileContext[] = [];
  const matchedIds = new Set<string>();

  // Explicit file paths: anything.liquid, .css, .js, .json, .scss
  const explicitRe = /[\w./-]+\.(liquid|css|js|json|scss)/gi;
  const explicitMatches = userRequest.match(explicitRe) ?? [];
  for (const ref of explicitMatches) {
    const normalized = ref.replace(/\\/g, '/').toLowerCase();
    const file = files.find(
      f =>
        f.fileName.toLowerCase() === normalized ||
        f.path?.toLowerCase() === normalized ||
        f.fileName.toLowerCase().endsWith(normalized),
    );
    if (file && !matchedIds.has(file.fileId)) {
      matched.push(file);
      matchedIds.add(file.fileId);
    }
  }

  // Keyword fuzzy match against file names (2+ keyword hits)
  const stopWords = new Set([
    'the', 'this', 'that', 'with', 'from', 'have', 'been', 'should',
    'would', 'could', 'when', 'what', 'where', 'which', 'their',
    'about', 'after', 'before', 'between', 'each', 'every', 'into',
    'through', 'during', 'using', 'make', 'like', 'also', 'just',
    'only', 'some', 'them', 'than', 'then', 'very', 'well', 'here',
    'there', 'does', 'show', 'create', 'adding', 'find',
  ]);
  const keywords = userRequest
    .toLowerCase()
    .replace(/[^a-z0-9\s\-_]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopWords.has(w));

  for (const file of files) {
    if (matchedIds.has(file.fileId)) continue;
    const fn = file.fileName.toLowerCase().replace(/[_.\-]/g, ' ');
    const hits = keywords.filter(kw => fn.includes(kw));
    if (hits.length >= 2) {
      matched.push(file);
      matchedIds.add(file.fileId);
    }
  }

  return matched.slice(0, 6);
}

// ── Fast Edit Path ────────────────────────────────────────────────────────────

/**
 * Detect if a request qualifies for the fast edit path:
 * - Intent mode is 'code'
 * - Tier is SIMPLE
 * - At least one target file is pre-loaded with content
 * - Prompt doesn't contain investigation keywords
 *
 * Fast edit path sets MAX_ITERATIONS=2 and adds a system instruction
 * to complete in a single pass.
 */
function isFastEditEligible(
  intentMode: string,
  tier: RoutingTier,
  userRequest: string,
  preloaded: FileContext[],
): boolean {
  if (intentMode !== 'code') return false;
  if (tier !== 'SIMPLE' && tier !== 'TRIVIAL') return false;

  const hasPreloadedContent = preloaded.some(
    f => f.content && !f.content.startsWith('[') && f.content.length > 10,
  );
  if (!hasPreloadedContent) return false;

  const investigationRe = /\b(find|investigate|debug|diagnose|check|why|trace|root cause|not (?:showing|working|loading|updating)|broken|missing|error)\b/i;
  if (investigationRe.test(userRequest)) return false;

  return true;
}

const FAST_EDIT_SYSTEM_SUFFIX = `

## FAST EDIT MODE

You have ONE turn to complete this task. The target file is pre-loaded in your context.
- Make the edit immediately using search_replace or propose_code_edit.
- Do NOT call read_file, search_files, grep_content, list_files, or glob_files.
- After editing, call check_lint on the modified file.
- Be precise and complete in a single response.`;

/**
 * File Context Rule: Reject code changes to files not loaded in context.
 * Prevents agents from hallucinating changes to files they have not seen.
 * Ported from coordinator.ts for v2 use.
 */
function enforceFileContextRule(
  changes: CodeChange[],
  contextFiles: FileContext[],
  readFiles?: Set<string>,
): { allowed: CodeChange[]; rejected: CodeChange[] } {
  const contextFileNames = new Set(contextFiles.map((f) => f.fileName));
  const contextFileIds = new Set(contextFiles.map((f) => f.fileId));

  const allowed: CodeChange[] = [];
  const rejected: CodeChange[] = [];

  for (const change of changes) {
    const isNewFile = change.fileId.startsWith('new_');
    const inContext = contextFileNames.has(change.fileName) || contextFileIds.has(change.fileId);
    const wasRead = readFiles?.has(change.fileName) || readFiles?.has(change.fileId);
    if (isNewFile || inContext || wasRead) {
      allowed.push(change);
    } else {
      rejected.push(change);
    }
  }

  return { allowed, rejected };
}

// ── Options interface ───────────────────────────────────────────────────────

export interface ReferentialArtifact {
  filePath: string;
  newContent: string;
  reasoning?: string;
  capturedAt?: string;
  checksum?: string;
  confidence?: number;
  sourceExecutionId?: string;
}

export interface V2CoordinatorOptions {
  sessionId?: string;
  intentMode?: 'code' | 'ask' | 'plan' | 'debug';
  isReferentialCodePrompt?: boolean;
  referentialArtifacts?: ReferentialArtifact[];
  model?: string;
  /** Bypasses ALL model routing (action, tier, agent defaults). For benchmarks. */
  forcedModel?: string;
  /** Max Quality mode: force Opus for all agents including specialists. */
  maxQuality?: boolean;
  /** Execution strategy override (normally auto-detected from PM's first response). */
  strategy?: ExecutionStrategy;
  /** Internal: forced tier from escalation retry. Skips classification. */
  _tierOverride?: RoutingTier;
  /** Internal: escalation depth counter to prevent infinite recursion. */
  _escalationDepth?: number;
  /** Internal: use lean pipeline (feature flag). */
  _useLeanPipeline?: boolean;
  domContext?: string;
  memoryContext?: string;
  diagnosticContext?: string;
  activeFilePath?: string;
  openTabs?: string[];
  recentMessages?: string[];
  /** Structured history with tool metadata (preferred over recentMessages). */
  recentHistory?: AIMessage[];
  loadContent?: LoadContentFn;
  elementHint?: ElementHint;
  onProgress?: (event: {
    type: string;
    phase?: string;
    subPhase?: string;
    label?: string;
    detail?: string;
    [key: string]: unknown;
  }) => void;
  onContentChunk?: (chunk: string) => void;
  onToolEvent?: (event: {
    type: string;
    name: string;
    id: string;
    toolCallId?: string;
    input?: Record<string, unknown>;
    result?: string;
    isError?: boolean;
    error?: string;
    recoverable?: boolean;
    netZero?: boolean;
    /** Structured card data for rich UI rendering (file reads, grep, lint, etc). */
    data?: Record<string, unknown>;
    /** LLM reasoning/thinking text captured before this tool call. */
    reasoning?: string;
    progress?: {
      phase: string;
      detail: string;
      bytesProcessed?: number;
      totalBytes?: number;
      matchCount?: number;
      lineNumber?: number;
      percentage?: number;
    };
  }) => void;
  onReasoningChunk?: (agent: string, chunk: string) => void;
  /** Max parallel specialists (1–8). Default 6. */
  maxParallelSpecialists?: number;
  /** Shopify connection ID for Shopify API tools. */
  shopifyConnectionId?: string;
  /** Shopify theme ID for Shopify API tools. */
  themeId?: string;
  /** User-attached images (base64 + mimeType) for multimodal input. */
  images?: Array<{ base64: string; mimeType: string }>;
  /** Wall-clock deadline in ms since epoch. Used for checkpoint timing. */
  deadlineMs?: number;
}

// ── V2 Context Builder ──────────────────────────────────────────────────────

interface V2Context {
  preloaded: FileContext[];
  allFiles: FileContext[];
  manifest: string;
  graph?: ThemeDependencyGraph;
  symbolMatchedFiles: string[];
}

/**
 * Build file context for the v2 loop.
 *
 * Uses ContextEngine to select the most relevant files based on the user's
 * request, then hydrates them via loadContent if available. Also builds a
 * file manifest listing all project files with sizes for the agent's awareness.
 */
async function buildV2Context(
  projectId: string,
  files: FileContext[],
  userRequest: string,
  options: V2CoordinatorOptions,
  tier: RoutingTier = 'SIMPLE',
  strategy: ExecutionStrategy = 'HYBRID',
  slim = false,
): Promise<V2Context> {
  // Phase 2: Extract files mentioned in the user prompt
  const promptMentionedFiles = extractPromptMentionedFiles(userRequest, files);

  // TRIVIAL tier: skip full context engine, just use prompt-mentioned files
  if (tier === 'TRIVIAL' && promptMentionedFiles.length > 0) {
    let preloaded = promptMentionedFiles;
    if (options.loadContent && preloaded.length > 0) {
      const idsToHydrate = preloaded.filter(f => !f.content || f.content.startsWith('[')).map(f => f.fileId);
      if (idsToHydrate.length > 0) {
        const hydrated = await options.loadContent(idsToHydrate);
        const hydratedMap = new Map(hydrated.map((f: FileContext) => [f.fileId, f]));
        preloaded = preloaded.map(f => hydratedMap.get(f.fileId) ?? f);
      }
    }
    const manifest = files.length + ' files in project (trivial edit — context skipped)';
    return { preloaded, allFiles: files, manifest, symbolMatchedFiles: [] };
  }

  // ── Slim context path: active file + prompt-mentioned + 1 level of deps ──
  if (slim) {
    const slimStart = Date.now();
    let preloaded: FileContext[] = [];
    const addedIds = new Set<string>();

    // Active file (guaranteed)
    if (options.activeFilePath) {
      const active = files.find(f => f.path === options.activeFilePath || f.fileName === options.activeFilePath);
      if (active && !addedIds.has(active.fileId)) {
        preloaded.push(active);
        addedIds.add(active.fileId);
      }
    }

    // Prompt-mentioned files
    for (const pmf of promptMentionedFiles) {
      if (!addedIds.has(pmf.fileId)) {
        preloaded.push(pmf);
        addedIds.add(pmf.fileId);
      }
    }

    // 1 level of direct deps: parse render/include/section/asset_url from loaded files
    const renderRefPattern = /\{%[-\s]*(?:render|include|section)\s+['"]([^'"]+)['"]/g;
    const assetRefPattern = /['"]([^'"]+\.(?:js|css|liquid))['"]\s*\|\s*asset_url/g;
    const filesByName = new Map(files.map(f => [f.fileName, f]));
    const filesByPath = new Map(files.filter(f => f.path).map(f => [f.path!, f]));
    const resolveRef = (ref: string): FileContext | undefined =>
      filesByName.get(ref) ?? filesByPath.get(ref)
      ?? files.find(f => f.fileName.endsWith('/' + ref) || f.path?.endsWith('/' + ref));

    const seedFiles = [...preloaded];
    for (const file of seedFiles) {
      if (!file.content || file.content.startsWith('[')) continue;
      for (const pattern of [renderRefPattern, assetRefPattern]) {
        pattern.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = pattern.exec(file.content)) !== null) {
          const ref = m[1];
          const variants = [ref, `snippets/${ref}`, `snippets/${ref}.liquid`, `sections/${ref}.liquid`, `assets/${ref}`];
          for (const v of variants) {
            const dep = resolveRef(v);
            if (dep && !addedIds.has(dep.fileId)) {
              preloaded.push(dep);
              addedIds.add(dep.fileId);
              break;
            }
          }
        }
      }
      if (preloaded.length >= 20) break;
    }

    // Cap at 20
    preloaded = preloaded.slice(0, 20);

    // Hydrate files missing content
    if (options.loadContent && preloaded.length > 0) {
      const idsToHydrate = preloaded.filter(f => !f.content || f.content.startsWith('[')).map(f => f.fileId);
      if (idsToHydrate.length > 0) {
        const hydrated = await options.loadContent(idsToHydrate);
        const hydratedMap = new Map(hydrated.map((f: FileContext) => [f.fileId, f]));
        preloaded = preloaded.map(f => hydratedMap.get(f.fileId) ?? f);
      }
    }

    const activeLabel = options.activeFilePath?.split('/').pop() ?? 'unknown';
    const manifest = `${files.length} files in project (slim context — active: ${activeLabel})`;
    console.log(`[SlimCtx] Built in ${Date.now() - slimStart}ms: ${preloaded.length} files (active + ${preloaded.length - 1} deps)`);
    return { preloaded, allFiles: files, manifest, symbolMatchedFiles: [] };
  }

    // Index all files into the context engine
  const contextEngine = getProjectContextEngine(projectId);
  const indexStart = Date.now();
  await contextEngine.indexFiles(files);
  recordHistogram('agent.context_index_ms', Date.now() - indexStart).catch(() => {});

  // Select relevant files (top N based on request + active file)
  const result = contextEngine.selectRelevantFiles(
    userRequest,
    options.recentMessages,
    options.activeFilePath,
  );

  let preloaded = result.files;
  const graphMatchedIds: string[] = [];
  let symbolMatchedFileNames: string[] = [];

  // Graph-first retrieval: include symbol-matched files before generic fallback.
  try {
    const graphFiles: GraphFileContext[] = files.map((f) => ({
      fileId: f.fileId,
      fileName: f.fileName,
      fileType: f.fileType,
      content: f.content,
      sizeBytes: f.content.length,
      lastModified: new Date(),
      dependencies: { imports: [], exports: [], usedBy: [] },
    }));
    const { graph } = await symbolGraphCache.getOrCompute(projectId, graphFiles);
    const graphLookupLimit = strategy === 'GOD_MODE' ? 30 : tier === 'TRIVIAL' ? 4 : 10;
    const graphMatched = symbolGraphCache.lookupFiles(graph, userRequest, graphLookupLimit);
    symbolMatchedFileNames = graphMatched;
    const preloadedIdsSet = new Set(preloaded.map((f) => f.fileId));
    for (const fileName of graphMatched) {
      const match = files.find((f) => f.fileName === fileName || f.path === fileName);
      if (match && !preloadedIdsSet.has(match.fileId)) {
        preloaded.push(match);
        preloadedIdsSet.add(match.fileId);
      }
      if (match) graphMatchedIds.push(match.fileId);
    }
  } catch {
    // Best-effort only.
  }

  // Merge prompt-mentioned files that weren't already selected
  const promptMentionedIds = new Set(promptMentionedFiles.map(f => f.fileId));
  const preloadedIds = new Set(preloaded.map(f => f.fileId));
  for (const pmf of promptMentionedFiles) {
    if (!preloadedIds.has(pmf.fileId)) {
      preloaded.push(pmf);
      preloadedIds.add(pmf.fileId);
    }
  }

  // God Mode structural expansion: walk render/include/import chains from
  // already-selected files so the agent sees the full dependency neighborhood.
  if (strategy === 'GOD_MODE') {
    const filesByName = new Map(files.map(f => [f.fileName, f]));
    const filesByPath = new Map(files.filter(f => f.path).map(f => [f.path!, f]));
    const resolveRef = (ref: string): FileContext | undefined =>
      filesByName.get(ref) ?? filesByPath.get(ref)
      ?? files.find(f => f.fileName.endsWith('/' + ref) || f.path?.endsWith('/' + ref));

    const renderRefPattern = /\{%[-\s]*(?:render|include|section)\s+['"]([^'"]+)['"]/g;
    const assetRefPattern = /['"]([^'"]+\.(?:js|css|liquid))['"]\s*\|\s*asset_url/g;
    const expandedIds = new Set(preloaded.map(f => f.fileId));
    const toExpand = [...preloaded];

    for (const file of toExpand) {
      if (file.content.startsWith('[')) continue;
      for (const pattern of [renderRefPattern, assetRefPattern]) {
        pattern.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = pattern.exec(file.content)) !== null) {
          const ref = m[1];
          const variants = [ref, `snippets/${ref}`, `snippets/${ref}.liquid`, `sections/${ref}.liquid`, `assets/${ref}`];
          for (const v of variants) {
            const dep = resolveRef(v);
            if (dep && !expandedIds.has(dep.fileId)) {
              preloaded.push(dep);
              expandedIds.add(dep.fileId);
              toExpand.push(dep);
              break;
            }
          }
        }
      }
    }
  }

  // Context packing scorer: prioritize active/open tabs/prompt/symbol files.
  const score = new Map<string, number>();
  for (const f of result.files) score.set(f.fileId, (score.get(f.fileId) ?? 0) + 10);
  for (const id of graphMatchedIds) score.set(id, (score.get(id) ?? 0) + 20);
  for (const f of promptMentionedFiles) score.set(f.fileId, (score.get(f.fileId) ?? 0) + 50);
  for (const id of options.openTabs ?? []) score.set(id, (score.get(id) ?? 0) + 30);
  if (options.activeFilePath) {
    const active = files.find((f) => f.path === options.activeFilePath || f.fileName === options.activeFilePath);
    if (active) score.set(active.fileId, (score.get(active.fileId) ?? 0) + 40);
  }
  // GOD_MODE cap: Cursor-like — more candidates for scout to gate so large themes get enough context.
  const preloadedCap = strategy === 'GOD_MODE' ? 60
    : tier === 'ARCHITECTURAL' ? 50
    : tier === 'TRIVIAL' ? 6
    : tier === 'SIMPLE' ? 12
    : 20;

  // Prompt-mentioned files are ALWAYS included regardless of cap
  const guaranteed = preloaded.filter(f => promptMentionedIds.has(f.fileId));
  const rest = [...new Map(preloaded.filter(f => !promptMentionedIds.has(f.fileId)).map(f => [f.fileId, f])).values()]
    .sort((a, b) => (score.get(b.fileId) ?? 0) - (score.get(a.fileId) ?? 0))
    .slice(0, Math.max(0, preloadedCap - guaranteed.length));
  preloaded = [...guaranteed, ...rest];

  // Hydrate selected files with real content if loadContent is available
  // Prompt-mentioned files are hydrated first to guarantee they have content
  if (options.loadContent && preloaded.length > 0) {
    const idsToHydrate = preloaded
      .filter(f => !f.content || f.content.startsWith('['))
      .map(f => f.fileId);

    if (idsToHydrate.length > 0) {
      const hydrated = await options.loadContent(idsToHydrate);
      const hydratedMap = new Map(hydrated.map((f: FileContext) => [f.fileId, f]));
      preloaded = preloaded.map(f => hydratedMap.get(f.fileId) ?? f);
    }
  }

  // Build Repository Map — structural summary with symbols, dependencies, schema info
  const { ThemeDependencyGraph: GraphClass } = await import('@/lib/context/cross-language-graph');
  const graph = new GraphClass();
  try {
    graph.buildFromFiles(files.map(f => ({
      path: f.path ?? f.fileName,
      content: f.content?.startsWith('[') ? '' : (f.content ?? ''),
    })));
  } catch { /* graph build is best-effort */ }

  const { buildRepoMap } = await import('@/lib/context/repo-map');
  const repoMapTokenBudget = strategy === 'GOD_MODE' ? 12_000
    : tier === 'ARCHITECTURAL' ? 4000 : 2000;
  const manifest = buildRepoMap(files, graph, {
    activeFilePath: options.activeFilePath,
    mentionedFiles: promptMentionedFiles.map(f => f.fileName),
    maxTokens: repoMapTokenBudget,
  });

  return { preloaded, allFiles: files, manifest, graph, symbolMatchedFiles: symbolMatchedFileNames };
}

// ── Multi-turn compression ──────────────────────────────────────────────────

/**
 * Compress old tool results to save tokens in later iterations.
 * Replaces verbose tool results from earlier iterations with short summaries,
 * keeping only the most recent iteration's results intact.
 */
export function compressOldToolResults(messages: AIMessage[]): void {
  // Find all user messages with __toolResults
  const toolResultMsgIndices: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i] as AIMessage & { __toolResults?: unknown[] };
    if (msg.role === 'user' && msg.__toolResults) {
      toolResultMsgIndices.push(i);
    }
  }

  // Keep only the last tool result message intact; compress older ones
  if (toolResultMsgIndices.length <= 1) return;

  for (let k = 0; k < toolResultMsgIndices.length - 1; k++) {
    const idx = toolResultMsgIndices[k];
    const msg = messages[idx] as AIMessage & { __toolResults?: Array<{ content?: string; type?: string; tool_use_id?: string; is_error?: boolean }> };
    if (!msg.__toolResults) continue;

    for (const block of msg.__toolResults) {
      if (block.is_error) continue;
      if (block.content && block.content.length > 200) {
        block.content = block.content.slice(0, 150) + '\n[... compressed ...]';
      }
    }
  }
}

function appendExecutionTerminalLog(
  executionId: string,
  messageType: 'task' | 'result' | 'error' | 'question',
  instruction: string,
): void {
  addMessage(executionId, {
    id: `${executionId}-${Date.now()}`,
    executionId,
    fromAgent: 'project_manager',
    toAgent: 'coordinator',
    messageType,
    payload: { instruction },
    timestamp: new Date(),
  });
}

function buildFallbackClarificationOptions(
  allFiles: FileContext[],
  artifacts: ReferentialArtifact[],
): Array<{ id: string; label: string; recommended?: boolean }> {
  const fileHints = artifacts
    .map((a) => a.filePath?.trim())
    .filter((p): p is string => Boolean(p))
    .slice(0, 3);
  const fallbackFiles = allFiles.slice(0, 3).map((f) => f.fileName);
  const targets = fileHints.length > 0 ? fileHints : fallbackFiles;
  const options = targets.map((p, idx) => ({
    id: `target-${idx + 1}`,
    label: `Use \`${p}\` as the target file for this edit.`,
    recommended: idx === 0,
  }));
  options.push({
    id: 'provide-snippet',
    label: 'I will paste the exact before/after snippet to apply.',
    recommended: false,
  });
  options.push({
    id: 'replay-last-edits',
    label: 'Replay the latest suggested edits as-is.',
    recommended: false,
  });
  return options;
}

function applyReferentialArtifactsAsChanges(
  artifacts: ReferentialArtifact[],
  allFiles: FileContext[],
  preloadedMap: Map<string, FileContext>,
  accumulatedChanges: CodeChange[],
): { applied: number; skipped: number; missing: string[] } {
  let applied = 0;
  let skipped = 0;
  const missing: string[] = [];

  const norm = (p: string) => p.replace(/\\/g, '/').trim().toLowerCase();
  for (const artifact of artifacts.slice(0, 8)) {
    const targetPath = artifact.filePath?.trim();
    if (!targetPath) {
      skipped += 1;
      continue;
    }
    const targetNorm = norm(targetPath);
    let target = allFiles.find(
      (f) => norm(f.fileName) === targetNorm || norm(f.path ?? '') === targetNorm,
    );
    if (!target) {
      const basename = targetNorm.split('/').pop();
      if (basename) {
        target = allFiles.find(
          (f) =>
            norm(f.fileName).endsWith(`/${basename}`) ||
            norm(f.fileName) === basename ||
            (f.path && norm(f.path).endsWith(`/${basename}`)),
        );
      }
    }
    if (!target) {
      missing.push(targetPath);
      continue;
    }
    if ((target.content ?? '') === artifact.newContent) {
      skipped += 1;
      continue;
    }

    const change: CodeChange = {
      fileId: target.fileId,
      fileName: target.fileName,
      originalContent: target.content,
      proposedContent: artifact.newContent,
      reasoning: artifact.reasoning ?? 'Replayed referential artifact from prior assistant suggestion.',
      agentType: 'project_manager',
    };
    accumulatedChanges.push(change);
    target.content = artifact.newContent;
    preloadedMap.set(target.fileName, target);
    if (target.path) {
      preloadedMap.set(target.path, target);
    }
    applied += 1;
  }

  return { applied, skipped, missing };
}

// â”€â”€ Style-aware context helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function selectReferenceSections(
  userRequest: string,
  activeFilePath: string | undefined,
  allFiles: FileContext[],
  fileTree: ShopifyFileTree | null,
  maxRefs: number = 3,
): FileContext[] {
  const isSection = activeFilePath?.startsWith('sections/') ?? false;
  const sectionIntent = /(?:create|add|edit|update|modify|change)\s+(?:a\s+)?(?:new\s+)?section/i.test(userRequest);
  if (!isSection && !sectionIntent) return [];

  const likeMatch = userRequest.match(/(?:like|similar to|based on|matching|same as)\s+['"]?([\w-]+)['"]?/i);
  const likeTarget = likeMatch ? `sections/${likeMatch[1].replace(/\.liquid$/, '')}.liquid` : null;

  const sections = allFiles.filter(f =>
    f.fileName.startsWith('sections/') &&
    f.fileName.endsWith('.liquid') &&
    f.fileName !== activeFilePath
  );

  const results: FileContext[] = [];
  if (likeTarget) {
    const match = sections.find(f => f.fileName === likeTarget);
    if (match) results.push(match);
  }

  const fileEntries = flattenFileTree(fileTree);
  const ranked = sections
    .filter(f => !results.includes(f))
    .sort((a, b) => {
      const aCount = fileEntries.get(a.fileName)?.usedBy?.length ?? 0;
      const bCount = fileEntries.get(b.fileName)?.usedBy?.length ?? 0;
      return bCount - aCount;
    });

  for (const s of ranked) {
    if (results.length >= maxRefs) break;
    results.push(s);
  }

  return results;
}

function flattenFileTree(tree: ShopifyFileTree | null): Map<string, ShopifyFileTreeEntry> {
  const map = new Map<string, ShopifyFileTreeEntry>();
  if (!tree) return map;
  for (const dir of Object.values(tree.directories)) {
    for (const entry of dir.files) {
      map.set(entry.path, entry);
    }
  }
  return map;
}

function findMainCssFile(allFiles: FileContext[]): FileContext | null {
  const themeLayout = allFiles.find(f => f.fileName === 'layout/theme.liquid');
  if (themeLayout?.content) {
    const cssMatch = themeLayout.content.match(/\{\{\s*'([^']+\.css)'\s*\|\s*asset_url/);
    if (cssMatch) {
      const cssName = `assets/${cssMatch[1]}`;
      const found = allFiles.find(f => f.fileName === cssName);
      if (found) return found;
    }
  }

  const candidates = ['assets/base.css', 'assets/theme.css', 'assets/main.css', 'assets/styles.css'];
  for (const name of candidates) {
    const found = allFiles.find(f => f.fileName === name);
    if (found) return found;
  }

  let largest: FileContext | null = null;
  let largestSize = 0;
  for (const f of allFiles) {
    if (f.fileName.startsWith('assets/') && f.fileName.endsWith('.css')) {
      const size = f.content?.length ?? 0;
      if (size > largestSize) {
        largest = f;
        largestSize = size;
      }
    }
  }
  return largest;
}

function findSnippetConsumers(
  snippetPath: string,
  allFiles: FileContext[],
  maxConsumers: number = 3,
): FileContext[] {
  const snippetName = snippetPath.replace(/^snippets\//, '').replace(/\.liquid$/, '');
  const renderRe = new RegExp(`\\{%[-\\s]*(?:render|include)\\s+'${snippetName}'`, 'i');
  const consumers: FileContext[] = [];
  for (const f of allFiles) {
    if (consumers.length >= maxConsumers) break;
    if (!f.content || !f.fileName.startsWith('sections/')) continue;
    if (renderRe.test(f.content)) {
      consumers.push(f);
    }
  }
  return consumers;
}

type ExecutionPhase = 'resolveIntent' | 'buildPatch' | 'applyPatch' | 'verify' | 'complete';

// ── Parallel execution helpers ──────────────────────────────────────────────

type ToolEndEvent = Extract<ToolStreamEvent, { type: 'tool_end' }>;

interface ParallelGroup {
  parallel: ToolEndEvent[];
  sequential: ToolEndEvent[];
}

/**
 * Temporary safety gate: virtual worktree isolation is not yet wired into tool
 * execution, so parallel server-tool writes can race on shared state.
 */
const ENABLE_UNISOLATED_PARALLEL_SERVER_TOOLS = true;

/**
 * Partition pending server-tool calls into two buckets:
 *   • parallel  – tools whose declared target files don't overlap (safe to run concurrently)
 *   • sequential – tools with file conflicts or no declared files (run one-at-a-time)
 */
function groupByFileOwnership(tools: ToolEndEvent[]): ParallelGroup {
  if (!ENABLE_UNISOLATED_PARALLEL_SERVER_TOOLS) {
    return { parallel: [], sequential: tools };
  }
  const parallel: ToolEndEvent[] = [];
  const sequential: ToolEndEvent[] = [];
  const claimedFiles = new Set<string>();

  for (const tool of tools) {
    const declaredFiles = Array.isArray(tool.input?.files)
      ? (tool.input.files as string[])
      : [];

    if (declaredFiles.length === 0) {
      sequential.push(tool);
      continue;
    }

    const hasConflict = declaredFiles.some(f => claimedFiles.has(f));

    if (hasConflict) {
      sequential.push(tool);
    } else {
      parallel.push(tool);
      declaredFiles.forEach(f => claimedFiles.add(f));
    }
  }

  return { parallel, sequential };
}

// ── File outline builder (structural summary for large files) ───────────────

function buildFileOutline(filePath: string, content: string): string {
  try {
    const chunks = chunkFile(content, filePath);
    if (chunks.length === 0) {
      const lineCount = content.split('\n').length;
      return `Structure: ${lineCount} lines (no AST chunks detected)`;
    }

    const grouped = new Map<string, ASTChunk[]>();
    for (const chunk of chunks) {
      const key = chunk.type;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(chunk);
    }

    const lines: string[] = ['**File structure:**'];
    for (const chunk of chunks.slice(0, 25)) {
      const label = chunk.metadata.functionName
        ?? chunk.metadata.selector
        ?? chunk.metadata.renderTarget
        ?? chunk.metadata.settingId
        ?? chunk.metadata.nodeType
        ?? chunk.type;
      lines.push(`  Lines ${chunk.lineStart}-${chunk.lineEnd}: ${chunk.type} — ${label}`);
    }
    if (chunks.length > 25) {
      lines.push(`  ... and ${chunks.length - 25} more chunks`);
    }

    return lines.join('\n');
  } catch {
    const lineCount = content.split('\n').length;
    return `Structure: ${lineCount} lines (outline unavailable)`;
  }
}

// ── Main entry point ────────────────────────────────────────────────────────

/**
 * Parses raw tool output into structured card data for rich UI rendering.
 * Returns null if the tool doesn't have a rich card representation.
 */
function buildToolResultCardData(
  toolName: string,
  input: Record<string, unknown> | undefined,
  rawContent: string,
): Record<string, unknown> | null {
  try {
    if (toolName === 'read_file' || toolName === 'read_lines' || toolName === 'read_chunk') {
      const fileName = String(input?.fileId ?? input?.path ?? input?.file_path ?? 'unknown');
      const lines = rawContent.split('\n');
      const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
      const langMap: Record<string, string> = {
        liquid: 'Liquid', json: 'JSON', js: 'JavaScript', ts: 'TypeScript',
        css: 'CSS', scss: 'SCSS', html: 'HTML', md: 'Markdown', svg: 'SVG',
      };
      return {
        fileName,
        content: rawContent.slice(0, 5000),
        language: langMap[ext] ?? ext,
        lineCount: lines.length,
      };
    }

    if (toolName === 'grep_content' || toolName === 'search_files') {
      const pattern = String(input?.pattern ?? input?.query ?? '');
      const matchLines = rawContent.split('\n').filter(l => l.trim());
      const matches: Array<{ file: string; line: number; content: string }> = [];
      for (const ml of matchLines.slice(0, 50)) {
        const parts = ml.match(/^(.+?):(\d+):\s*(.*)$/);
        if (parts) {
          matches.push({ file: parts[1], line: parseInt(parts[2], 10), content: parts[3] });
        } else if (ml.includes(':')) {
          const [file, ...rest] = ml.split(':');
          matches.push({ file: file.trim(), line: 0, content: rest.join(':').trim() });
        }
      }
      return {
        pattern,
        matches,
        totalMatches: matches.length,
      };
    }

    if (toolName === 'check_lint') {
      const fileName = String(input?.fileName ?? input?.filePath ?? '');
      const passed = rawContent.includes('No lint errors') || rawContent.includes('no issues') || rawContent.includes('passed');
      const issues: Array<{ severity: 'error' | 'warning' | 'info'; category: string; file: string; line?: number; message: string }> = [];
      const issueLines = rawContent.split('\n').filter(l => l.trim());
      for (const il of issueLines) {
        const errorMatch = il.match(/(?:error|Error)\s*:?\s*(.*)/);
        const warnMatch = il.match(/(?:warning|Warning)\s*:?\s*(.*)/);
        if (errorMatch) {
          issues.push({ severity: 'error', category: 'lint', file: fileName, message: errorMatch[1] });
        } else if (warnMatch) {
          issues.push({ severity: 'warning', category: 'lint', file: fileName, message: warnMatch[1] });
        }
      }
      const errorCount = issues.filter(i => i.severity === 'error').length;
      const warnCount = issues.filter(i => i.severity === 'warning').length;
      return {
        passed,
        summary: passed ? `${fileName}: clean` : `${fileName}: ${errorCount} errors, ${warnCount} warnings`,
        issues,
      };
    }

    if (toolName === 'run_command') {
      const command = String(input?.command ?? '');
      const exitCodeMatch = rawContent.match(/exit code:\s*(\d+)/i);
      const exitCode = exitCodeMatch ? parseInt(exitCodeMatch[1], 10) : 0;
      const timedOut = rawContent.includes('timed out') || rawContent.includes('timeout');
      let stdout = rawContent;
      let stderr = '';
      const stderrMatch = rawContent.match(/(?:stderr|STDERR):\s*([\s\S]*?)(?:\n(?:stdout|exit)|$)/i);
      if (stderrMatch) {
        stderr = stderrMatch[1].trim();
        stdout = rawContent.replace(stderrMatch[0], '').trim();
      }
      return {
        command,
        stdout: stdout.slice(0, 3000),
        stderr: stderr.slice(0, 1000),
        exitCode,
        timedOut,
      };
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * V2 streaming coordinator — single-pass tool-using agent loop.
 *
 * Processes a user request by iteratively calling an LLM with tool access,
 * executing tools, and feeding results back until the model stops or limits
 * are reached. Streams text and tool events to the client in real time.
 */
export async function streamV2(
  executionId: string,
  projectId: string,
  userId: string,
  userRequest: string,
  files: FileContext[],
  userPreferences: UserPreference[],
  options: V2CoordinatorOptions,
): Promise<AgentResult> {
  createExecution(executionId, projectId, userId, userRequest, options.sessionId);
  updateExecutionStatus(executionId, 'in_progress');
  let fileStore: FileStore | null = null;

  // Wrap loadContent to normalize whitespace on every file the agent reads
  if (options.loadContent) {
    const rawLoadContent = options.loadContent;
    options.loadContent = async (ids: string[]) => {
      const { normalizeForAgent } = await import('@/lib/agents/tools/prettify');
      const loaded = await rawLoadContent(ids);
      return loaded.map(f => ({
        ...f,
        content: f.content ? normalizeForAgent(f.content) : f.content,
      }));
    };
  }

  // ── Checkpoint resume logic (Gap 3B) ───────────────────────────────────────
  // If a checkpoint exists for this execution, we're resuming after a timeout.
  // Reconstruct state and skip completed phases.
  let resumedCheckpoint: CheckpointData | null = null;
  if (isBackgroundResumeEnabled()) {
    try {
      resumedCheckpoint = await getCheckpoint(executionId);
      if (resumedCheckpoint) {
        console.log(`[V2] Resuming from checkpoint: phase=${resumedCheckpoint.phase}, specialists=${resumedCheckpoint.completedSpecialists.length}`);

        // Reconstruct FileStore dirty state: mark files that were modified
        // in prior phases so reads return the DB-persisted version (which
        // backgroundDbWrite already flushed).
        if (resumedCheckpoint.dirtyFileIds.length > 0) {
          for (const f of files) {
            if (resumedCheckpoint.dirtyFileIds.includes(f.fileId)) {
              // Hydrate content from DB if loadContent is available
              if (options.loadContent) {
                try {
                  const hydrated = await options.loadContent([f.fileId]);
                  if (hydrated.length > 0 && hydrated[0].content) {
                    f.content = hydrated[0].content;
                  }
                } catch { /* best-effort */ }
              }
            }
          }
        }
      }
    } catch {
      // Checkpoint retrieval failed -- proceed fresh
    }
  }

  const contextEngine = getProjectContextEngine(projectId);
  const onProgress = options.onProgress;
  const onContentChunk = options.onContentChunk;
  const onToolEvent = options.onToolEvent;
  const intentMode = options.intentMode ?? 'code';

  console.log(`[V2] Starting for execution ${executionId}, mode=${intentMode}${resumedCheckpoint ? ' (resumed)' : ''}`);

  onProgress?.({
    type: 'thinking',
    phase: 'analyzing',
    subPhase: 'building_context',
    label: 'Building context...',
  });

  try {
    // ── Classify request + load term mappings (parallel) ──────────────
    let tier: RoutingTier = 'SIMPLE';

    const classifyPromise = (async () => {
      if (options.strategy) {
        console.log(`[V2] Strategy pre-set to ${options.strategy} — skipping classification`);
        return 'COMPLEX' as RoutingTier;
      }
      if (options._tierOverride) {
        console.log(`[V2] Tier override: ${options._tierOverride} (escalation depth=${options._escalationDepth ?? 0})`);
        return options._tierOverride;
      }
      onProgress?.({ type: 'thinking', phase: 'analyzing', label: 'Classifying request...' });
      try {
        const classification = await classifyRequest(userRequest, files.length, {
          lastMessageSummary: options.recentMessages?.slice(-1)[0],
          recentMessages: options.recentMessages,
          skipLLM: intentMode === 'ask',
        });
        console.log(`[V2] Classified as ${classification.tier} (source=${classification.source}, confidence=${classification.confidence}${intentMode === 'ask' ? ', llm=skipped' : ''})`);
        return classification.tier;
      } catch (err) {
        console.warn('[V2] Classification failed, defaulting to SIMPLE:', err);
        return 'SIMPLE' as RoutingTier;
      }
    })();

    const termMappingsPromise = (async () => {
      if (contextEngine.getTermMappingCount() > 0) return;
      try {
        const { loadTermMappings } = await import('@/lib/ai/term-mapping-learner');
        const mappings = await loadTermMappings(projectId);
        if (mappings.length > 0) {
          contextEngine.loadTermMappingsData(mappings);
          console.log(`[V2] Loaded ${mappings.length} term mappings for project`);
        }
      } catch { /* term mappings are best-effort */ }
    })();

    const [classifiedTier] = await Promise.all([classifyPromise, termMappingsPromise]);
    tier = classifiedTier;

    // ── File-size escalation: large target files → at least COMPLEX → GOD_MODE
    if (tier !== 'ARCHITECTURAL' && tier !== 'COMPLEX' && intentMode === 'code') {
      const mentionedFiles = extractPromptMentionedFiles(userRequest, files);
      const activeFile = options.activeFilePath
        ? files.find(f => f.path === options.activeFilePath || f.fileName === options.activeFilePath)
        : undefined;
      const candidates = activeFile ? [activeFile, ...mentionedFiles] : mentionedFiles;

      const narrowTarget = mentionedFiles.length >= 1 && mentionedFiles.length <= 3;
      const editIntent = /\b(add|change|update|fix|insert|show|display|remove|hide|style|styling|contrast|metafield|variant|option|lengths?|badge|swatch|script|javascript|\.js)\b/i;
      if (tier === 'SIMPLE' && narrowTarget && editIntent.test(userRequest)) {
        tier = 'COMPLEX';
        console.log(`[V2] Escalated to COMPLEX — multi-file edit (God Mode), ${mentionedFiles.length} file(s) mentioned`);
      }

      const hasLargeFile = candidates.some(f => {
        if (!f.content) return false;
        if (f.content.startsWith('[')) {
          const sizeMatch = f.content.match(/\[(\d+)\s*chars?\]/);
          return sizeMatch ? Number(sizeMatch[1]) > TOOL_THRESHOLDS.GOD_MODE_ESCALATION_CHARS : false;
        }
        return f.content.length > TOOL_THRESHOLDS.GOD_MODE_ESCALATION_CHARS;
      });
      if (hasLargeFile) {
        tier = 'COMPLEX';
        console.log(`[V2] Escalated to COMPLEX — target file exceeds ${TOOL_THRESHOLDS.GOD_MODE_ESCALATION_CHARS} chars`);
      }
    }

    // ── Determine initial execution strategy from tier ────────────────
    let initialStrategy: ExecutionStrategy = options.strategy
      ?? (AI_FEATURES.godMode ? getStrategyFromTier(tier) : 'HYBRID');

    // ── Slim context eligibility: skip heavy context pipeline for focused edits
    const slimPromptMentioned = extractPromptMentionedFiles(userRequest, files);
    const activeFileInArray = options.activeFilePath
      ? files.some(f => f.path === options.activeFilePath || f.fileName === options.activeFilePath)
      : false;
    const isSlimEligible =
      options.activeFilePath &&
      activeFileInArray &&
      (intentMode === 'code' || intentMode === 'debug') &&
      slimPromptMentioned.length <= 1 &&
      !options.maxQuality &&
      tier !== 'ARCHITECTURAL';

    if (isSlimEligible && AI_FEATURES.godMode) {
      initialStrategy = 'GOD_MODE';
      console.log(`[V2] Slim context eligible — forcing GOD_MODE, active=${options.activeFilePath}`);
    }

    // ── Build file context ──────────────────────────────────────────────
    if (shouldRequirePlanModeFirst({
      intentMode,
      tier,
      userRequest,
      recentMessages: options.recentMessages,
      isReferentialCodePrompt: options.isReferentialCodePrompt,
    })) {
      const policyMessage = buildPlanModeRequiredMessage(tier);
      onProgress?.({
        type: 'thinking',
        phase: 'clarification',
        label: 'Plan approval required',
        detail: policyMessage,
        metadata: { routingTier: tier },
      });
      const blockedCodeMutation = intentMode === 'code';
      if (blockedCodeMutation) {
        appendExecutionTerminalLog(
          executionId,
          'result',
          'Code-mode request ended without mutating changes because plan approval is required.',
        );
      }
      updateExecutionStatus(executionId, blockedCodeMutation ? 'failed' : 'completed');
      await persistExecution(executionId);
      return {
        agentType: 'project_manager',
        success: true,
        analysis: policyMessage,
        needsClarification: true,
        directStreamed: true,
      };
    }

    // ── Build file context ──────────────────────────────────────────────
    onProgress?.({ type: 'thinking', phase: 'analyzing', label: isSlimEligible ? 'Preparing edit...' : 'Preparing file context...' });
    const v2ctx = await buildV2Context(projectId, files, userRequest, options, tier, initialStrategy, !!isSlimEligible);
    let preloaded = v2ctx.preloaded;
    const { allFiles, manifest, graph: depGraph, symbolMatchedFiles } = v2ctx;

    if (!isSlimEligible) {
      onProgress?.({ type: 'thinking', phase: 'analyzing', label: 'Building structural brief...' });
    }

    // ── Theme Intelligence Map (programmatic, instant) ─────────────────
    // Single path: get cached map or build on-demand (<100ms).
    // lookupThemeMap → buildEnrichedScoutBrief → context gate.
    let scoutSection = manifest;
    let currentScoutBrief: import('@/lib/types/agent').ScoutBrief | undefined;
    const formatScoutLocationIndex = (brief: import('@/lib/types/agent').ScoutBrief): string => {
      const lines: string[] = ['SCOUT LOCATION INDEX (paths + line ranges only)'];
      const keyFiles = brief.keyFiles.slice(0, 12);
      for (const file of keyFiles) {
        const ranges = file.targets
          .slice(0, 4)
          .map((t) => `${t.lineRange[0]}-${t.lineRange[1]}${t.context ? ` (${t.context})` : ''}`)
          .join(', ');
        lines.push(`- ${file.path} [${file.type}]${ranges ? ` -> ${ranges}` : ''}`);
      }
      if (brief.suggestedEditOrder.length > 0) {
        lines.push('');
        lines.push(`Suggested edit order: ${brief.suggestedEditOrder.slice(0, 12).join(' -> ')}`);
      }
      return lines.join('\n');
    };

    try {
      const { getThemeMap, setThemeMap, loadFromDisk, indexTheme, lookupThemeMap, formatLookupResult } =
        await import('@/lib/agents/theme-map');

      let themeMap = getThemeMap(projectId) ?? await loadFromDisk(projectId);

      // Build on-demand if no cached map exists
      if ((!themeMap || Object.keys(themeMap.files).length === 0) && files.length > 0) {
        const needHydration = files
          .filter(f => !f.content || String(f.content).startsWith('['))
          .map(f => f.fileId)
          .filter((id): id is string => Boolean(id));
        let filesToIndex = [...files];
        if (needHydration.length > 0 && needHydration.length <= 200 && options.loadContent) {
          try {
            const hydrated = await options.loadContent(needHydration);
            const byId = new Map(hydrated.map(f => [f.fileId, f]));
            filesToIndex = files.map(f => (f.fileId ? byId.get(f.fileId) : undefined) ?? f);
          } catch (e) {
            console.warn('[ThemeMap] Hydration for on-demand index failed:', e);
          }
        }
        const withContent = filesToIndex.filter(
          f => f.content && !String(f.content).startsWith('['),
        );
        if (withContent.length > 0) {
          themeMap = indexTheme(projectId, withContent);
          setThemeMap(projectId, themeMap);
          console.log(`[ThemeMap] On-demand build: ${Object.keys(themeMap.files).length} files indexed`);
        }
      }

      if (themeMap && Object.keys(themeMap.files).length > 0) {
        const lookupResult = lookupThemeMap(themeMap, userRequest, {
          activeFilePath: options.activeFilePath,
          maxTargets: 15,
        });
        console.log(`[ThemeMap] Lookup: ${lookupResult.targets.length} targets, ${lookupResult.related.length} related, confident=${lookupResult.confident} (map v${themeMap.version}, ${themeMap.fileCount} files)`);

        // Build enriched scout brief from the theme map data
        const {
          buildEnrichedScoutBrief,
        } = await import('@/lib/agents/scout/structural-scout');

        if (depGraph) {
          const enrichedBrief = buildEnrichedScoutBrief(
            userRequest, themeMap, preloaded, depGraph,
          );
          // Keep full scout intelligence in memory, but hand off only a compact locator index.
          currentScoutBrief = enrichedBrief;
          scoutSection = formatScoutLocationIndex(enrichedBrief);
          const scoutTokens = estimateTokens(scoutSection);
          if (scoutTokens > 4_000) {
            const topFiles = enrichedBrief.keyFiles
              .slice(0, 8)
              .map((f) => f.path)
              .join(', ');
            scoutSection = `SCOUT LOCATION INDEX (compact)\nTop files: ${topFiles}`;
          }
          console.log(
            `[Scout] Enriched brief from theme map (${enrichedBrief.tokenCount} tokens raw → ${estimateTokens(scoutSection)} tokens handoff, ${enrichedBrief.keyFiles.length} key files)`,
          );
        } else {
          scoutSection = formatLookupResult(lookupResult);
        }

        // Gate: filter preloaded down to map-selected files only
        if (lookupResult.targets.length > 0) {
          const beforeCount = preloaded.length;
          const mapPaths = new Set(lookupResult.targets.map(t => t.path));
          for (const r of lookupResult.related) mapPaths.add(r);

          if (options.activeFilePath) mapPaths.add(options.activeFilePath);

          const promptMentioned = extractPromptMentionedFiles(userRequest, files);
          for (const pmf of promptMentioned) {
            mapPaths.add(pmf.path ?? pmf.fileName);
          }

          preloaded = preloaded.filter(f =>
            mapPaths.has(f.path ?? f.fileName) || mapPaths.has(f.fileName),
          );

          if (preloaded.length === 0) {
            preloaded = v2ctx.preloaded;
            console.warn('[ThemeMap] Gate filtered to 0 files, restoring full candidate set');
          } else {
            console.log(`[ThemeMap] Context gate: ${beforeCount} candidates → ${preloaded.length} files sent to LLM`);
          }
        }

        // Fallback ScoutBrief from lookup result if enriched brief wasn't built
        if (!currentScoutBrief) {
          const inferFileType = (p: string): 'section' | 'snippet' | 'layout' | 'template' | 'css' | 'js' | 'json' => {
            if (p.startsWith('sections/')) return 'section';
            if (p.startsWith('snippets/')) return 'snippet';
            if (p.startsWith('layout/')) return 'layout';
            if (p.startsWith('templates/')) return 'template';
            if (p.endsWith('.css') || p.endsWith('.scss')) return 'css';
            if (p.endsWith('.js') || p.endsWith('.ts')) return 'js';
            if (p.endsWith('.json')) return 'json';
            return 'snippet';
          };
          currentScoutBrief = {
            summary: `Theme map lookup (${lookupResult.targets.length} targets)`,
            keyFiles: lookupResult.targets.map(t => ({
              path: t.path,
              type: inferFileType(t.path),
              relevance: 1.0,
              targets: t.features.map(f => ({
                description: f.description,
                lineRange: f.lines,
                context: f.name,
                confidence: 1.0,
              })),
            })),
            relationships: [],
            recommendations: [],
            suggestedEditOrder: [],
            source: 'programmatic' as const,
            tokenCount: scoutSection.length / 4,
          };
        }
      }
    } catch (err) {
      console.warn('[ThemeMap] Lookup failed, using repo manifest:', err);
    }

    if (!isSlimEligible) {
      onProgress?.({ type: 'thinking', phase: 'analyzing', label: 'Starting agent...' });
    }

    // ── Canonical file resolution map ────────────────────────────────
    // Normalizes all file references (fileId, fileName, path, basename) to
    // a single FileContext. Eliminates all ad-hoc fuzzy matching.
    const fileMap = new Map<string, FileContext>();
    for (const f of allFiles) {
      if (f.fileId) fileMap.set(f.fileId, f);
      if (f.fileName) fileMap.set(f.fileName, f);
      if (f.path) fileMap.set(f.path, f);
      // basename: "snippets/hero.liquid" → "hero.liquid"
      const basename = (f.path ?? f.fileName).split('/').pop();
      if (basename) fileMap.set(basename, f);
    }
    function resolveFile(ref: string): FileContext | undefined {
      return fileMap.get(ref)
        ?? fileMap.get(ref.replace(/^\//, ''))
        ?? Array.from(fileMap.values()).find(f =>
          f.fileName?.endsWith(`/${ref}`) || f.path?.endsWith(`/${ref}`)
        );
    }

    // Format pre-loaded files for the user message.
    // For large files: use scout-targeted line ranges as the preview (not blind
    // first-1500-chars) so the agent sees the relevant code on iteration 1.
    const scoutKeyFileMap = new Map(
      (currentScoutBrief?.keyFiles ?? []).map(kf => [kf.path, kf]),
    );
    const quickCodePath =
      intentMode === 'code' &&
      /\b(change|replace|update|edit|fix|apply|implement|add|remove)\b/i.test(userRequest);
    const promptPreloaded = (() => {
      if (!quickCodePath) return preloaded;
      const preferred = new Set<string>();
      for (const kf of (currentScoutBrief?.keyFiles ?? []).slice(0, QUICK_EDIT_MAX_PRELOADED_FILES)) {
        preferred.add(kf.path);
      }
      if (options.activeFilePath) preferred.add(options.activeFilePath);
      const filtered = preloaded.filter((f) => {
        const path = f.path ?? f.fileName;
        return preferred.has(path) || preferred.has(f.fileName);
      });
      const base = filtered.length > 0 ? filtered : preloaded;
      return base.slice(0, QUICK_EDIT_MAX_PRELOADED_FILES);
    })();

    const fileContents = promptPreloaded
      .filter(f => f.content && !f.content.startsWith('['))
      .map(f => {
        let content = f.content;
        if (isSectionFile(f.fileName || f.path || '')) {
          content = contentWithSchemaSummary(content);
        }
        const lineCount = content.split('\n').length;

        if (content.length > TOOL_THRESHOLDS.LARGE_FILE_OUTLINE_CHARS) {
          const outline = buildFileOutline(f.fileName || f.path || '', content);
          const filePath = f.path ?? f.fileName;
          const scoutFile = scoutKeyFileMap.get(filePath);
          const lines = content.split('\n');

          let preview: string;
          if (scoutFile && scoutFile.targets.length > 0) {
            const regions: string[] = [];
            let previewChars = 0;
            const MAX_PREVIEW_CHARS = quickCodePath
              ? QUICK_EDIT_MAX_LARGE_PREVIEW_CHARS
              : 12_000;
            for (const target of scoutFile.targets.slice(0, quickCodePath ? QUICK_EDIT_MAX_SCOUT_TARGETS_PER_FILE : 8)) {
              if (previewChars >= MAX_PREVIEW_CHARS) break;
              const start = Math.max(0, target.lineRange[0] - 2);
              const end = Math.min(lines.length, target.lineRange[1] + 2);
              const region = lines.slice(start, end).join('\n');
              regions.push(
                `// ── Lines ${start + 1}-${end} (${target.description}) ──\n${region}`,
              );
              previewChars += region.length;
            }
            preview = regions.join('\n\n');
          } else {
            preview = content.slice(0, 6000);
          }

          return [
            `### ${f.fileName} (${lineCount} lines — large file, use read_lines for full regions)`,
            '',
            outline,
            '',
            '```' + f.fileType,
            preview,
            `// ... ${lineCount} total lines — use read_lines to see other regions`,
            '```',
          ].join('\n');
        }

        if (quickCodePath && content.length > QUICK_EDIT_MAX_INLINE_FILE_CHARS) {
          const clipped = content.slice(0, QUICK_EDIT_MAX_INLINE_FILE_CHARS);
          return [
            `### ${f.fileName} (${lineCount} lines — clipped for fast edit path, use read_lines for exact ranges)`,
            '```' + f.fileType,
            clipped,
            `// ... clipped at ${QUICK_EDIT_MAX_INLINE_FILE_CHARS} chars; use read_lines for exact regions`,
            '```',
          ].join('\n');
        }

        return `### ${f.fileName}\n\`\`\`${f.fileType}\n${content}\n\`\`\``;
      })
      .join('\n\n');

    // ── Resolve model (used for overlay + provider selection) ───────────
    const actionForModel: AIAction =
      intentMode === 'ask' ? 'ask' : intentMode === 'debug' ? 'debug' : 'generate';
    const model = resolveModel({
      action: actionForModel,
      forcedModel: options.forcedModel,
      userOverride: options.model,
      agentRole: 'project_manager',
      tier,
      maxQuality: options.maxQuality,
    });

    // ── Build system prompt (base + knowledge modules + mode overlay) ──
    let systemPrompt: string;
    let knowledgeModuleIds: string[] = [];
    try {
      const { SLIM_PM_SYSTEM_PROMPT } = await import('@/lib/agents/prompts/v2-pm-prompt');
      const { matchKnowledgeModules } = await import('@/lib/agents/knowledge/module-matcher');

      let projectDir: string | undefined;
      let disabledSkillIds: Set<string> = new Set();
      let marketplaceModules: import('@/lib/agents/knowledge/module-matcher').KnowledgeModule[] = [];
      try {
        const { loadInstalledMarketplaceSkills } = await import('@/lib/agents/knowledge/marketplace-loader');
        const { resolveProjectSlug, getLocalThemePath } = await import('@/lib/sync/disk-sync');
        const { getDisabledSkillIds } = await import('@/lib/agents/knowledge/skill-settings');
        const { createServiceClient } = await import('@/lib/supabase/admin');
        const [slug, disabled, marketplace] = await Promise.all([
          resolveProjectSlug(projectId).catch(() => null),
          getDisabledSkillIds(projectId).catch(() => new Set<string>()),
          loadInstalledMarketplaceSkills(projectId, createServiceClient()).catch(() => []),
        ]);
        projectDir = slug ? getLocalThemePath(slug) : undefined;
        disabledSkillIds = disabled;
        marketplaceModules = marketplace;
      } catch {
        // Marketplace/disk features unavailable — continue with built-in modules only
      }

      const modules = matchKnowledgeModules(userRequest, 2500, projectDir, disabledSkillIds, marketplaceModules);
      knowledgeModuleIds = modules.map(m => m.id);
      const moduleContent = modules.map(m => m.content).join('\n\n');
      systemPrompt = moduleContent ? `${SLIM_PM_SYSTEM_PROMPT}\n\n${moduleContent}` : SLIM_PM_SYSTEM_PROMPT;
      console.log(`[KM] Loaded modules: [${knowledgeModuleIds.join(', ')}], prompt tokens: ${estimateTokens(systemPrompt)}`);
    } catch (promptErr) {
      console.error('[KM] Failed to load knowledge modules, falling back to base prompt:', promptErr);
      systemPrompt = V2_PM_SYSTEM_PROMPT;
    }
    const modelOverlay = getModelOverlay(model);
    if (modelOverlay) {
      systemPrompt += '\n' + modelOverlay;
    }
    if (intentMode === 'code') systemPrompt += '\n\n' + V2_CODE_OVERLAY;
    else if (intentMode === 'plan') systemPrompt += '\n\n' + V2_PLAN_OVERLAY;
    else if (intentMode === 'debug') systemPrompt += '\n\n' + V2_DEBUG_OVERLAY;
    else if (intentMode === 'ask') systemPrompt += '\n\n' + V2_ASK_OVERLAY;
    if (AI_FEATURES.godMode && (intentMode === 'code' || intentMode === 'debug')) {
      systemPrompt += '\n\n' + STRATEGY_SELECTION_BLOCK;
      if (initialStrategy === 'GOD_MODE') {
        systemPrompt += '\n\n' + V2_GOD_MODE_OVERLAY;
      }
    }
    if (isSlimEligible) {
      systemPrompt += '\n\n## Context Mode\nYou have the active file and its direct dependencies. Use read_file or search_files if you need additional context from other files.';
    }
    systemPrompt += '\n\n' + buildMaximumEffortPolicyMessage();

    // â”€â”€ Style-aware context assembly (Phases 1.1, 1.2, 2.2, 2.3) â”€â”€â”€â”€

    // Run style profile + file tree in parallel (both are independent I/O)
    // Skip when slim AND no CSS/styling keywords in the request
    const cssKeywords = /\b(style|css|color|font|spacing|theme|responsive|layout)\b/i;
    const skipStyleProfile = isSlimEligible && !cssKeywords.test(userRequest);

    const emptyStyleResult = { content: '', stats: { tokenCount: 0, styleRuleCount: 0, patternCount: 0, memoryCount: 0, conflictResolutions: 0 } };
    const [styleProfileResult, fileTreeData] = skipStyleProfile
      ? [emptyStyleResult, null as ShopifyFileTree | null]
      : await Promise.all([
        buildUnifiedStyleProfile(projectId, userId, files)
          .catch((): typeof emptyStyleResult => emptyStyleResult),
        getFileTree(projectId).catch((): ShopifyFileTree | null => null),
      ]);

    const styleProfileContent = styleProfileResult.content;
    const styleProfileStats = styleProfileResult.stats;
    if (styleProfileContent) {
      systemPrompt += '\n\n' + styleProfileContent;
    }

    // Extended pattern detection (fire-and-forget, never blocks)
    if (!skipStyleProfile) {
      try {
        const patternLearner = new PatternLearning();
        patternLearner.detectExtendedPatterns(projectId, userId, files).catch(() => {});
      } catch { /* never blocks */ }
    }

    const designContext = styleProfileContent;

    const refSections = selectReferenceSections(
      userRequest,
      options.activeFilePath,
      allFiles,
      fileTreeData,
    );

    const cssRelevant =
      options.activeFilePath?.endsWith('.css') ||
      /\b(css|style|color|font|spacing|theme)\b/i.test(userRequest);
    let preloadedCssFile: FileContext | null = null;
    if (cssRelevant) {
      preloadedCssFile = findMainCssFile(allFiles);
    }

    // Phase 2.3: Reverse dependency context for snippets
    let snippetConsumers: FileContext[] = [];
    if (options.activeFilePath?.startsWith('snippets/')) {
      snippetConsumers = findSnippetConsumers(options.activeFilePath, allFiles);
    }

    // Phase 1.2 cont: Add reference section guidance to system prompt
    if (refSections.length > 0) {
      systemPrompt +=
        '\n\nMatch the design patterns, CSS class names, schema structure, ' +
        'and color scheme handling from the reference sections below.';
    }


    // ── Build initial messages ────────────────────────────────────────
    const systemMsg: AIMessage = { role: 'system', content: systemPrompt };
    if (AI_FEATURES.promptCaching) {
      systemMsg.cacheControl = { type: 'ephemeral', ttl: AI_FEATURES.promptCacheTtl };
    }
    const messages: AIMessage[] = [systemMsg];

    // Conversation history — prefer structured history with tool metadata
    if (options.recentHistory?.length) {
      for (const histMsg of options.recentHistory) {
        messages.push(histMsg);
      }
    } else if (options.recentMessages?.length) {
      // Legacy fallback: alternating user/assistant from flat strings
      for (let i = 0; i < options.recentMessages.length; i++) {
        const role = i % 2 === 0 ? 'user' : 'assistant';
        messages.push({
          role: role as 'user' | 'assistant',
          content: options.recentMessages[i],
        });
      }
    }
    if (messages.length > 1) {
      // Cache breakpoint on last history message
      if (AI_FEATURES.promptCaching) {
        const lastHistoryMsg = messages[messages.length - 1];
        lastHistoryMsg.cacheControl = { type: 'ephemeral', ttl: AI_FEATURES.promptCacheTtl };
      }
    }

    // User message with file context
    const userMessageParts = [
      userRequest,
      '',
      ...(options.domContext ? [options.domContext, ''] : []),
      ...(options.diagnosticContext ? [`## DIAGNOSTICS:\n${options.diagnosticContext}`, ''] : []),
      '## PRE-LOADED FILES:',
      preloaded.length > 0 ? fileContents : '(none)',
      '',
      currentScoutBrief
        ? '## THEME INTELLIGENCE MAP — Pre-computed file targets, line ranges, and relationships:'
        : '## STRUCTURAL BRIEF — File targets, line ranges, and relationships:',
      scoutSection,
    ];
    // Mark file context message for prompt caching â€” this stays identical across iterations
    const fileContextMsg: AIMessage = { role: 'user', content: userMessageParts.join('\n') };
    if (options.images?.length) {
      fileContextMsg.images = options.images;
    }
    if (AI_FEATURES.promptCaching) {
      fileContextMsg.cacheControl = { type: 'ephemeral', ttl: AI_FEATURES.promptCacheTtl };
    }
    messages.push(fileContextMsg);

    // ── Select tools ──────────────────────────────────────────────────
    const hasPreview = !!options.domContext;
    const tools: ToolDefinition[] = selectV2Tools(intentMode, hasPreview, AI_FEATURES.programmaticToolCalling);

    const providerName = getProviderForModel(model);
    const provider = getAIProvider(providerName as Parameters<typeof getAIProvider>[0]);

    const toolStreamingSupported = isToolProvider(provider);

    // ── Iteration state ───────────────────────────────────────────────
    let MAX_ITERATIONS = ITERATION_LIMITS[intentMode] ?? 10;
    if (tier === 'TRIVIAL') MAX_ITERATIONS = Math.min(MAX_ITERATIONS, 6);

    // Phase 4: Fast Edit Path â€” bypass exploration for simple pre-loaded edits
    const fastEdit = isFastEditEligible(intentMode, tier, userRequest, preloaded);
    if (fastEdit) {
      MAX_ITERATIONS = tier === 'TRIVIAL' ? 4 : 6;
      systemPrompt += FAST_EDIT_SYSTEM_SUFFIX;
      systemMsg.content = systemPrompt; // Update cached message (strings are immutable)
      console.log(`[V2] Fast edit path activated (MAX_ITERATIONS=${MAX_ITERATIONS})`);
      onProgress?.({
        type: 'thinking',
        phase: 'analyzing',
        label: 'Fast edit â€” completing in single pass',
      });
    }
    const startTime = Date.now();
    let iteration = 0;
    let fullText = '';
    let latestReviewResult: ReviewResult | undefined;
    const accumulatedChanges: CodeChange[] = resumedCheckpoint?.accumulatedChanges ?? [];
    const readFiles = new Set<string>();
    for (const f of preloaded) {
      readFiles.add(f.fileName);
      if (f.fileId) readFiles.add(f.fileId);
      if (f.path) readFiles.add(f.path);
    }
    const searchedFiles = new Set<string>();
    const hasApprovedPlanSignal = hasPlanApprovalSignal(options.recentMessages, userRequest);
    const hasThemeLayoutContext = allFiles.some((f) => {
      const p = (f.path ?? f.fileName).replace(/\\/g, '/').toLowerCase();
      return p === 'layout/theme.liquid';
    });
    const directMutationRequested =
      intentMode === 'code' &&
      /\b(change|replace|update|edit|fix|apply|implement)\b/i.test(userRequest);
    const directValidationRequested =
      intentMode === 'code' &&
      /\b(validate|verification?|verify|preview|check)\b/i.test(userRequest);
    const referentialCodePrompt =
      intentMode === 'code' && options.isReferentialCodePrompt === true;
    const referentialArtifacts = options.referentialArtifacts ?? [];
    let preEditLookupBudget = referentialCodePrompt
      ? REFERENTIAL_PRE_EDIT_LOOKUP_BUDGET
      : PRE_EDIT_LOOKUP_BUDGET;
    let preEditBlockThreshold = referentialCodePrompt
      ? REFERENTIAL_PRE_EDIT_BLOCK_THRESHOLD
      : PRE_EDIT_BLOCK_THRESHOLD;
    let executionPhase: ExecutionPhase = 'resolveIntent';
    let replayAppliedCount = 0;
    let replaySource: string | undefined;
    let needsClarification = false;
    let hasStructuredClarification = false;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCacheReadTokens = 0;
    let totalCacheWriteTokens = 0;
    let ptcContainerId: string | undefined; // PTC: reuse sandbox container across iterations

    // Deadline tracker for checkpoint timing (default: 5 min Vercel limit)
    const deadline = options.deadlineMs
      ? createDeadlineTracker(options.deadlineMs, 300_000)
      : createDeadlineTracker(Date.now(), 300_000);

    const specialistLifecycle = new SpecialistLifecycleTracker();
    const specialistReactionRules = defaultSpecialistReactionRules();
    const orchestrationSignals: OrchestrationActivitySignal[] = [];
    const queuedReactionInstructions: string[] = [];
    let reactionEscalationMessage: string | null = null;
    // Avoid repeated exploration calls in the same context version.
    let contextVersion = 0;
    const lookupCallVersion = new Map<string, number>();
    const lookupResultCache = new Map<string, { version: number; content: string; is_error?: boolean }>();
    // Telemetry: track on-demand file reads and time-to-first-token
    let filesReadOnDemand = 0;
    let firstTokenMs = 0;
    let hasAttemptedEdit = false;
    let totalToolCalls = 0;
    let postEditNoChangeIterations = 0;
    let zeroToolIterationStreak = 0;
    let readOnlyIterationCount = 0;
    let failedMutationCount = 0;
    let currentStrategy: ExecutionStrategy = initialStrategy;
    const toolSequenceLog: string[] = [];
    let debugFixAttemptCount = 0;
    let preEditLookupBlockedCount = 0;
    let prematureStopNudges = 0;
    let finalizationNudgeSent = false;
    let enactEnforcementCount = 0;
    let firstEditSlaNudges = 0;
    let forceNoLookupUntilEdit = false;
    let lastMutationFailure: MutationFailure | null = null;
    const proposeOnlyFiles = new Set<string>();
    const toolOutputCache = new Map<string, string>();
    let lastVerificationIteration = -10;
    const consecutiveVerifyFailures = new Map<string, number>();
    let totalVerificationInjections = 0;
    const MAX_VERIFICATION_INJECTIONS = 6;
    let rethinkCount = 0;
    const maxRethinks = tier === 'ARCHITECTURAL' ? 3 : tier === 'COMPLEX' ? 2 : 1;
    let consecutiveReviewRejections = 0;
    let changesAtLastReviewRejection = 0;

    // Structured file interaction log for memory anchors.
    // Tracks which files were read/edited with line ranges.
    const fileReadLog = new Map<string, Set<string>>();   // file -> set of "lines 10-50" descriptors
    const fileEditLog = new Map<string, number>();        // file -> edit count
    const readLinesRangeCallCount = new Map<string, number>();
    let lastProactiveAnchorIteration = -100;

    const normalizeFileRef = (value: string): string =>
      value.replace(/\\/g, '/').trim().toLowerCase();
    const buildReadLinesSignature = (input: Record<string, unknown> | undefined): string | null => {
      if (!input) return null;
      const file = String(input.filePath ?? input.file_path ?? input.path ?? input.fileId ?? '').trim();
      if (!file) return null;
      const startRaw = input.startLine ?? input.start_line;
      const endRaw = input.endLine ?? input.end_line;
      const start = Number(startRaw);
      const end = Number(endRaw);
      if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
      return `${normalizeFileRef(file)}:${Math.max(1, start)}-${Math.max(1, end)}`;
    };

    function trackFileRead(filePath: string, startLine?: number, endLine?: number): void {
      if (!fileReadLog.has(filePath)) fileReadLog.set(filePath, new Set());
      if (startLine != null && endLine != null) {
        fileReadLog.get(filePath)!.add(`${startLine}-${endLine}`);
      }
    }
    function trackFileEdit(filePath: string): void {
      fileEditLog.set(filePath, (fileEditLog.get(filePath) ?? 0) + 1);
    }
    function normalizeToolResult(
      evtName: string,
      result: ToolResult | undefined,
    ): ToolResult {
      const raw = result;
      if (!raw || typeof raw.content !== 'string') {
        return {
          tool_use_id: raw?.tool_use_id ?? '',
          content: `Invalid tool result for ${evtName}: missing content payload.`,
          is_error: true,
        };
      }
      const isMutation = MUTATING_TOOL_NAMES.has(evtName) || evtName === 'search_replace';
      if (isMutation && raw.content.trim().length === 0) {
        return {
          tool_use_id: raw.tool_use_id,
          content: `${evtName} returned an empty payload. Treating as failure to prevent silent continuation.`,
          is_error: true,
        };
      }
      return raw;
    }

    function buildMemoryAnchor(): string {
      const readSummaries: string[] = [];
      for (const [file, ranges] of fileReadLog) {
        const shortName = file.replace(/^.*[/\\]/, '');
        if (ranges.size > 0) {
          const rangeList = [...ranges].slice(0, 6).join(', ');
          const overflow = ranges.size > 6 ? ` +${ranges.size - 6} more` : '';
          readSummaries.push(`${shortName} (lines ${rangeList}${overflow})`);
        } else {
          readSummaries.push(shortName);
        }
      }

      const editSummaries: string[] = [];
      for (const [file, count] of fileEditLog) {
        const shortName = file.replace(/^.*[/\\]/, '');
        editSummaries.push(`${shortName} (${count} edit${count !== 1 ? 's' : ''})`);
      }

      const recentActions = toolSequenceLog.slice(-10).join(' -> ');

      return [
        'MEMORY ANCHOR (do not forget):',
        `Files already read: ${readSummaries.join(', ') || '(none)'}`,
        `Files edited: ${editSummaries.join(', ') || '(none)'}`,
        `Total accumulated changes: ${accumulatedChanges.length}`,
        `Last actions: ${recentActions || '(none)'}`,
        `Current goal: ${userRequest.slice(0, 200)}`,
        '',
        'Do NOT re-read files listed above. Continue from where you left off.',
      ].join('\n');
    }

    const invalidateProjectGraphs = () => {
      dependencyGraphCache.invalidateProject(projectId).catch(() => {});
      symbolGraphCache.invalidateProject(projectId).catch(() => {});
    };

    // Apply initial strategy overrides from tier auto-mapping
    if (currentStrategy === 'GOD_MODE') {
      MAX_ITERATIONS = ITERATION_LIMITS.code;
      preEditLookupBudget = referentialCodePrompt
        ? REFERENTIAL_PRE_EDIT_LOOKUP_BUDGET
        : GOD_MODE_PRE_EDIT_LOOKUP_BUDGET;
      preEditBlockThreshold = referentialCodePrompt
        ? REFERENTIAL_PRE_EDIT_BLOCK_THRESHOLD
        : GOD_MODE_PRE_EDIT_BLOCK_THRESHOLD;
      forceNoLookupUntilEdit = false;
      console.log(`[V2] God Mode auto-activated from tier=${tier}`);
    } else if (currentStrategy === 'SIMPLE') {
      MAX_ITERATIONS = tier === 'TRIVIAL' ? 4 : 6;
    }

    onProgress?.({
      type: 'thinking',
      phase: 'strategy',
      label: `Strategy: ${currentStrategy}`,
      metadata: { strategy: currentStrategy, tier },
    });

    onProgress?.({
      type: 'thinking',
      phase: 'analyzing',
      subPhase: 'building_context',
      label: `${tier} tier — ${currentStrategy} strategy — ${model.split('/').pop() ?? model}`,
      metadata: { routingTier: tier, strategy: currentStrategy },
    });
    executionPhase = 'buildPatch';

    // Graceful fallback: for providers without tool streaming, run a single non-tool
    // completion turn instead of failing the execution.
    if (!toolStreamingSupported) {
      onProgress?.({
        type: 'thinking',
        phase: 'analyzing',
        label: 'Tool streaming unavailable — using fallback response mode',
        detail: 'Continuing without tool calls for this provider.',
      });

      let fallbackText = '';
      let totalInputTokens = 0;
      let totalOutputTokens = 0;

      const fallbackOptions: Partial<AICompletionOptions> = {
        model,
        maxTokens: intentMode === 'ask' ? 2048 : 4096,
        ...(AI_FEATURES.adaptiveThinking ? {
          thinking: { type: 'adaptive' },
          effort: tier === 'ARCHITECTURAL' ? 'high' : tier === 'COMPLEX' ? 'medium' : 'low',
        } : {}),
      };

      try {
        const streamResult = await provider.stream(messages, fallbackOptions);
        const reader = streamResult.stream.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;
          fallbackText += value;
          onContentChunk?.(value);
        }
        try {
          const usage = await streamResult.getUsage();
          totalInputTokens += usage.inputTokens;
          totalOutputTokens += usage.outputTokens;
        } catch {
          // Best-effort usage collection.
        }
      } catch {
        // If streaming fallback fails, degrade to single-shot completion.
        const completion = await provider.complete(messages, fallbackOptions);
        fallbackText = completion.content ?? '';
        totalInputTokens += completion.inputTokens ?? 0;
        totalOutputTokens += completion.outputTokens ?? 0;
        if (fallbackText) {
          onContentChunk?.(fallbackText);
        }
      }

      if (intentMode === 'code') {
        const codeFallbackMsg =
          'I cannot run edit tools with the current provider, so I returned guidance only. ' +
          'Switch to a tool-enabled model/provider to apply changes directly.';
        fallbackText = fallbackText.trim() ? `${fallbackText}\n\n${codeFallbackMsg}` : codeFallbackMsg;
      }

      const fallbackStatus =
        intentMode === 'code' ? 'failed' : 'completed';
      if (intentMode === 'code') {
        appendExecutionTerminalLog(
          executionId,
          'result',
          'Code-mode request ended without mutating changes because the provider could not execute tools.',
        );
      }
      updateExecutionStatus(executionId, fallbackStatus);
      await persistExecution(executionId);

      const finalAnalysis = ensureCompletionResponseSections({
        analysis: fallbackText || 'Completed in fallback response mode.',
        intentMode,
        needsClarification: false,
        changes: [],
        reviewResult: undefined,
      });

      return {
        agentType: 'project_manager',
        success: true,
        analysis: finalAnalysis,
        needsClarification: false,
        directStreamed: true,
        usage: {
          totalInputTokens,
          totalOutputTokens,
          totalCacheReadTokens: 0,
          totalCacheWriteTokens: 0,
          model,
          provider: providerName,
          tier,
        },
      };
    }

    // ── Tool executor contexts ────────────────────────────────────────

    // Lazy-init Supabase service client for PM-level tool writes
    let pmSupabase: import('@supabase/supabase-js').SupabaseClient | undefined;
    const getPmSupabase = async () => {
      if (pmSupabase) return pmSupabase;
      try {
        const { createServiceClient } = await import('@/lib/supabase/admin');
        pmSupabase = createServiceClient();
      } catch { /* unavailable */ }
      return pmSupabase;
    };

    const revertHistory = new Map<string, string>();

    const pmOnFileChanged = (change: { fileId: string; fileName: string; originalContent: string; proposedContent: string; reasoning: string }) => {
      // Store the original content for undo_edit (only the first version before any edits)
      if (!revertHistory.has(change.fileId)) {
        revertHistory.set(change.fileId, change.originalContent);
      }
      const codeChange: CodeChange = {
        fileId: change.fileId,
        fileName: change.fileName,
        originalContent: change.originalContent,
        proposedContent: change.proposedContent,
        reasoning: change.reasoning,
        agentType: 'project_manager',
      };
      accumulatedChanges.push(codeChange);
      const pmEventId = `pm-change-${Date.now()}`;
      onToolEvent?.({
        type: 'tool_call',
        name: 'propose_code_edit',
        id: pmEventId,
        input: {
          filePath: change.fileName,
          newContent: change.proposedContent,
          reasoning: change.reasoning,
        },
      });
      onToolEvent?.({
        type: 'tool_result',
        name: 'propose_code_edit',
        id: pmEventId,
        result: `Tracked change for ${change.fileName} (${(change.proposedContent ?? '').split('\n').length} lines).`,
        isError: false,
      });

      // Incrementally update the theme map for this file (fire-and-forget)
      import('@/lib/agents/theme-map').then(({ triggerFileReindex }) => {
        triggerFileReindex(projectId, {
          path: change.fileName,
          content: change.proposedContent,
          fileId: change.fileId,
          fileName: change.fileName,
        });
      }).catch(() => { /* theme map not critical */ });
    };

    fileStore = new FileStore(
      allFiles,
      options.loadContent,
      undefined,
      projectId,
      pmOnFileChanged,
    );
    const toolCtx: ToolExecutorContext = {
      files: allFiles,
      contextEngine,
      projectId,
      userId,
      loadContent: options.loadContent,
      sessionId: options.sessionId,
      fileStore,
      onFileChanged: pmOnFileChanged,
      revertHistory,
      shopifyConnectionId: options.shopifyConnectionId,
      themeId: options.themeId,
    };

    // V2 tool executor context (for run_specialist, run_review)
    const v2ToolCtx: V2ToolExecutorContext = {
      files: allFiles,
      projectId,
      userId,
      executionId,
      userRequest,
      userPreferences,
      accumulatedChanges,
      onCodeChange: (change: CodeChange) => {
        accumulatedChanges.push(change);
        const specialistEventId = `specialist-${Date.now()}`;
        onToolEvent?.({
          type: 'tool_call',
          name: 'propose_code_edit',
          id: specialistEventId,
          input: {
            filePath: change.fileName,
            newContent: change.proposedContent,
            reasoning: change.reasoning,
          },
        });
        onToolEvent?.({
          type: 'tool_result',
          name: 'propose_code_edit',
          id: specialistEventId,
          result: `Tracked specialist change for ${change.fileName} (${(change.proposedContent ?? '').split('\n').length} lines).`,
          isError: false,
        });
      },
      onReasoningChunk: options.onReasoningChunk,
      onSpecialistLifecycleEvent: (event) => {
        const record = specialistLifecycle.onEvent(event);
        onProgress?.({
          type: 'specialist_lifecycle',
          phase: 'orchestration',
          label: `${record.agent}: ${record.state}`,
          metadata: {
            agent: record.agent,
            state: record.state,
            retries: record.retries,
            details: record.details ?? null,
          },
        });

        const decisions = evaluateSpecialistReactions({
          record,
          rules: specialistReactionRules,
        });
        for (const decision of decisions) {
          onProgress?.({
            type: 'orchestration_reaction',
            phase: 'orchestration',
            label: decision.ruleId,
            detail: decision.message,
            metadata: {
              ruleId: decision.ruleId,
              action: decision.action,
              escalate: decision.escalate,
            },
          });
          orchestrationSignals.push({
            type: decision.escalate ? 'specialist_escalated' : 'specialist_reaction',
            agent: record.agent as OrchestrationActivitySignal['agent'],
            timestampMs: Date.now(),
            details: {
              ruleId: decision.ruleId,
              action: decision.action,
              message: decision.message,
            },
          });
          if (decision.escalate) {
            reactionEscalationMessage = decision.message;
          } else {
            queuedReactionInstructions.push(decision.message);
          }
        }
      },
      onActivitySignal: (signal) => {
        orchestrationSignals.push(signal);

        // Checkpoint after specialist and review completions (fire-and-forget)
        if (isBackgroundResumeEnabled()) {
          const dirtyIds = [...fileStore.getDirtyFileIds()];
          if (signal.type === 'specialist_completed') {
            checkpointSaveAfterSpecialist(
              executionId,
              signal.agent,
              { agentType: signal.agent, success: true, analysis: '' },
              dirtyIds,
              [...accumulatedChanges],
            ).catch(() => {});
          } else if (signal.type === 'review_completed') {
            checkpointSaveAfterReview(executionId).catch(() => {});
          }
        }
      },
      model: options.model,
      dependencyContext: undefined,
      designContext: designContext || undefined,
      memoryContext: options.memoryContext,
      loadContent: options.loadContent,
      onProgress,
      specialistCallCount: { value: 0 },
      tier,
      maxQuality: options.maxQuality,
      // Mutable: v2-tool-executor appends after each successful run_specialist so later specialists see prior edits (cross-specialist context).
      changeSummaries: [],
      scoutBrief: currentScoutBrief,
      getMemoryAnchor: buildMemoryAnchor,
    };

    const unifiedCtx: UnifiedToolContext = { io: toolCtx, orchestration: v2ToolCtx };

    // Map of pre-loaded files for read_file short-circuiting
    const preloadedMap = new Map<string, FileContext>();
    for (const f of preloaded.filter(p => p.content && !p.content.startsWith('['))) {
      preloadedMap.set(f.fileId, f);
      preloadedMap.set(f.fileName, f);
      if (f.path) preloadedMap.set(f.path, f);
    }

    // â”€â”€ Inject style-aware reference context into preloadedMap â”€â”€â”€â”€â”€â”€

    // Batched reference hydration: collect all stub IDs, single loadContent call
    if (options.loadContent) {
      const allHydrationIds = new Set<string>();

      const refStubIds = refSections
        .filter(f => !f.content || f.content.startsWith('['))
        .map(f => f.fileId);
      for (const id of refStubIds) allHydrationIds.add(id);

      const needCssHydration = preloadedCssFile
        && !preloadedMap.has(preloadedCssFile.fileName)
        && (!preloadedCssFile.content || preloadedCssFile.content.startsWith('['));
      if (needCssHydration) allHydrationIds.add(preloadedCssFile!.fileId);

      const consumerStubIds = snippetConsumers
        .filter(f => !f.content || f.content.startsWith('['))
        .map(f => f.fileId);
      for (const id of consumerStubIds) allHydrationIds.add(id);

      let batchHydratedMap = new Map<string, FileContext>();
      if (allHydrationIds.size > 0) {
        try {
          const hydrated = await options.loadContent([...allHydrationIds]);
          batchHydratedMap = new Map(hydrated.map((f: FileContext) => [f.fileId, f]));
        } catch { /* best-effort hydration */ }
      }

      for (const ref of refSections) {
        const h = batchHydratedMap.get(ref.fileId) ?? ref;
        if (h.content && !h.content.startsWith('[')) {
          preloadedMap.set(h.fileName, h);
          if (h.path) preloadedMap.set(h.path, h);
          readFiles.add(h.fileName);
        }
      }

      if (preloadedCssFile && !preloadedMap.has(preloadedCssFile.fileName)) {
        const h = batchHydratedMap.get(preloadedCssFile.fileId) ?? preloadedCssFile;
        const cssContent = h.content;
        if (cssContent && !cssContent.startsWith('[')) {
          const cssCopy = { ...preloadedCssFile, content: cssContent };
          preloadedMap.set(cssCopy.fileName, cssCopy);
          if (cssCopy.path) preloadedMap.set(cssCopy.path, cssCopy);
          readFiles.add(cssCopy.fileName);
        }
      }

      for (const consumer of snippetConsumers) {
        const h = batchHydratedMap.get(consumer.fileId) ?? consumer;
        if (h.content && !h.content.startsWith('[')) {
          preloadedMap.set(h.fileName, h);
          if (h.path) preloadedMap.set(h.path, h);
          readFiles.add(h.fileName);
        }
      }
    }

    // Phase 1.3: Telemetry â€” style context loaded
    onProgress?.({
      type: 'thinking',
      phase: 'analyzing',
      label: 'Style profile loaded',
      metadata: {
        styleProfileRules: styleProfileStats.tokenCount + styleProfileStats.styleRuleCount + styleProfileStats.patternCount + styleProfileStats.memoryCount,
        designTokenCount: styleProfileStats.tokenCount,
        patternConflictResolutions: styleProfileStats.conflictResolutions,
        referenceSectionsLoaded: refSections.length,
        cssPreloaded: !!preloadedCssFile,
        snippetConsumers: snippetConsumers.length,
      },
    });

    // ── Pre-loop referential short-circuit ──────────────────────────
    let skippedLoop = false;
    if (referentialCodePrompt && referentialArtifacts.length > 0 && accumulatedChanges.length === 0) {
      const preReplay = applyReferentialArtifactsAsChanges(
        referentialArtifacts, allFiles, preloadedMap, accumulatedChanges,
      );
      if (preReplay.applied > 0) {
        hasAttemptedEdit = true;
        replayAppliedCount = preReplay.applied;
        replaySource = referentialArtifacts[0]?.sourceExecutionId;
        executionPhase = 'applyPatch';
        fullText = `Applied ${preReplay.applied} change(s) from prior execution.`;
        skippedLoop = true;
        onProgress?.({ type: 'thinking', phase: 'executing',
          label: `Replayed ${preReplay.applied} artifact(s) directly — skipped exploration` });
      } else if (preReplay.applied === 0) {
        const unresolvedPaths = referentialArtifacts
          .map(a => a.filePath ?? 'unknown')
          .join(', ');
        messages.push({
          role: 'user',
          content: `[SYSTEM] Referential artifacts could not be applied automatically (files: ${unresolvedPaths}). The proposed changes from the previous turn are included below for reference — apply them manually using search_replace or propose_code_edit.\n\n${referentialArtifacts.map(a => `File: ${a.filePath}\n\`\`\`\n${a.newContent?.slice(0, 3000) ?? '[no content]'}\n\`\`\``).join('\n\n')}`,
        });
      }
    }

    // ── Validation baseline + Supabase init (parallel) ──────────────
    let baselineErrorCount = 0;
    const [, pmSupa] = await Promise.all([
      (async () => {
        if (intentMode === 'code' || intentMode === 'debug') {
          try {
            const baselineFiles = allFiles.map((f) => ({ path: f.path ?? f.fileName, content: f.content }));
            const baseline = runThemeCheck(baselineFiles, undefined, { bypassCache: true });
            baselineErrorCount = baseline.errorCount;
          } catch { /* theme check unavailable */ }
        }
      })(),
      getPmSupabase(),
    ]);
    if (pmSupa) {
      toolCtx.supabaseClient = pmSupa;
      v2ToolCtx.supabaseClient = pmSupa;
      fileStore.setSupabaseClient(pmSupa);
    }

    // ── Inject past successful outcomes (episodic memory, quality-gated) ───
    if (pmSupa && intentMode === 'code') {
      try {
        const { retrieveSimilarOutcomes, formatOutcomesForPrompt } = await import('@/lib/agents/memory/task-outcomes');
        const pastOutcomes = await retrieveSimilarOutcomes(pmSupa, projectId, userRequest, 5, 0.5);
        if (pastOutcomes.length > 0) {
          const outcomeContext = formatOutcomesForPrompt(pastOutcomes, {
            similarityThreshold: 0.7,
            maxAge: 90,
            maxResults: 3,
          });
          if (outcomeContext) {
            messages.push({ role: 'user', content: `[SYSTEM] ${outcomeContext}` } as AIMessage);
            console.log(`[V2] Injected quality-gated past outcomes into context (from ${pastOutcomes.length} candidates)`);
          }
        }
      } catch { /* task_outcomes table may not exist yet */ }
    }

    // ── Agent loop ────────────────────────────────────────────────────
    while (!skippedLoop && iteration < MAX_ITERATIONS) {
      const toolCallsAtIterationStart = totalToolCalls;
      const changesAtIterationStart = accumulatedChanges.length;
      let mutatingAttemptedThisIteration = false;
      if (Date.now() - startTime > TOTAL_TIMEOUT_MS) {
        console.warn(`[V2] Timeout after ${iteration} iterations`);
        break;
      }

      if (intentMode === 'code' && !hasAttemptedEdit && totalToolCalls >= FIRST_EDIT_TOOL_CALL_SLA) {
        if (firstEditSlaNudges === 0) {
          firstEditSlaNudges = 1;
          forceNoLookupUntilEdit = true;
          const primaryTarget = currentScoutBrief?.suggestedEditOrder?.[0]
            ?? currentScoutBrief?.keyFiles?.[0]?.path
            ?? preloaded[0]?.fileName;
          messages.push({
            role: 'user',
            content:
              `SYSTEM: Edit SLA reached (${totalToolCalls} tool calls without a mutation). ` +
              `Stop exploration now and make a direct edit using read_lines -> edit_lines on ${primaryTarget ?? 'the primary target file'}. ` +
              'Do not call additional lookup tools before the edit.',
          } as AIMessage);
          onProgress?.({
            type: 'thinking',
            phase: 'editing',
            label: 'Edit SLA reached — forcing direct mutation',
            detail: primaryTarget ? `Target: ${primaryTarget}` : undefined,
          });
        } else if (totalToolCalls >= FIRST_EDIT_TOOL_CALL_ABORT) {
          needsClarification = true;
          hasStructuredClarification = true;
          const clarMsg =
            `I still cannot safely mutate after ${totalToolCalls} tool calls. ` +
            'Please confirm the exact file/path and intended line-level change.';
          messages.push({ role: 'user', content: `SYSTEM: ${clarMsg}` } as AIMessage);
          onProgress?.({
            type: 'thinking',
            phase: 'clarification',
            label: 'Need target confirmation before editing',
            detail: clarMsg,
            metadata: {
              clarificationRound: 1,
              maxRounds: 2,
              options: [
                { id: 'confirm-target', label: 'Confirm exact target file/path', recommended: true },
                { id: 'provide-before-after', label: 'Provide exact before/after snippet' },
              ],
            },
          });
        }
      }

      // Deadline check: if running out of time, checkpoint and enqueue continuation
      if (isBackgroundResumeEnabled() && deadline.shouldCheckpoint() && iteration > 0) {
        console.warn(`[V2] Deadline approaching — checkpointing at iteration ${iteration}`);
        if (fileStore) {
          await fileStore.flush();
          const dirtyIds = [...fileStore.getDirtyFileIds()];
          await checkpointSaveAfterSpecialist(executionId, 'pm', {
            agentType: 'project_manager',
            success: true,
            analysis: fullText,
          }, dirtyIds, [...accumulatedChanges]);
        }

        onProgress?.({
          type: 'checkpointed',
          phase: 'background',
          label: 'Continuing in background...',
          metadata: { executionId, iteration },
        });

        // Enqueue continuation job
        try {
          const { enqueueAgentJob, triggerDispatch } = await import('@/lib/tasks/agent-job-queue');
          await enqueueAgentJob({
            executionId,
            projectId,
            userId,
            userRequest,
            options: {
              ...options,
              onProgress: undefined,
              onContentChunk: undefined,
              onToolEvent: undefined,
              onReasoningChunk: undefined,
              loadContent: undefined,
            } as Record<string, unknown>,
          });
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
          triggerDispatch(appUrl);
        } catch (err) {
          console.error('[V2] Failed to enqueue continuation job:', err);
        }

        return {
          agentType: 'project_manager',
          success: true,
          analysis: fullText || 'Agent checkpointed and continuing in background.',
          changes: accumulatedChanges.length > 0 ? accumulatedChanges : undefined,
          needsClarification: false,
          directStreamed: true,
          checkpointed: true,
          usage: {
            totalInputTokens,
            totalOutputTokens,
            totalCacheReadTokens: 0,
            totalCacheWriteTokens: 0,
            model,
            provider: providerName,
            tier,
          },
        };
      }

      // Intra-loop context compression: smart compression before enforceRequestBudget
      const contextTokens = messages.reduce(
        (sum, m) => sum + estimateTokens(typeof m.content === 'string' ? m.content : JSON.stringify(m.content)),
        0,
      );
      const contextLimit = model.includes('claude') ? 180_000 : model.includes('gpt') ? 120_000 : 100_000;
      if (contextTokens > contextLimit * 0.70 && iteration >= 3) {
        let compressed = 0;
        const recentBoundary = Math.max(0, messages.length - 10);
        const seenFileReads = new Map<string, number>();

        for (let mi = 0; mi < messages.length; mi++) {
          const msg = messages[mi];
          if (msg.role === 'system') continue;
          if ((msg as AIMessage).cacheControl) continue;
          if (typeof msg.content !== 'string') continue;
          if (msg.content.includes('MEMORY ANCHOR')) continue;

          // Deduplicate file reads: keep only the most recent read of each file
          const readMatch = msg.content.match(/^## File: (.+?)(?:\n|$)/);
          if (readMatch && msg.role === 'user') {
            const filePath = readMatch[1];
            const prevIdx = seenFileReads.get(filePath);
            if (prevIdx !== undefined && prevIdx < recentBoundary) {
              messages[prevIdx].content = `[See latest read of ${filePath}]`;
              compressed++;
            }
            seenFileReads.set(filePath, mi);
          }

          // Compress old tool results (file content older than recent window)
          if (mi < recentBoundary && msg.role === 'user' && msg.content.length > 1500) {
            const lines = msg.content.split('\n');
            if (lines.length > 40) {
              const head = lines.slice(0, 20).join('\n');
              const tail = lines.slice(-10).join('\n');
              msg.content = head + `\n[... ${lines.length - 30} lines compressed ...]\n` + tail;
              compressed++;
            }
          }
        }

        if (compressed > 0) {
          console.log(`[V2] Intra-loop compression: ${compressed} messages compressed at ${contextTokens}/${contextLimit} tokens (${Math.round(contextTokens / contextLimit * 100)}%)`);
        }
      }

      // ── Proactive memory anchor: inject before context editing fires ──
      // If we're approaching the trigger threshold, inject now so the anchor
      // is already in the conversation before the server-side clearing pass.
      const isAnthropic = providerName === 'anthropic';
      if (
        isAnthropic &&
        AI_FEATURES.contextEditing &&
        (fileReadLog.size > 0 || fileEditLog.size > 0) &&
        (iteration - lastProactiveAnchorIteration) >= 5
      ) {
        const triggerThreshold = currentStrategy === 'SIMPLE'
          ? CONTEXT_EDITING.SIMPLE_TRIGGER_TOKENS
          : CONTEXT_EDITING.COMPLEX_TRIGGER_TOKENS;
        const proactiveThreshold = Math.floor(triggerThreshold * CONTEXT_EDITING.PROACTIVE_ANCHOR_RATIO);
        const cumulativeTokens = totalInputTokens + totalOutputTokens;
        if (cumulativeTokens >= proactiveThreshold) {
          const anchor = buildMemoryAnchor();
          messages.push({ role: 'user', content: anchor } as AIMessage);
          lastProactiveAnchorIteration = iteration;
          console.log(`[V2-Proactive] Memory anchor injected at ${cumulativeTokens}/${triggerThreshold} tokens (${Math.round(cumulativeTokens / triggerThreshold * 100)}% of trigger)`);
        }
      }

      // Apply token budget before each iteration
      const budgeted = enforceRequestBudget(messages);

      console.log(
        `[V2] Iteration ${iteration}, messages=${budgeted.messages.length}, truncated=${budgeted.truncated}`,
      );

      // Stream with tools — gate Anthropic-specific features by provider

      const useThinking = AI_FEATURES.adaptiveThinking && currentStrategy !== 'GOD_MODE';
      const completionOpts: Record<string, unknown> = {
        model,
        maxTokens: currentStrategy === 'GOD_MODE' ? 16384 : intentMode === 'ask' ? 2048 : 4096,
        ...(isAnthropic && ptcContainerId ? { container: ptcContainerId } : {}),
        ...(useThinking ? {
          thinking: { type: 'adaptive' },
          effort: tier === 'ARCHITECTURAL' ? 'high' : tier === 'COMPLEX' ? 'medium' : 'low',
        } : {}),
        ...(isAnthropic && AI_FEATURES.contextEditing ? {
          contextManagement: {
            edits: [
              ...(useThinking ? [{
                type: 'clear_thinking_20251015' as const,
                keep: { type: 'thinking_turns' as const, value: CONTEXT_EDITING.KEEP_THINKING_TURNS },
              }] : []),
              {
                type: 'clear_tool_uses_20250919' as const,
                trigger: { type: 'input_tokens' as const, value: currentStrategy === 'SIMPLE' ? CONTEXT_EDITING.SIMPLE_TRIGGER_TOKENS : CONTEXT_EDITING.COMPLEX_TRIGGER_TOKENS },
                keep: { type: 'tool_uses' as const, value: currentStrategy === 'SIMPLE' ? CONTEXT_EDITING.SIMPLE_KEEP_TOOL_USES : CONTEXT_EDITING.COMPLEX_KEEP_TOOL_USES },
                clear_at_least: { type: 'input_tokens' as const, value: CONTEXT_EDITING.CLEAR_AT_LEAST_TOKENS },
              },
            ],
          },
        } : {}),
      };

      // In God Mode, strip blocked tools from the LLM payload so the model
      // never wastes tokens reasoning about tools it cannot use.
      // Runtime guards remain as a safety net.
      const GOD_MODE_FILTERED = new Set([
        'propose_code_edit', 'grep_content', 'search_files',
        'run_specialist', 'parallel_batch_read',
      ]);
      const effectiveTools = currentStrategy === 'GOD_MODE'
        ? tools.filter(t => !GOD_MODE_FILTERED.has(t.name))
        : tools;

      if (currentStrategy === 'GOD_MODE' && effectiveTools.length !== tools.length) {
        console.log(`[GOD-MODE] Pre-LLM filter: ${tools.length} → ${effectiveTools.length} tools (removed ${tools.length - effectiveTools.length} blocked)`);
      }

      let streamResult: ToolStreamResult;

      if (isV2StreamBroken()) {
        const batchResult = await provider.completeWithTools(budgeted.messages, effectiveTools, completionOpts);
        streamResult = synthesizeBatchAsStream(batchResult);
      } else {
        let raced: ToolStreamResult | null = null;
        try {
          const rawStream = await provider.streamWithTools(budgeted.messages, effectiveTools, completionOpts);
          raced = await raceFirstByteV2(rawStream, STREAM_FIRST_BYTE_TIMEOUT_MS);
        } catch (err) {
          console.warn('[V2] Stream creation failed:', err);
          raced = null;
        }
        if (raced) {
          streamResult = raced;
        } else {
          markV2StreamBroken();
          onProgress?.({ type: 'thinking', phase: 'analyzing', label: 'Stream unavailable — using batch mode' });
          const batchResult = await provider.completeWithTools(budgeted.messages, effectiveTools, completionOpts);
          streamResult = synthesizeBatchAsStream(batchResult);
        }
      }

      // Cache tool results during streaming (keyed by tool_use_id)
      const iterToolResults = new Map<string, { content: string; is_error?: boolean; isPTC?: boolean }>();
      const pendingServerTools: Extract<ToolStreamEvent, { type: 'tool_end' }>[] = [];
      // PTC: tool calls made by the code-execution sandbox
      const pendingPTCTools: Extract<ToolStreamEvent, { type: 'server_tool_use' }>[] = [];
      let pendingReasoning = '';
      const reader = streamResult.stream.getReader();
      let streamReadInterrupted = false;
      let streamReadError: unknown = null;

      try {
        while (true) {
          let readResult: ReadableStreamReadResult<ToolStreamEvent>;
          try {
            readResult = await reader.read();
          } catch (streamErr) {
            console.error('[V2] Mid-stream read error:', streamErr);
            streamReadInterrupted = true;
            streamReadError = streamErr;
            break;
          }
          const { done, value } = readResult;
          if (done) break;

          const event = value as ToolStreamEvent;

          // ── Text streaming ──────────────────────────────────────────
          if (event.type === 'text_delta') {
            if (firstTokenMs === 0) firstTokenMs = Date.now() - startTime;
            fullText += event.text;
            onContentChunk?.(event.text);
            pendingReasoning = '';
          }

          // Forward thinking events to the reasoning UI and accumulate for tool reasoning trace
          if (event.type === 'thinking_delta') {
            options.onReasoningChunk?.('project_manager', event.text);
            pendingReasoning += event.text;
          }

          // ── Tool start ──────────────────────────────────────────────
          if (event.type === 'tool_start') {
            const reasoning = pendingReasoning.trim() || undefined;
            pendingReasoning = '';
            onToolEvent?.({
              type: 'tool_start',
              name: event.name,
              id: event.id,
              reasoning,
            });
          }

          // ── Tool end ────────────────────────────────────────────────
          if (event.type === 'tool_end') {
            // ── GOD MODE GUARD ──────────────────────────────────────────
            // In God Mode the agent should prefer structural editing tools.
            // search_replace is auto-converted to edit_lines when possible,
            // but allowed as a fallback when deterministic line mapping fails.
            const GOD_MODE_HARD_BLOCKED = new Set([
              'propose_code_edit',
              'grep_content',
              'search_files',
              'run_specialist',
              'parallel_batch_read',
            ]);

            if (currentStrategy === 'GOD_MODE') {
              // Hard-blocked tools: no conversion possible
              if (GOD_MODE_HARD_BLOCKED.has(event.name)) {
                const guardPath = (event.input?.filePath ?? event.input?.file_path ?? event.input?.fileName ?? event.input?.pattern ?? '') as string;
                console.log(`[GOD-MODE] Blocked ${event.name} (${guardPath}) — must use read_lines + edit_lines`);
                const blockMsg =
                  `❌ ${event.name} is blocked in God Mode. Use read_lines (single-file, scoped ranges) + edit_lines for deterministic edits.`;
                iterToolResults.set(event.id, { content: blockMsg, is_error: true });
                hasAttemptedEdit = true;
                mutatingAttemptedThisIteration = true;
                totalToolCalls += 1;
                onToolEvent?.({
                  type: 'tool_result',
                  name: event.name,
                  id: event.id,
                  result: blockMsg,
                  isError: true,
                });
                continue;
              }

              // search_replace → edit_lines auto-conversion
              if (event.name === 'search_replace') {
                const srFilePath = String(event.input?.filePath ?? event.input?.file_path ?? '');
                const oldText = String(event.input?.old_text ?? '');
                const newText = String(event.input?.new_text ?? '');

                const matchedFile = allFiles.find(f =>
                  f.fileName === srFilePath || f.path === srFilePath
                  || f.fileName.endsWith('/' + srFilePath) || f.path?.endsWith('/' + srFilePath),
                );

                // Read content from FileStore (has real content) instead of allFiles (may have stubs)
                let fileContent = matchedFile?.content ?? '';
                if (fileStore && matchedFile && (!fileContent || fileContent.startsWith('['))) {
                  try {
                    const hydrated = await fileStore.read(matchedFile.fileId);
                    if (hydrated?.content) fileContent = hydrated.content;
                  } catch { /* fall through to block */ }
                }
                const lineCount = fileContent ? fileContent.split('\n').length : 0;

                let converted = false;
                if (fileContent && oldText && lineCount > 0) {
                  const idx = fileContent.indexOf(oldText);
                  if (idx !== -1) {
                    const startLine = fileContent.slice(0, idx).split('\n').length;
                    const endLine = startLine + oldText.split('\n').length - 1;
                    console.log(`[GOD-MODE] Auto-converting search_replace → edit_lines (${srFilePath} L${startLine}-${endLine})`);

                    (event as Record<string, unknown>).name = 'edit_lines';
                    event.input = {
                      filePath: srFilePath,
                      startLine,
                      endLine,
                      newContent: newText,
                      mode: 'replace',
                      reasoning: `Auto-converted from search_replace in God Mode`,
                    };
                    converted = true;

                    onProgress?.({
                      type: 'thinking',
                      phase: 'tool_execution',
                      label: `⚡ Auto-converting search_replace → edit_lines (L${startLine}-${endLine})`,
                    });
                  }
                }

                if (!converted) {
                  const detail = lineCount > 0
                    ? `old_text not found in ${srFilePath} (${lineCount} lines)`
                    : `file not in context`;
                  console.log(`[GOD-MODE] search_replace fallback (${srFilePath}) — ${detail}`);
                  onProgress?.({
                    type: 'thinking',
                    phase: 'tool_execution',
                    label: `Using search_replace fallback (${detail})`,
                  });
                }
              }
            }

            const isServerTool = V2_SERVER_TOOLS.has(event.name);

            if (isServerTool) {
              pendingServerTools.push(event);
            } else {
              // UI-only tools (ask_clarification, propose_plan) — not executed server-side
              onToolEvent?.({
                type: 'tool_call',
                name: event.name,
                id: event.id,
                input: event.input,
              });

              if (event.name === 'ask_clarification') {
                needsClarification = true;
                const inputOptions = (event.input?.options as Array<{ id?: string; label?: string }> | undefined) ?? [];
                if (Array.isArray(inputOptions) && inputOptions.length > 0) {
                  hasStructuredClarification = true;
                }
                // Hard stop contract: once clarification is requested, pause automation
                // until user feedback arrives in a new run.
                onProgress?.({
                  type: 'thinking',
                  phase: 'complete',
                  label: 'Awaiting your input to continue',
                });
              }

              iterToolResults.set(event.id, { content: `Tool ${event.name} forwarded to client.` });
              onToolEvent?.({
                type: 'tool_result',
                name: event.name,
                id: event.id,
                result: `Tool ${event.name} forwarded to client.`,
                isError: false,
              });
              totalToolCalls += 1;
            }
          }

          // ── PTC: server_tool_use — sandbox calling our tools ────────
          if (event.type === 'server_tool_use') {
            pendingPTCTools.push(event);
            onToolEvent?.({
              type: 'tool_start',
              name: `ptc:${event.name}`,
              id: event.id,
            });
          }

          // ── PTC: code_execution_result — sandbox output ─────────────
          if (event.type === 'code_execution_result') {
            const label = event.returnCode === 0 ? 'completed' : `exit ${event.returnCode}`;
            console.log(`[V2-PTC] Code execution ${label}: stdout=${event.stdout.length}B stderr=${event.stderr.length}B`);
            onProgress?.({
              type: 'thinking',
              phase: 'tool_execution',
              label: `Code execution ${label}`,
              detail: event.stderr || undefined,
            });
          }
        }
      } finally {
        reader.releaseLock();
      }

      // ── Execute pending server tools (with parallelism) ─────────────
      // Additional-input contract: do not execute more tools after ask_clarification.
      if (needsClarification) {
        pendingServerTools.length = 0;
        pendingPTCTools.length = 0;
      }
      if (pendingServerTools.length > 0) {
        const maxParallel = options.maxParallelSpecialists ?? 6;
        const { parallel, sequential } = groupByFileOwnership(pendingServerTools);

        if (pendingServerTools.length > 1) {
          console.log(
            `[V2] Executing ${pendingServerTools.length} server tools ` +
            `(${parallel.length} parallel, ${sequential.length} sequential)`,
          );
        }

        // Virtual worktrees for parallel agent isolation (F1)
        const worktreeIds: string[] = [];
        if (parallel.length > 0) {
          const baseFileMap = new Map<string, string>(
            allFiles.map((f) => [f.path ?? f.fileName, f.content]),
          );
          for (const evt of parallel) {
            const wt = createWorktree(evt.id, baseFileMap);
            worktreeIds.push(wt.id);
            // TODO: Pass wt.id to tool executor via V2ToolExecutorContext so read_file/write_file
            // use the virtual worktree instead of real files. Until then, specialists write to
            // shared state and worktree merge is a no-op for conflict detection only.
          }
          const summary = getWorktreeSummary();
          onProgress?.({
            type: 'worktree_status',
            worktrees: summary.worktrees,
            conflicts: summary.conflicts,
          });
        }

        // Shared closure: execute one server tool with all side-effects preserved.
        const executeOneServerTool = async (evt: ToolEndEvent) => {
            const toolCall: AIToolCall = { id: evt.id, name: evt.name, input: evt.input };
            let toolResult!: ToolResult;
            const isLookupTool = LOOKUP_TOOL_NAMES.has(evt.name);
            if (
              intentMode === 'code' &&
              !hasAttemptedEdit &&
              isLookupTool
            ) {
              if (forceNoLookupUntilEdit) {
                toolResult = {
                  tool_use_id: evt.id,
                  content:
                    `Lookup blocked (${evt.name}) until an edit attempt occurs. ` +
                    'Use search_replace, propose_code_edit, create_file, run_specialist, or ask_clarification.',
                  is_error: true,
                };
                iterToolResults.set(evt.id, { content: toolResult.content, is_error: true });
                onToolEvent?.({
                  type: 'tool_call',
                  name: evt.name,
                  id: evt.id,
                  input: evt.input,
                  result: toolResult.content,
                  isError: true,
                });
                onToolEvent?.({
                  type: 'tool_result',
                  name: evt.name,
                  id: evt.id,
                  result: toolResult.content,
                  isError: true,
                });
                onToolEvent?.({
                  type: 'tool_error',
                  name: evt.name,
                  id: evt.id,
                  error: toolResult.content,
                  recoverable: true,
                });
                totalToolCalls += 1;
                return;
              }

              preEditLookupBlockedCount += 1;
              if (preEditLookupBlockedCount > preEditLookupBudget) {
                toolResult = {
                  tool_use_id: evt.id,
                  content:
                    `Pre-edit lookup budget exceeded (${preEditLookupBlockedCount}/${preEditLookupBudget}). ` +
                    'Proceed to an edit tool, run_specialist, or ask_clarification.',
                  is_error: true,
                };
                iterToolResults.set(evt.id, { content: toolResult.content, is_error: true });
                onToolEvent?.({
                  type: 'tool_call',
                  name: evt.name,
                  id: evt.id,
                  input: evt.input,
                  result: toolResult.content,
                  isError: true,
                });
                onToolEvent?.({
                  type: 'tool_result',
                  name: evt.name,
                  id: evt.id,
                  result: toolResult.content,
                  isError: true,
                });
                onToolEvent?.({
                  type: 'tool_error',
                  name: evt.name,
                  id: evt.id,
                  error: toolResult.content,
                  recoverable: true,
                });
                totalToolCalls += 1;
                return;
              }
            }
            const lookupSig = LOOKUP_TOOL_NAMES.has(evt.name)
              ? buildLookupSignature(evt.name, evt.input)
              : null;

            if (lookupSig && lookupCallVersion.get(lookupSig) === contextVersion) {
              const cachedLookup = lookupResultCache.get(lookupSig);
              if (cachedLookup && cachedLookup.version === contextVersion) {
                toolResult = {
                  tool_use_id: evt.id,
                  content: cachedLookup.content,
                  is_error: cachedLookup.is_error,
                };
                iterToolResults.set(evt.id, { content: toolResult.content, is_error: toolResult.is_error });
                onProgress?.({
                  type: 'thinking',
                  phase: 'analyzing',
                  label: `Reused cached ${evt.name} result`,
                });
                onToolEvent?.({
                  type: 'tool_call',
                  name: evt.name,
                  id: evt.id,
                  input: evt.input,
                  result: toolResult.content,
                  isError: toolResult.is_error,
                });
                onToolEvent?.({
                  type: 'tool_result',
                  name: evt.name,
                  id: evt.id,
                  result: toolResult.content,
                  isError: toolResult.is_error,
                });
                return;
              }
              toolResult = {
                tool_use_id: evt.id,
                content: `Skipped redundant ${evt.name} call (context already sufficient for this turn). Proceed to edit or ask clarification only if needed.`,
              };
              iterToolResults.set(evt.id, { content: toolResult.content, is_error: false });
              onProgress?.({
                type: 'thinking',
                phase: 'analyzing',
                label: `Reusing context — skipped duplicate ${evt.name}`,
              });
              onToolEvent?.({
                type: 'tool_call',
                name: evt.name,
                id: evt.id,
                input: evt.input,
                result: toolResult.content,
                isError: false,
              });
              onToolEvent?.({
                type: 'tool_result',
                name: evt.name,
                id: evt.id,
                result: toolResult.content,
                isError: false,
              });
              return;
            }

            // Short-circuit read_file for cached tool outputs (B3: large result recovery)
            const readFileId =
              evt.name === 'read_file' ? (evt.input?.fileId as string) : null;
            if (readFileId && toolOutputCache.has(readFileId)) {
              toolResult = { tool_use_id: evt.id, content: toolOutputCache.get(readFileId)! };
              iterToolResults.set(evt.id, { content: toolResult.content, is_error: false });
              onToolEvent?.({
                type: 'tool_call',
                name: evt.name,
                id: evt.id,
                input: evt.input,
                result: toolResult.content.slice(0, 500) + (toolResult.content.length > 500 ? '...' : ''),
                isError: false,
              });
              const cachedCardData = buildToolResultCardData(evt.name, evt.input, toolResult.content);
              onToolEvent?.({
                type: 'tool_result',
                name: evt.name,
                id: evt.id,
                result: toolResult.content,
                data: cachedCardData ?? undefined,
                isError: false,
              });
              return;
            }

            // Short-circuit read_file for pre-loaded files
            const preloadedFile = readFileId ? preloadedMap.get(readFileId) : null;
            let wasPreloadedReadHit = false;

            if (preloadedFile) {
              wasPreloadedReadHit = true;
              onToolEvent?.({
                type: 'tool_progress',
                name: 'read_file',
                id: evt.id,
                toolCallId: evt.id,
                progress: { phase: 'reading', detail: preloadedFile.fileName },
              });
              let content = preloadedFile.content;
              const view = String(evt.input?.view ?? 'full');
              if (view !== 'full' && isSectionFile(preloadedFile.fileName || preloadedFile.path || '')) {
                if (view === 'markup') content = contentMarkupOnly(content);
                else if (view === 'schema') content = contentSchemaOnly(content);
              }
              toolResult = {
                tool_use_id: evt.id,
                content,
              };
              console.log(
                `[V2] read_file short-circuited: ${preloadedFile.fileName} (pre-loaded)`,
              );
            } else {
              // Intercept search_replace on files that have been flagged
              let intercepted = false;
              if (evt.name === 'search_replace') {
                const targetPath = (evt.input?.filePath ?? evt.input?.file_path) as string | undefined;
                if (targetPath && proposeOnlyFiles.has(targetPath)) {
                  toolResult = {
                    tool_use_id: evt.id,
                    content: `search_replace is disabled for ${targetPath} after repeated failures. Use edit_lines with exact line numbers instead.`,
                    is_error: true,
                  };
                  intercepted = true;
                }
              }
              if (!intercepted && evt.name === 'read_lines') {
                const signature = buildReadLinesSignature(evt.input as Record<string, unknown> | undefined);
                if (signature) {
                  const seen = readLinesRangeCallCount.get(signature) ?? 0;
                  const duplicatePreEditRead =
                    currentStrategy === 'GOD_MODE' &&
                    !hasAttemptedEdit &&
                    seen >= READ_LINES_DUPLICATE_PRE_EDIT_LIMIT;
                  readLinesRangeCallCount.set(signature, seen + 1);
                  if (duplicatePreEditRead) {
                    toolResult = {
                      tool_use_id: evt.id,
                      content:
                        `Duplicate read_lines blocked for ${signature}. ` +
                        'Use edit_lines or read a different range/file from the scout index.',
                      is_error: true,
                    };
                    preEditLookupBlockedCount += 1;
                    intercepted = true;
                  }
                }
              }

              if (!intercepted) {
                const progressDetail = (() => {
                  if (evt.name === 'read_file') {
                    return { phase: 'reading', detail: String(evt.input?.fileId || evt.input?.path || evt.input?.file_path || '') };
                  }
                  if (evt.name === 'grep_content' || evt.name === 'search_files') {
                    return { phase: 'searching', detail: String(evt.input?.pattern || evt.input?.query || '') };
                  }
                  if (evt.name === 'search_replace' || evt.name === 'create_file' || evt.name === 'write_file') {
                    return { phase: 'writing', detail: String(evt.input?.filePath || evt.input?.path || evt.input?.file_path || '') };
                  }
                  return { phase: 'executing', detail: `Running ${evt.name}...` };
                })();
                onToolEvent?.({
                  type: 'tool_progress',
                  name: evt.name,
                  id: evt.id,
                  toolCallId: evt.id,
                  progress: progressDetail,
                });
                try {
                  toolResult = normalizeToolResult(evt.name, await dispatchToolCall(toolCall, unifiedCtx));
                  toolSequenceLog.push(evt.name);

                  // Track file interactions for structured memory anchors
                  if (!toolResult.is_error) {
                    const inputFilePath = (evt.input?.filePath ?? evt.input?.file_path ?? evt.input?.path ?? evt.input?.fileId) as string | undefined;
                    if (inputFilePath) {
                      if (evt.name === 'read_lines' || evt.name === 'read_chunk' || evt.name === 'extract_region') {
                        const start = Number(evt.input?.startLine ?? evt.input?.start_line ?? 0);
                        const end = Number(evt.input?.endLine ?? evt.input?.end_line ?? 0);
                        trackFileRead(inputFilePath, start || undefined, end || undefined);
                      } else if (evt.name === 'read_file') {
                        trackFileRead(inputFilePath);
                      } else if (evt.name === 'edit_lines' || evt.name === 'search_replace' || evt.name === 'write_file') {
                        trackFileEdit(inputFilePath);
                        const normalizedTarget = normalizeFileRef(inputFilePath);
                        for (const key of [...readLinesRangeCallCount.keys()]) {
                          if (key.startsWith(`${normalizedTarget}:`)) {
                            readLinesRangeCallCount.delete(key);
                          }
                        }
                      }
                    }
                  }

                  // Post-dispatch side effects for orchestration tools
                  if (evt.name === 'run_review' && !toolResult.is_error) {
                    const parsed = parseReviewToolContent(toolResult.content ?? '');
                    if (parsed) {
                      latestReviewResult = parsed;
                      setReviewResult(executionId, parsed);
                    }
                    // Track consecutive rejections — if review keeps saying NEEDS CHANGES
                    // with no new changes between rejections, we're in a rejection loop.
                    const reviewRejected = (toolResult.content ?? '').includes('NEEDS CHANGES');
                    if (reviewRejected) {
                      const currentChangeCount = accumulatedChanges.length;
                      if (currentChangeCount === changesAtLastReviewRejection) {
                        consecutiveReviewRejections++;
                      } else {
                        consecutiveReviewRejections = 1;
                      }
                      changesAtLastReviewRejection = currentChangeCount;
                      if (consecutiveReviewRejections >= 2) {
                        const reviewIssues = latestReviewResult?.issues
                          ?.map(i => `- [${i.severity}] ${i.file}: ${i.description}`)
                          .join('\n') ?? '';
                        messages.push({
                          role: 'user',
                          content: `SYSTEM: The review agent has rejected your changes ${consecutiveReviewRejections} times with no progress between rejections. This likely means the review is evaluating pre-existing issues or has incomplete context.\n\nReview summary: ${latestReviewResult?.summary ?? 'No summary'}\n${reviewIssues ? `\nIssues flagged:\n${reviewIssues}` : ''}\n\nYour changes look structurally correct. Please proceed with committing your current changes as-is and explain to the user what you changed and why the review flagged concerns. Do NOT call run_review again.`,
                        } as AIMessage);
                        consecutiveReviewRejections = 0;
                      }
                    } else {
                      consecutiveReviewRejections = 0;
                    }
                  }
                  if (evt.name === 'run_specialist' && !toolResult.is_error) {
                    hasAttemptedEdit = true;
                    preEditLookupBlockedCount = 0;
                    forceNoLookupUntilEdit = false;
                    executionPhase = 'applyPatch';
                    contextVersion += 1;
                    invalidateProjectGraphs();
                  }
                } catch (err) {
                  toolResult = {
                    tool_use_id: evt.id,
                    content: `Tool execution failed: ${String(err)}`,
                    is_error: true,
                  };
                }
              }
            }

            // Track read files for context expansion and cache full content
            if (evt.name === 'read_file' && !toolResult.is_error) {
              if (!wasPreloadedReadHit) filesReadOnDemand++;
              const fileId = evt.input?.fileId as string;
              if (fileId) readFiles.add(fileId);
              const matchedFile = files.find(
                f => f.fileId === fileId || f.fileName === fileId ||
                     f.fileName.endsWith(`/${fileId}`) ||
                     (f.path && f.path.endsWith(`/${fileId}`)),
              );
              if (matchedFile) {
                readFiles.add(matchedFile.fileName);
                if (!toolResult.content.startsWith('Lines ')) {
                  matchedFile.content = toolResult.content;
                  preloadedMap.set(matchedFile.fileName, matchedFile);
                  if (matchedFile.path) preloadedMap.set(matchedFile.path, matchedFile);
                }
              }
            }

            // Track searched files for term mapping learning
            if (
              (evt.name === 'search_files' || evt.name === 'semantic_search' || evt.name === 'grep_content') &&
              !toolResult.is_error
            ) {
              const fileNameMatches = toolResult.content.match(/(?:^|\n)\s*(?:File|Name|path):\s*(\S+)/gi);
              if (fileNameMatches) {
                for (const m of fileNameMatches) {
                  const fp = m.replace(/^.*?:\s*/, '').trim();
                  if (fp) searchedFiles.add(fp);
                }
              }
            }

            // Track failed mutation attempts to trigger corrective injection on repeated failures.
            if (
              (evt.name === 'search_replace' || evt.name === 'write_file' || evt.name === 'propose_code_edit') &&
              toolResult.is_error
            ) {
              failedMutationCount += 1;
              debugFixAttemptCount += 1;
              hasAttemptedEdit = true;
              mutatingAttemptedThisIteration = true;
              executionPhase = 'applyPatch';
              forceNoLookupUntilEdit = false;

              const failedFilePath = evt.input?.filePath as string | undefined;
              const failedReason: MutationFailure['reason'] =
                toolResult.content.includes('not found in') ? 'old_text_not_found'
                : toolResult.content.includes('File not found') ? 'file_not_found'
                : toolResult.content.includes('valid') ? 'validation_error'
                : 'unknown';
              const prevAttemptCount: number = (lastMutationFailure?.filePath === failedFilePath)
                ? (lastMutationFailure!.attemptCount + 1)
                : 1;
              const fileContent = failedFilePath
                ? preloaded.find(f => f.fileName === failedFilePath || f.path === failedFilePath)?.content
                : undefined;
              lastMutationFailure = {
                toolName: evt.name as MutationFailure['toolName'],
                filePath: failedFilePath ?? 'unknown',
                reason: failedReason,
                attemptedOldText: (evt.input?.old_text as string) ?? undefined,
                attemptCount: prevAttemptCount,
                fileLineCount: fileContent ? fileContent.split('\n').length : undefined,
              };
            }

            // Auto-lint: run check_lint on mutated files (infrastructure — not counted in totalToolCalls)
            if (
              (MUTATING_TOOL_NAMES.has(evt.name) || evt.name === 'search_replace' || evt.name === 'create_file') &&
              !toolResult.is_error
            ) {
              const lintFilePath = (evt.input?.filePath ?? evt.input?.path ?? evt.input?.file_path) as string | undefined;
              if (lintFilePath && typeof lintFilePath === 'string') {
                try {
                  const lintResult = await dispatchToolCall(
                    { id: `auto-lint-${Date.now()}`, name: 'check_lint', input: { fileName: lintFilePath } },
                    unifiedCtx,
                  );
                  if (lintResult.content && !lintResult.content.includes('No lint errors') && !lintResult.content.includes('no issues')) {
                    messages.push({
                      role: 'user',
                      content: `SYSTEM: Lint results for ${lintFilePath}:\n${lintResult.content}`,
                    } as AIMessage);
                  }
                } catch { /* lint unavailable, continue */ }
              }
            }

            // Exempt read, search, and diagnostic tools from truncation so the
            // agent sees complete output. Context budget is enforced at the
            // message level, not the tool-result level (Cursor-like approach).
            const TOOLS_NO_TRUNCATE = new Set([
              'read_file', 'read_lines', 'read_chunk', 'parallel_batch_read',
              'extract_region', 'get_schema_settings',
              'grep_content', 'semantic_search', 'glob_files',
              'lint_file', 'validate_syntax', 'run_diagnostics', 'theme_check',
              'list_files', 'get_file_info',
            ]);
            let truncatedContent = toolResult.content;
            if (toolResult.content.length > MAX_TOOL_RESULT_CHARS && !TOOLS_NO_TRUNCATE.has(evt.name)) {
              const SUMMARY_CHARS = 8_000;
              const summary = toolResult.content.slice(0, SUMMARY_CHARS);
              const fullLength = toolResult.content.length;
              const outputId = `tool-output-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
              toolOutputCache.set(outputId, toolResult.content);
              truncatedContent = `${summary}\n\n... (${fullLength} chars total, showing first ${SUMMARY_CHARS}. Full output available — use read_file with fileId "${outputId}" to see more.)`;
            }

            iterToolResults.set(evt.id, {
              content: truncatedContent,
              is_error: toolResult.is_error,
            });
            if (lookupSig && !toolResult.is_error) {
              lookupCallVersion.set(lookupSig, contextVersion);
              lookupResultCache.set(lookupSig, {
                version: contextVersion,
                content: truncatedContent,
                is_error: toolResult.is_error,
              });
            }

            onToolEvent?.({
              type: 'tool_call',
              name: evt.name,
              id: evt.id,
              input: evt.input,
              result: truncatedContent,
              isError: toolResult.is_error,
            });

            const cardData = !toolResult.is_error
              ? buildToolResultCardData(evt.name, evt.input, toolResult.content)
              : undefined;
            onToolEvent?.({
              type: 'tool_result',
              name: evt.name,
              id: evt.id,
              result: truncatedContent,
              data: cardData ?? undefined,
              isError: toolResult.is_error,
            });

            if (toolResult.is_error) {
              onToolEvent?.({
                type: 'tool_error',
                name: evt.name,
                id: evt.id,
                error: truncatedContent,
                recoverable: failedMutationCount < 3,
              });
            }
            // Don't count short-circuited read_file (pre-loaded); limit is for actual execution
            if (!wasPreloadedReadHit) totalToolCalls += 1;
        };

        // Run non-conflicting tools in parallel, chunked to maxParallel
        if (parallel.length > 0) {
          for (let i = 0; i < parallel.length; i += maxParallel) {
            const chunk = parallel.slice(i, i + maxParallel);
            await Promise.all(chunk.map(executeOneServerTool));
          }
        }

        // Run file-conflicting / no-file-declared tools sequentially.
        // Inject prior specialist change summaries so later specialists know what earlier ones did.
        const completedSpecialistSummaries: string[] = [];
        for (const evt of sequential) {
          if (evt.name === 'run_specialist' && completedSpecialistSummaries.length > 0) {
            const priorContext = completedSpecialistSummaries.join('\n');
            const enrichedInput = { ...evt.input };
            enrichedInput.task = `${String(enrichedInput.task ?? '')}\n\nPRIOR SPECIALIST CHANGES (coordinate with these):\n${priorContext}`;
            const enrichedEvt = { ...evt, input: enrichedInput };
            await executeOneServerTool(enrichedEvt as typeof evt);
          } else {
            await executeOneServerTool(evt);
          }
          if (evt.name === 'run_specialist') {
            const result = iterToolResults.get(evt.id);
            if (result && !result.is_error) {
              completedSpecialistSummaries.push(result.content.slice(0, 500));
            }
          }
        }

        // Merge virtual worktrees and handle conflicts (F1)
        if (worktreeIds.length > 0) {
          const mergeResult = mergeMultipleWorktrees(worktreeIds);
          onProgress?.({
            type: 'worktree_status',
            worktrees: [],
            conflicts: mergeResult.conflicts.map((c) => ({ path: c.path })),
          });
          if (mergeResult.conflicts.length > 0) {
            messages.push({
              role: 'user',
              content: `SYSTEM: File conflicts detected between parallel specialists:\n${mergeResult.conflicts.map((c) => `- ${c.path} modified by both specialists`).join('\n')}\nResolve these conflicts.`,
            });
          }
        }

        // Collect handoffs from parallel specialist results
        if (parallel.length > 1) {
          const handoffs: Array<{ specialistType: string; handoff: ReturnType<typeof parseHandoff> }> = [];
          for (const evt of parallel) {
            const result = iterToolResults.get(evt.id);
            if (result && !result.is_error) {
              const handoff = parseHandoff(result.content);
              if (handoff) {
                handoffs.push({
                  specialistType: String(evt.input?.type ?? evt.name),
                  handoff,
                });
              }
            }
          }
          if (handoffs.length > 0) {
            const summary = handoffs
              .filter((h): h is typeof h & { handoff: NonNullable<typeof h.handoff> } => h.handoff != null)
              .map(
                (h) =>
                  `${h.specialistType}: ${h.handoff.completed ? 'completed' : 'incomplete'}` +
                  (h.handoff.filesTouched.length ? `, files: [${h.handoff.filesTouched.join(', ')}]` : '') +
                  (h.handoff.concerns.length ? `, concerns: [${h.handoff.concerns.join('; ')}]` : '') +
                  (h.handoff.findings.length ? `, findings: [${h.handoff.findings.join('; ')}]` : ''),
              )
              .join('\n');
            messages.push({
              role: 'user',
              content: `SYSTEM: Parallel specialists completed:\n${summary}\n\nReview concerns and findings before proceeding.`,
            });
            onProgress?.({
              type: 'thinking',
              phase: 'reviewing',
              label: `${handoffs.length} specialists completed in parallel`,
              detail: summary,
            });
          }
        }
      }

      if (reactionEscalationMessage) {
        fullText = fullText.trim()
          ? `${fullText}\n\n${reactionEscalationMessage}`
          : reactionEscalationMessage;
        onProgress?.({
          type: 'thinking',
          phase: 'clarification',
          label: 'Specialist escalation requires clarification',
          detail: reactionEscalationMessage,
        });
        break;
      }

      // If code-mode keeps attempting lookups before any edit, inject a hard
      // enact instruction into the loop context for the next iteration.
      if (intentMode === 'code' && !hasAttemptedEdit && preEditLookupBlockedCount >= preEditBlockThreshold) {
        forceNoLookupUntilEdit = true;
        enactEnforcementCount += 1;
        messages.push({
          role: 'user',
          content:
            'SYSTEM ENFORCEMENT: Lookup budget exhausted before first edit. ' +
            'Next step MUST be one of: (1) search_replace/propose_code_edit/create_file to enact changes, ' +
            '(2) run_specialist to delegate edits, or (3) ask_clarification if required details are missing. ' +
            'Do NOT call read/search/grep/glob/semantic/list/dependency tools again.',
        });
        onProgress?.({
          type: 'thinking',
          phase: 'analyzing',
          label: 'Enact enforcement applied — editing required',
        });

        // Fail fast if enforcement has already been applied and the model still
        // keeps requesting lookup-only actions instead of editing.
        if (enactEnforcementCount >= PRE_EDIT_ENFORCEMENT_ABORT_THRESHOLD) {
          const loopAbortMsg =
            'Stopping this run to prevent a lookup loop. ' +
            'I already have sufficient context. ' +
            'Next attempt must begin with an edit tool (search_replace/propose_code_edit/create_file), ' +
            'run_specialist delegation, or ask_clarification if details are missing.';
          if (fullText.trim().length > 0) {
            fullText += `\n\n${loopAbortMsg}`;
          } else {
            fullText = loopAbortMsg;
          }
          onContentChunk?.(`\n\n${loopAbortMsg}`);
          break;
        }

        preEditLookupBlockedCount = 0;
      }

      // If search_replace / propose_code_edit keeps failing, inject a targeted
      // correction with copy-safe file region so the model can fix its old_text.
      if (intentMode === 'code' && failedMutationCount >= 3 && lastMutationFailure) {
        const failure = lastMutationFailure!;
        const targetFile = preloaded.find(
          f => f.fileName === failure.filePath || f.path === failure.filePath,
        );
        const fileContent = targetFile?.content ?? '';
        const region = failure.attemptedOldText
          ? extractTargetRegion(fileContent, failure.attemptedOldText)
          : null;
        const lineCount = failure.fileLineCount ?? fileContent.split('\n').length;
        const fileSizeNote = lineCount > 500
          ? `\nNOTE: This file is ${lineCount} lines. If using propose_code_edit, include ALL content.`
          : '';

        let failedMutMsg =
          `SYSTEM CORRECTION: search_replace failed ${failure.attemptCount} times on ${failure.filePath}.\n\n` +
          'The text you provided as old_text does not match the file.';

        if (region) {
          failedMutMsg +=
            ' Below is the relevant region.\n\n' +
            'COPY-SAFE SNIPPET (use this as old_text):\n---\n' + region.rawSnippet + '\n---\n\n' +
            'CONTEXT (line numbers for reference only -- do NOT copy these):\n---\n' + region.contextSnippet + '\n---\n\n' +
            'OPTION 1: Copy the exact text from the COPY-SAFE SNIPPET above as old_text.\n' +
            'OPTION 2: Use propose_code_edit with the full updated file content instead.' +
            fileSizeNote;
        } else {
          failedMutMsg +=
            '\n\nSwitch to propose_code_edit with the full updated file content.' + fileSizeNote;
        }

        // Architectural questioning after repeated failures
        if (debugFixAttemptCount >= 3) {
          failedMutMsg +=
            '\n\nQUESTION YOUR APPROACH:\n' +
            '- Are you editing the right file? Could the change belong in a different file?\n' +
            '- Is the file structure different from what you assumed? Re-read it.\n' +
            '- Would a completely different strategy (e.g., create_file instead of search_replace) work better?\n' +
            '- Could the issue be in a different layer (CSS vs Liquid vs JS)?';
        }

        messages.push({ role: 'user', content: failedMutMsg });
        onProgress?.({
          type: 'thinking',
          phase: 'analyzing',
          label: `Failed mutation recovery (${failedMutationCount} failures)`,
        });
        failedMutationCount = 0;
        if (failure.filePath) {
          proposeOnlyFiles.add(failure.filePath);
        }
        if (enactEnforcementCount >= PRE_EDIT_ENFORCEMENT_ABORT_THRESHOLD) {
          const abortMsg =
            'Stopping: repeated edit failures with no net change applied. ' +
            'Please share the exact file content or accept a full file rewrite.';
          fullText = fullText.trim() ? `${fullText}\n\n${abortMsg}` : abortMsg;
          onContentChunk?.(`\n\n${abortMsg}`);
          break;
        }
        enactEnforcementCount += 1;
        if (debugFixAttemptCount >= 5) {
          const escalateMsg =
            'Stopping after 5 failed fix attempts. The current approach is not working. ' +
            'Please review the file content manually or try a different strategy.';
          fullText = fullText.trim() ? `${fullText}\n\n${escalateMsg}` : escalateMsg;
          onContentChunk?.(`\n\n${escalateMsg}`);
          onProgress?.({
            type: 'thinking',
            phase: 'analyzing',
            label: 'Debug escalation: stopping after repeated failures',
          });
          break;
        }
      }

      // ── Execute PTC (server_tool_use) tool calls in parallel ────
      if (pendingPTCTools.length > 0) {
        console.log(`[V2-PTC] Executing ${pendingPTCTools.length} programmatic tool call(s)`);

        await Promise.all(
          pendingPTCTools.map(async (evt) => {
            const toolCall: AIToolCall = { id: evt.id, name: evt.name, input: evt.input };
            let toolResult: ToolResult;
            try {
              const readFileId = evt.name === 'read_file' ? (evt.input?.fileId as string) : null;
              const preloadedFile = readFileId ? preloadedMap.get(readFileId) : null;
              if (preloadedFile) {
                onToolEvent?.({
                  type: 'tool_progress',
                  name: 'read_file',
                  id: evt.id,
                  toolCallId: evt.id,
                  progress: { phase: 'reading', detail: preloadedFile.fileName },
                });
                let content = preloadedFile.content;
                const view = String(evt.input?.view ?? 'full');
                if (view !== 'full' && isSectionFile(preloadedFile.fileName || preloadedFile.path || '')) {
                  if (view === 'markup') content = contentMarkupOnly(content);
                  else if (view === 'schema') content = contentSchemaOnly(content);
                }
                toolResult = { tool_use_id: evt.id, content };
              } else {
                const ptcProgressDetail = (() => {
                  if (evt.name === 'read_file') return { phase: 'reading', detail: String(evt.input?.fileId || evt.input?.path || '') };
                  if (evt.name === 'grep_content' || evt.name === 'search_files') return { phase: 'searching', detail: String(evt.input?.pattern || evt.input?.query || '') };
                  if (evt.name === 'search_replace' || evt.name === 'create_file' || evt.name === 'write_file') return { phase: 'writing', detail: String(evt.input?.filePath || evt.input?.path || '') };
                  return { phase: 'executing', detail: `Running ${evt.name}...` };
                })();
                onToolEvent?.({
                  type: 'tool_progress',
                  name: evt.name,
                  id: evt.id,
                  toolCallId: evt.id,
                  progress: ptcProgressDetail,
                });
                toolResult = normalizeToolResult(evt.name, await dispatchToolCall(toolCall, unifiedCtx));
              }
            } catch (err) {
              toolResult = {
                tool_use_id: evt.id,
                content: `PTC tool execution failed: ${String(err)}`,
                is_error: true,
              };
            }
            if (evt.name === 'read_file' && !toolResult.is_error) {
              const readFileId2 = evt.input?.fileId as string;
              const wasPreloadHit = readFileId2 ? !!preloadedMap.get(readFileId2) : false;
              if (!wasPreloadHit) filesReadOnDemand++;
              if (readFileId2) readFiles.add(readFileId2);
            }
            if (MUTATING_TOOL_NAMES.has(evt.name) && !toolResult.is_error) {
              hasAttemptedEdit = true;
              mutatingAttemptedThisIteration = true;
              executionPhase = 'applyPatch';
              contextVersion += 1;
              invalidateProjectGraphs();
              debugFixAttemptCount = 0;

              // Auto-lint PTC mutations (infrastructure — not counted)
              const ptcLintPath = (evt.input?.filePath ?? evt.input?.path ?? evt.input?.file_path) as string | undefined;
              if (ptcLintPath && typeof ptcLintPath === 'string') {
                try {
                  const ptcLintResult = await dispatchToolCall(
                    { id: `auto-lint-ptc-${Date.now()}`, name: 'check_lint', input: { fileName: ptcLintPath } },
                    unifiedCtx,
                  );
                  if (ptcLintResult.content && !ptcLintResult.content.includes('No lint errors') && !ptcLintResult.content.includes('no issues')) {
                    messages.push({
                      role: 'user',
                      content: `SYSTEM: Lint results for ${ptcLintPath}:\n${ptcLintResult.content}`,
                    } as AIMessage);
                  }
                } catch { /* lint unavailable */ }
              }
            }
            totalToolCalls += 1;
            const TOOLS_NO_TRUNCATE = new Set([
              'read_file', 'read_lines', 'read_chunk', 'parallel_batch_read',
              'extract_region', 'get_schema_settings',
              'grep_content', 'semantic_search', 'glob_files',
              'lint_file', 'validate_syntax', 'run_diagnostics', 'theme_check',
              'list_files', 'get_file_info',
            ]);
            let truncatedContentPTC = toolResult.content;
            if (toolResult.content.length > MAX_TOOL_RESULT_CHARS && !TOOLS_NO_TRUNCATE.has(evt.name)) {
              const PTC_SUMMARY_CHARS = 8_000;
              const ptcSummary = toolResult.content.slice(0, PTC_SUMMARY_CHARS);
              const ptcFullLen = toolResult.content.length;
              const ptcOutputId = `tool-output-ptc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
              toolOutputCache.set(ptcOutputId, toolResult.content);
              truncatedContentPTC = `${ptcSummary}\n\n... (${ptcFullLen} chars total, showing first ${PTC_SUMMARY_CHARS}. Full output available — use read_file with fileId "${ptcOutputId}" to see more.)`;
            }
            iterToolResults.set(evt.id, { content: truncatedContentPTC, is_error: toolResult.is_error, isPTC: true });
            onToolEvent?.({
              type: 'tool_call',
              name: `ptc:${evt.name}`,
              id: evt.id,
              input: evt.input,
              result: truncatedContentPTC,
              isError: toolResult.is_error,
            });
            if (toolResult.is_error) {
              onToolEvent?.({
                type: 'tool_error',
                name: `ptc:${evt.name}`,
                id: evt.id,
                error: truncatedContentPTC,
                recoverable: true,
              });
            }
          }),
        );
      }

      // ── Track PTC container for sandbox reuse ─────────────────────
      try {
        const containerInfo = await streamResult.getContainer?.();
        if (containerInfo?.id) {
          ptcContainerId = containerInfo.id;
          console.log(`[V2-PTC] Container ${ptcContainerId} (expires ${containerInfo.expires_at})`);
        }
      } catch { /* getContainer may not be available */ }

      // ── Log context editing stats + inject memory anchor ─────────
      try {
        const edits = await streamResult.getContextEdits?.();
        if (edits && edits.length > 0) {
          let toolUsesCleared = 0;
          for (const edit of edits) {
            if (edit.type === 'clear_tool_uses_20250919') {
              toolUsesCleared = (edit.cleared_tool_uses as number) ?? 0;
              console.log(`[V2-ContextEdit] Cleared ${toolUsesCleared} tool use(s), ${edit.cleared_input_tokens ?? 0} tokens (iter ${iteration})`);
            }
            if (edit.type === 'clear_thinking_20251015') {
              console.log(`[V2-ContextEdit] Cleared ${edit.cleared_thinking_turns ?? 0} thinking turn(s), ${edit.cleared_input_tokens ?? 0} tokens (iter ${iteration})`);
            }
          }
          // When tool history is cleared, inject a structured memory anchor so
          // the agent knows what files it already read/edited with line ranges.
          // This user-role message survives context editing (only tool_use blocks are cleared).
          if (toolUsesCleared >= CONTEXT_EDITING.ANCHOR_INJECTION_THRESHOLD) {
            const anchor = buildMemoryAnchor();
            messages.push({ role: 'user', content: anchor } as AIMessage);
            console.log(`[V2-ContextEdit] Injected memory anchor (${fileEditLog.size} edited files, ${fileReadLog.size} read files)`);
          }
        }
      } catch { /* getContextEdits may not be available */ }

      // ── Tool call cap (optional): 0 = no cap
      if (MAX_TOOL_CALLS > 0 && totalToolCalls >= MAX_TOOL_CALLS) {
        fullText += '\n\nReached the tool call limit for this turn. Please continue in a follow-up message.';
        onProgress?.({
          type: 'thinking',
          phase: 'analyzing',
          label: `Tool call limit reached (${totalToolCalls}/${MAX_TOOL_CALLS})`,
        });
        break;
      }

      // Soft cap once edits exist: prefer finalizing over extra exploratory loops.
      // This keeps code-mode runs from ballooning tool count after the main edits land.
      if (
        intentMode === 'code' &&
        accumulatedChanges.length > 0 &&
        totalToolCalls >= POST_EDIT_TOOL_BUDGET_SOFT_CAP
      ) {
        if (!finalizationNudgeSent) {
          messages.push({
            role: 'user',
            content:
              'SYSTEM: You already have valid edits. Stop additional exploration and finalize now. ' +
              'Only perform one final targeted fix if absolutely required; otherwise finish.',
          } as AIMessage);
          finalizationNudgeSent = true;
        } else {
          onProgress?.({
            type: 'thinking',
            phase: 'complete',
            label: `Stopping after post-edit tool budget (${totalToolCalls})`,
          });
          break;
        }
      }

      // ── Read-only loop detection: force action after 3 read-only iterations
      const READ_ONLY_TOOLS = new Set([
        'read_file', 'grep_content', 'search_files', 'glob_files', 'list_files',
        'get_dependency_graph', 'get_schema_settings', 'find_references',
        'read_chunk', 'parallel_batch_read',
      ]);
      const onlyReadToolsThisIter = !mutatingAttemptedThisIteration && totalToolCalls > 0 && pendingServerTools.length === 0;
      if (onlyReadToolsThisIter && (intentMode === 'code' || intentMode === 'debug')) {
        readOnlyIterationCount = (readOnlyIterationCount ?? 0) + 1;
        const readOnlyLimit = currentStrategy === 'GOD_MODE' ? 1 : 3;
        if (readOnlyIterationCount >= readOnlyLimit) {
          const godModeMsg = currentStrategy === 'GOD_MODE'
            ? 'SYSTEM: You have read files without editing. You MUST now call edit_lines (preferred) or search_replace (fallback) to make the change. ' +
              'You already have enough context. Pick a target and edit NOW. Do NOT read more files.'
            : 'SYSTEM: You have investigated for 3 iterations without making changes. ' +
              'You MUST now either: (1) call edit_lines or search_replace to make the change, ' +
              '(2) call run_specialist to delegate the work, or (3) respond with your findings. ' +
              'Do NOT read more files.';
          messages.push({
            role: 'user',
            content: godModeMsg,
          } as AIMessage);
          readOnlyIterationCount = 0;
        }
      } else {
        readOnlyIterationCount = 0;
      }

      const addedChangesThisIteration = accumulatedChanges.length > changesAtIterationStart;

      // If we keep executing tools after edits without producing net new changes,
      // stop early and ask for clarification instead of looping.
      if (intentMode === 'code' && hasAttemptedEdit) {
        if (addedChangesThisIteration) {
          postEditNoChangeIterations = 0;
          rethinkCount = 0;
        } else {
          const hadExecution =
            pendingPTCTools.length > 0 ||
            pendingServerTools.length > 0 ||
            mutatingAttemptedThisIteration;
          if (hadExecution) {
            postEditNoChangeIterations += 1;
            if (postEditNoChangeIterations >= POST_EDIT_STAGNATION_THRESHOLD) {
              if (rethinkCount < maxRethinks) {
                rethinkCount++;
                postEditNoChangeIterations = 0;
                const recentTools = toolSequenceLog.slice(-8).join(', ') || 'none';
                const lastErr = lastMutationFailure
                  ? `Last failure: ${(lastMutationFailure as MutationFailure).reason} on ${(lastMutationFailure as MutationFailure).filePath ?? 'unknown'}`
                  : 'Edits produced no net change';
                const rethinkMsg =
                  `SYSTEM RETHINK (${rethinkCount}/${maxRethinks}): You have attempted edits for ${iteration + 1} iterations without producing a net change.\n\n` +
                  `What you tried: ${recentTools}\n` +
                  `What failed: ${lastErr}\n\n` +
                  'Step back. Consider:\n' +
                  '1. Is the target file correct? Check the rendering chain.\n' +
                  '2. Is there a different section or line range that needs editing?\n' +
                  '3. Should you read the file again to see its current state after previous edits?\n\n' +
                  'Try a DIFFERENT approach NOW. Do not repeat the same edit.';
                messages.push({ role: 'user', content: rethinkMsg } as AIMessage);
                onProgress?.({
                  type: 'thinking',
                  phase: 'analyzing',
                  label: `Rethinking approach (${rethinkCount}/${maxRethinks})...`,
                });
                continue;
              } else {
                const breakerMsg =
                  `Stopped after ${maxRethinks} rethink attempt(s) with no net code changes. ` +
                  'The current approach may need manual review or a different strategy.';
                fullText = fullText.trim() ? `${fullText}\n\n${breakerMsg}` : breakerMsg;
                onProgress?.({
                  type: 'thinking',
                  phase: 'complete',
                  label: 'Exhausted rethink budget — stopping',
                  detail: breakerMsg,
                });
                break;
              }
            }
          }
        }
      }

      // ── Track token usage for this iteration ────────────────────
      try {
        const usage = await streamResult.getUsage();
        totalInputTokens += usage.inputTokens;
        totalOutputTokens += usage.outputTokens;
        totalCacheReadTokens += usage.cacheReadInputTokens ?? 0;
        totalCacheWriteTokens += usage.cacheCreationInputTokens ?? 0;
        if ((usage.cacheReadInputTokens ?? 0) > 0) {
          console.log(`[V2] Cache hit: ${usage.cacheReadInputTokens} tokens read from cache (iter ${iteration})`);
        }
        // Emit context pressure events so the UI can warn the user
        const cumulativeTokens = totalInputTokens + totalOutputTokens;
        const modelContextLimit = model.includes('claude') ? 200_000 : model.includes('gpt') ? 128_000 : 131_072;
        const pressurePercent = Math.round((cumulativeTokens / modelContextLimit) * 100);
        if (pressurePercent >= 80) {
          onProgress?.({
            type: 'context_pressure',
            usedTokens: cumulativeTokens,
            maxTokens: modelContextLimit,
            percentage: pressurePercent,
            level: pressurePercent >= 92 ? 'critical' : 'warning',
          });
        }
      } catch { /* getUsage may fail if stream errored */ }

      // Treat provider stream interruptions as incomplete execution, never as normal completion.
      const terminalStreamError = await streamResult.getTerminalError?.();
      if (streamReadInterrupted || terminalStreamError) {
        throw (terminalStreamError ?? classifyNetworkError(streamReadError, 'v2-stream'));
      }

      const toolsUsedThisIteration = totalToolCalls - toolCallsAtIterationStart;
      if (
        intentMode === 'code' &&
        !needsClarification &&
        accumulatedChanges.length === changesAtIterationStart &&
        toolsUsedThisIteration === 0
      ) {
        zeroToolIterationStreak += 1;
      } else {
        zeroToolIterationStreak = 0;
      }
      if (intentMode === 'code' && zeroToolIterationStreak >= CODE_ZERO_TOOL_STREAK_LIMIT) {
        const clarMsg =
          'I am pausing because no actionable tool calls were made in consecutive iterations. ' +
          'Please confirm the exact target file/region, or say "apply the previous plan now" to continue with direct edits.';
        needsClarification = true;
        hasStructuredClarification = true;
        messages.push({
          role: 'user',
          content: `SYSTEM: ${clarMsg}`,
        } as AIMessage);
        onProgress?.({
          type: 'thinking',
          phase: 'clarification',
          label: 'Need target confirmation before continuing',
          detail: clarMsg,
          metadata: {
            clarificationRound: 1,
            maxRounds: 2,
            options: [
              { id: 'confirm-target', label: 'Confirm exact file/path to edit', recommended: true },
              { id: 'apply-previous-plan', label: 'Apply previous plan directly' },
            ],
          },
        });
      }

      // Additional-input contract: once clarification is requested, stop here.
      if (needsClarification) {
        console.log('[V2] Clarification requested — pausing execution until user feedback');
        break;
      }
      // ── Check stop reason ─────────────────────────────────────────
      const stopReason = await streamResult.getStopReason();
      const rawBlocks = await streamResult.getRawContentBlocks();

      if (stopReason !== 'tool_use' || iteration >= MAX_ITERATIONS - 1) {
        // Nudge: if the model stopped in code mode with no changes and we have budget,
        // inject a forceful instruction to continue instead of accepting premature stop.
        const canNudge =
          intentMode === 'code' &&
          accumulatedChanges.length === 0 &&
          !needsClarification &&
          prematureStopNudges < 2 &&
          iteration < MAX_ITERATIONS - 2 &&
          stopReason !== 'max_tokens';

        if (canNudge) {
          prematureStopNudges++;
          console.log(`[V2] Premature stop nudge #${prematureStopNudges} — model stopped without changes, forcing continuation`);

          // Append the assistant's text as a turn so the model sees it said something
          if (fullText.trim()) {
            messages.push({ role: 'assistant', content: fullText.trim() } as AIMessage);
          }

          const nudgeTools = preloaded.length > 0
            ? `Available files: ${preloaded.slice(0, 5).map(f => f.fileName || f.path).join(', ')}. ` +
              `Use read_lines to get exact content, then edit_lines to make changes.`
            : '';

          messages.push({
            role: 'user',
            content:
              'You stopped without making any code changes. This is a CODE mode request — ' +
              'you MUST make the requested edit before finishing. Do NOT explain what you would do. ' +
              'Do NOT ask for permission. ACT NOW with your editing tools.\n\n' +
              'If search_replace failed, use read_lines to see the exact file content, ' +
              'then edit_lines with the correct line numbers.\n\n' +
              (nudgeTools ? nudgeTools + '\n\n' : '') +
              'Proceed immediately with the edit.',
          } as AIMessage);

          fullText = '';
          onProgress?.({
            type: 'thinking',
            phase: 'editing',
            label: 'Retrying edit...',
          });
          continue;
        }

        break;
      }

      // ── Multi-turn: append assistant + tool result messages ────────
      // Preserve thinking/reasoning blocks — dropping them causes ~30% perf regression.
      // Anthropic docs warn against passing thinking back as *user text*, but keeping
      // them in the assistant turn's __toolCalls array is the correct multi-turn format.
      const assistantMsg = {
        role: 'assistant',
        content: '',
        __toolCalls: rawBlocks,
      } as unknown as AIMessage;
      messages.push(assistantMsg);

      // Build tool result blocks from cached results
      const toolResultBlocks: unknown[] = [];
      for (const block of rawBlocks) {
        const b = block as { type: string; id?: string };
        if (b.type === 'tool_use' && b.id) {
          const cached = iterToolResults.get(b.id);
          if (cached) {
            toolResultBlocks.push({
              type: 'tool_result',
              tool_use_id: b.id,
              content: cached.content,
              ...(cached.is_error ? { is_error: true } : {}),
            });
          }
        }
        // PTC: Anthropic expects `tool_result` (not `server_tool_result`) in follow-up user turns.
        if (b.type === 'server_tool_use' && b.id) {
          const cached = iterToolResults.get(b.id);
          if (cached) {
            toolResultBlocks.push({
              type: 'tool_result',
              tool_use_id: b.id,
              content: cached.content,
              ...(cached.is_error ? { is_error: true } : {}),
            });
          }
        }
      }

      if (toolResultBlocks.length > 0) {
        const toolResultMsg = {
          role: 'user',
          content: '',
          __toolResults: toolResultBlocks,
        } as unknown as AIMessage;
        messages.push(toolResultMsg);
      }

      // Persist tool turn to DB for cross-turn context awareness
      if (options.sessionId) {
        persistToolTurn(
          options.sessionId,
          rawBlocks.filter((b: unknown) => {
            if (typeof b !== 'object' || b === null || !('type' in b)) return false;
            const t = (b as { type: string }).type;
            return t === 'tool_use' || t === 'server_tool_use';
          }),
          toolResultBlocks.length > 0 ? toolResultBlocks : undefined,
        ).catch(() => { /* non-blocking */ });
      }

      if (queuedReactionInstructions.length > 0) {
        const reactionInstruction = queuedReactionInstructions
          .map((m) => `- ${m}`)
          .join('\n');
        messages.push({
          role: 'user',
          content:
            'ORCHESTRATION REACTION POLICY:\n' +
            `${reactionInstruction}\n` +
            'Apply this guidance in your next step and avoid repeating failed specialist patterns.',
        });
        queuedReactionInstructions.length = 0;
      }

      // ── Intra-loop verification: quick syntax check after edits ────────
      // Only fires when new changes were added this iteration, throttled
      // to avoid back-to-back checks, and capped at MAX_VERIFICATION_INJECTIONS
      // to bound token cost.
      const newChangesThisIter = accumulatedChanges.length > changesAtIterationStart;
      const editedFilesThisIter = newChangesThisIter
        ? [...new Set(accumulatedChanges.slice(changesAtIterationStart).map(c => c.fileName))]
        : [];
      const verifyThrottled = (iteration - lastVerificationIteration) < 2;
      const verifyBudgetLeft = totalVerificationInjections < MAX_VERIFICATION_INJECTIONS;

      if (
        newChangesThisIter &&
        !verifyThrottled &&
        verifyBudgetLeft &&
        (intentMode === 'code' || intentMode === 'debug')
      ) {
        lastVerificationIteration = iteration;
        const changesForVerify = accumulatedChanges.filter(c => editedFilesThisIter.includes(c.fileName));
        const intraVerify = verifyChanges(changesForVerify, allFiles);

        if (!intraVerify.passed && intraVerify.errorCount > 0) {
          totalVerificationInjections++;
          const newErrors = intraVerify.issues
            .filter(i => i.severity === 'error')
            .slice(0, 5);
          const errorSummary = newErrors
            .map(e => `- ${e.file}:${e.line} — ${e.message} (${e.category})`)
            .join('\n');

          let allExhausted = true;
          for (const file of editedFilesThisIter) {
            const count = (consecutiveVerifyFailures.get(file) ?? 0) + 1;
            consecutiveVerifyFailures.set(file, count);
            if (count < 3) allExhausted = false;
          }

          if (!allExhausted) {
            onProgress?.({
              type: 'thinking',
              phase: 'validating',
              label: `Syntax check found ${intraVerify.errorCount} error(s) — feeding back to fix`,
            });
            messages.push({
              role: 'user',
              content:
                `VERIFICATION: Your last edit introduced ${intraVerify.errorCount} syntax error(s):\n${errorSummary}\n\n` +
                'Fix these errors in your next edit. Do NOT move on to other files until these are resolved.',
            } as AIMessage);
            continue;
          }
        } else {
          for (const file of editedFilesThisIter) {
            consecutiveVerifyFailures.delete(file);
          }
        }
      }

      // Compress old tool results to save tokens in later iterations
      // Skip when context editing is active (API handles it server-side)
      if (!AI_FEATURES.contextEditing) {
        compressOldToolResults(messages);
      }

      // Auto-escalate to GOD_MODE if HYBRID is stalling (3+ iterations, no edits, COMPLEX+ tier)
      if (
        AI_FEATURES.godMode &&
        currentStrategy === 'HYBRID' &&
        iteration >= 2 &&
        accumulatedChanges.length === 0 &&
        !hasAttemptedEdit &&
        (tier === 'COMPLEX' || tier === 'ARCHITECTURAL')
      ) {
        currentStrategy = 'GOD_MODE';
        MAX_ITERATIONS = ITERATION_LIMITS.code;
        preEditLookupBudget = referentialCodePrompt
          ? REFERENTIAL_PRE_EDIT_LOOKUP_BUDGET
          : GOD_MODE_PRE_EDIT_LOOKUP_BUDGET;
        preEditBlockThreshold = referentialCodePrompt
          ? REFERENTIAL_PRE_EDIT_BLOCK_THRESHOLD
          : GOD_MODE_PRE_EDIT_BLOCK_THRESHOLD;
        forceNoLookupUntilEdit = false;
        console.log(`[V2] Auto-escalating to GOD_MODE after ${iteration} stagnant iterations`);
        onProgress?.({
          type: 'thinking',
          phase: 'analyzing',
          label: 'Escalating to God Mode — specialists stalled',
          metadata: { strategy: 'GOD_MODE', escalationReason: 'stagnant_hybrid' },
        });
        messages.push({
          role: 'user',
          content: `[SYSTEM] Escalating to GOD MODE — specialist delegation has not produced changes after ${iteration} iterations.\n\n${V2_GOD_MODE_OVERLAY}\n\nYou now have full file access. Use the STRUCTURAL BRIEF above to find relevant files, line ranges, and dependencies. Make all edits directly using edit_lines. Do NOT delegate to specialists.`,
        } as AIMessage);
      }

      // Strategy detection: parse PM's first response for STRATEGY: directive.
      // The PM can UPGRADE strategy (HYBRID → GOD_MODE) but cannot DOWNGRADE
      // from an auto-mapped GOD_MODE (tier-based).
      if (iteration === 0 && AI_FEATURES.godMode && fullText.includes('STRATEGY:')) {
        const detected = extractStrategy(fullText);
        const strategyRank: Record<ExecutionStrategy, number> = { SIMPLE: 0, HYBRID: 1, GOD_MODE: 2 };
        const canApply = strategyRank[detected] >= strategyRank[currentStrategy];
        if (canApply && detected !== currentStrategy) {
          currentStrategy = detected;
          console.log(`[V2] Strategy upgraded to: ${currentStrategy}`);
          onProgress?.({
            type: 'thinking',
            phase: 'analyzing',
            label: `Strategy: ${currentStrategy}`,
            metadata: { strategy: currentStrategy },
          });

          if (currentStrategy === 'GOD_MODE') {
            MAX_ITERATIONS = ITERATION_LIMITS.code;
            preEditLookupBudget = referentialCodePrompt
              ? REFERENTIAL_PRE_EDIT_LOOKUP_BUDGET
              : GOD_MODE_PRE_EDIT_LOOKUP_BUDGET;
            preEditBlockThreshold = referentialCodePrompt
              ? REFERENTIAL_PRE_EDIT_BLOCK_THRESHOLD
              : GOD_MODE_PRE_EDIT_BLOCK_THRESHOLD;
            forceNoLookupUntilEdit = false;
            messages.push({
              role: 'user',
              content: `[SYSTEM] GOD MODE activated.\n\n${V2_GOD_MODE_OVERLAY}\n\nYou have full file access. Do not delegate — make all edits directly using edit_lines. Use the STRUCTURAL BRIEF above for precise file targets, line ranges, and dependencies.`,
            } as AIMessage);
          } else if (currentStrategy === 'SIMPLE') {
            MAX_ITERATIONS = tier === 'TRIVIAL' ? 4 : 6;
          }
        }
      }

      iteration++;
    }

    if (
      !skippedLoop &&
      referentialCodePrompt &&
      accumulatedChanges.length === 0 &&
      !needsClarification &&
      referentialArtifacts.length > 0
    ) {
      const replayResult = applyReferentialArtifactsAsChanges(
        referentialArtifacts,
        allFiles,
        preloadedMap,
        accumulatedChanges,
      );
      if (replayResult.applied > 0) {
        hasAttemptedEdit = true;
        executionPhase = 'applyPatch';
        replayAppliedCount = replayResult.applied;
        replaySource = referentialArtifacts[0]?.sourceExecutionId;
        onProgress?.({
          type: 'thinking',
          phase: 'executing',
          label: `Applied ${replayResult.applied} replayed edit(s) from prior context`,
        });
      } else {
        const replayBlockedMsg =
          replayResult.missing.length > 0
            ? `Replay artifacts could not be applied because target file(s) were not found: ${replayResult.missing.slice(0, 3).join(', ')}.`
            : 'Replay artifacts were available but did not produce a net code change.';
        fullText = fullText.trim() ? `${fullText}\n\n${replayBlockedMsg}` : replayBlockedMsg;
        onProgress?.({
          type: 'thinking',
          phase: 'clarification',
          label: 'Replay requires clarification',
          detail: replayBlockedMsg,
        });
      }
    }

    if (intentMode === 'code' && directMutationRequested && accumulatedChanges.length === 0 && !needsClarification) {
      const noChangeMsg =
        'I investigated the issue but could not determine a precise code fix from the available context. ' +
        'Here is what I found — please let me know which specific change you\'d like me to make, ' +
        'or provide the exact file and the text you want changed.';
      if (!fullText.trim()) {
        fullText = noChangeMsg;
      }
      onProgress?.({
        type: 'thinking',
        phase: 'complete',
        label: 'Investigation complete — no changes applied',
        detail: noChangeMsg,
      });
    }
    if (
      intentMode === 'code' &&
      directMutationRequested &&
      directValidationRequested &&
      accumulatedChanges.length === 0
    ) {
      const mutationBeforeValidationMsg =
        'Validation was requested, but no edits were successfully applied. ' +
        'I need a deterministic target edit (exact file and before/after text) before running preview/verification.';
      fullText = fullText.trim()
        ? `${fullText}\n\n${mutationBeforeValidationMsg}`
        : mutationBeforeValidationMsg;
      onProgress?.({
        type: 'thinking',
        phase: 'complete',
        label: 'Mutation required before validation',
        detail: mutationBeforeValidationMsg,
      });
    }

    executionPhase = 'verify';
    // ── EPIC 2a: Auto-review gate ──────────────────────────────────────────
    // Always run auto-review when changes exist — the review catches
    // incomplete implementations (e.g., Liquid changed but CSS missing)
    const needsAutoReview = true;
    if (needsAutoReview && accumulatedChanges.length > 0) {
      onProgress?.({
        type: 'thinking',
        phase: 'validating',
        label: 'Running auto-review...',
      });
      try {
        const reviewToolCall = {
          id: `auto-review-${Date.now()}`,
          name: 'run_review' as const,
          input: { scope: 'all' },
        };
        const autoReviewToolResult = await dispatchToolCall(reviewToolCall, unifiedCtx);
        const reviewContent = autoReviewToolResult.content ?? '';
        if (!autoReviewToolResult.is_error) {
          const parsed = parseReviewToolContent(reviewContent);
          if (parsed) {
            latestReviewResult = parsed;
            setReviewResult(executionId, parsed);
          }
        }
        const reviewFailed = reviewContent.includes('NEEDS CHANGES');
        if (reviewFailed) {
          onProgress?.({
            type: 'thinking',
            phase: 'validating',
            label: 'Review found issues — attempting single fix pass...',
          });
          onProgress?.({
            type: 'diagnostics',
            detail: reviewContent,
          });
        } else {
          onProgress?.({
            type: 'thinking',
            phase: 'validating',
            label: 'Auto-review passed',
          });
        }
      } catch (reviewErr) {
        console.warn('[V2] Auto-review failed:', reviewErr);
      }
    }

    // ── Preview verification loop (optional) ────────────────────────────────
    // After God Mode or Hybrid execution, push to Shopify, inspect preview, and self-correct.
    if (
      AI_FEATURES.previewVerification &&
      accumulatedChanges.length > 0 &&
      (currentStrategy === 'GOD_MODE' || currentStrategy === 'HYBRID') &&
      options.shopifyConnectionId
    ) {
      const MAX_VERIFY_CYCLES = 3;
      const VERIFY_TIMEOUT_MS = 60_000;
      const verifyStart = Date.now();

      try {
        for (let verifyCycle = 0; verifyCycle < MAX_VERIFY_CYCLES; verifyCycle++) {
          if (Date.now() - verifyStart > VERIFY_TIMEOUT_MS) break;

          onProgress?.({
            type: 'thinking',
            phase: 'validating',
            label: verifyCycle === 0 ? 'Pushing changes and verifying preview...' : `Verification cycle ${verifyCycle + 1}...`,
          });

          // 1. Push changes to Shopify dev theme
          try {
            const { runPushForProject: pushNow } = await import('@/lib/shopify/push-queue');
            await pushNow(projectId);
          } catch (pushErr) {
            console.warn('[V2] Preview verification: push failed, skipping verification', pushErr);
            break;
          }

          // 2. Wait for dev theme to update
          await new Promise(r => setTimeout(r, 4000));

          // 3. Get DOM snapshot from preview
          let snapshotText = '';
          try {
            const { callPreviewAPI: previewCall, formatPreviewResult: formatPR } = await import('@/lib/agents/tools/preview-tools');
            const snapshotResult = await previewCall(projectId, 'snapshot');
            if (snapshotResult.success) {
              snapshotText = formatPR(snapshotResult.data, 8000);
            } else {
              console.warn('[V2] Preview verification: snapshot unavailable —', snapshotResult.error);
              break;
            }
          } catch {
            console.warn('[V2] Preview verification: snapshot call failed');
            break;
          }

          // 4. Build change summary for reflection
          const changeSummary = accumulatedChanges
            .map(c => `- ${c.fileName}: ${c.reasoning || 'edited'}`)
            .join('\n');

          // 5. Ask the LLM to reflect on the preview
          const { V2_VERIFICATION_PROMPT } = await import('@/lib/agents/prompts/v2-pm-prompt');
          const reflectionMessage = V2_VERIFICATION_PROMPT
            .replace('{snapshot}', snapshotText)
            .replace('{changeSummary}', changeSummary);

          messages.push({ role: 'user', content: reflectionMessage } as AIMessage);

          onProgress?.({
            type: 'thinking',
            phase: 'validating',
            label: 'Agent reviewing preview...',
          });

          // 6. Run up to 2 additional tool iterations for self-correction
          const changesBeforeVerify = accumulatedChanges.length;
          const verifyIterLimit = Math.min(iteration + 2, iteration + MAX_VERIFY_CYCLES);
          let madeCorrections = false;

          for (let vi = 0; vi < 2 && iteration < verifyIterLimit; vi++) {
            if (Date.now() - verifyStart > VERIFY_TIMEOUT_MS) break;
            iteration++;

            const budgeted = enforceRequestBudget(messages);
            const verifyOpts: Record<string, unknown> = {
              model,
              maxTokens: 4096,
            };

            let verifyStream: ToolStreamResult | null = null;
            try {
              const rawStream = await provider.streamWithTools(budgeted.messages, tools, verifyOpts);
              verifyStream = await raceFirstByteV2(rawStream, STREAM_FIRST_BYTE_TIMEOUT_MS);
            } catch {
              break;
            }
            if (!verifyStream) break;

            const verifyReader = verifyStream.stream.getReader();
            let verifyText = '';
            const verifyToolResults = new Map<string, { content: string; is_error?: boolean }>();
            const verifyPendingTools: Extract<ToolStreamEvent, { type: 'tool_end' }>[] = [];

            try {
              while (true) {
                const { done, value } = await verifyReader.read();
                if (done) break;
                const evt = value as ToolStreamEvent;

                if (evt.type === 'text_delta') {
                  verifyText += evt.text;
                  onContentChunk?.(evt.text);
                  fullText += evt.text;
                }

                if (evt.type === 'tool_end') {
                  if (V2_SERVER_TOOLS.has(evt.name)) {
                    verifyPendingTools.push(evt);
                  } else {
                    verifyToolResults.set(evt.id, { content: `Tool ${evt.name} forwarded.` });
                  }
                }
              }
            } finally {
              verifyReader.releaseLock();
            }

            // Execute any tools the LLM called during verification
            if (verifyPendingTools.length > 0) {
              for (const evt of verifyPendingTools) {
                const toolCall = { id: evt.id, name: evt.name, input: evt.input ?? {} };
                try {
                  const result = await dispatchToolCall(toolCall, unifiedCtx);
                  verifyToolResults.set(evt.id, { content: result.content, is_error: result.is_error });
                  if (MUTATING_TOOL_NAMES.has(evt.name) && !result.is_error) {
                    madeCorrections = true;
                  }
                } catch (err) {
                  verifyToolResults.set(evt.id, { content: `Error: ${err}`, is_error: true });
                }
              }

              // Feed tool results back
              const toolResultBlocks = [...verifyToolResults.entries()].map(([id, r]) => ({
                type: 'tool_result' as const,
                tool_use_id: id,
                content: r.content,
                is_error: r.is_error,
              }));
              messages.push({ role: 'assistant', content: verifyText } as AIMessage);
              messages.push({ role: 'user', content: toolResultBlocks } as unknown as AIMessage);
            }

            if (verifyPendingTools.length === 0) break;
          }

          // If no corrections were made, the preview looks good
          if (!madeCorrections) {
            onProgress?.({
              type: 'thinking',
              phase: 'validating',
              label: 'Preview verification passed',
            });
            break;
          }

          console.log(`[V2] Preview verification cycle ${verifyCycle + 1}: ${accumulatedChanges.length - changesBeforeVerify} correction(s) made`);
        }
      } catch (pvErr) {
        console.warn('[V2] Preview verification failed:', pvErr);
      }
    }

    // ── Unified verification pipeline ──────────────────────────────────────
    // Run verifyChanges and runThemeCheck together, merge issues, build evidence.
    // Changes are KEPT when possible — only theme check hard errors clear them.
    let verificationEvidence: {
      syntaxCheck: { passed: boolean; errorCount: number; warningCount: number };
      themeCheck?: { passed: boolean; errorCount: number; warningCount: number; infoCount: number };
      checkedFiles: string[];
      totalCheckTimeMs: number;
    } | undefined;
    const validationIssues: { gate: 'syntax' | 'cross_file' | 'theme_check'; errors: string[]; changesKept: boolean }[] = [];

    if (accumulatedChanges.length > 0) {
      const verifyStart = Date.now();

      onProgress?.({
        type: 'thinking',
        phase: 'validating',
        label: 'Running verification checks...',
      });

      const verification = verifyChanges(accumulatedChanges, allFiles);

      let themeCheckResult: ReturnType<typeof runThemeCheck> | null = null;
      if (intentMode === 'code' && hasThemeLayoutContext) {
        onProgress?.({
          type: 'thinking',
          phase: 'validating',
          label: 'Running theme check...',
        });
        const projectedFiles = allFiles.map((f) => {
          const change = accumulatedChanges.find((c) => c.fileName === f.fileName || c.fileName === (f.path ?? ''));
          return { path: f.path ?? f.fileName, content: change ? change.proposedContent : f.content };
        });
        try {
          themeCheckResult = runThemeCheck(projectedFiles, undefined, { bypassCache: true });
        } catch (err) {
          console.warn('[V2] Theme check error during verification:', err);
        }
      }

      const mergedIssues = themeCheckResult
        ? mergeThemeCheckIssues(verification.issues, themeCheckResult.issues)
        : verification.issues;

      const totalCheckTimeMs = Date.now() - verifyStart;

      verificationEvidence = {
        syntaxCheck: {
          passed: verification.passed,
          errorCount: verification.errorCount,
          warningCount: verification.warningCount,
        },
        themeCheck: themeCheckResult ? {
          passed: themeCheckResult.passed,
          errorCount: themeCheckResult.errorCount,
          warningCount: themeCheckResult.warningCount,
          infoCount: themeCheckResult.issues.filter(i => i.severity === 'info').length,
        } : undefined,
        checkedFiles: accumulatedChanges.map(c => c.fileName),
        totalCheckTimeMs,
      };

      onProgress?.({
        type: 'thinking',
        phase: 'validating',
        label: `Verification complete (${totalCheckTimeMs}ms)`,
      });

      const postEditErrorCount = (themeCheckResult?.errorCount ?? 0) + verification.errorCount;
      const newErrorsIntroduced = postEditErrorCount > baselineErrorCount;

      if (newErrorsIntroduced) {
        onProgress?.({
          type: 'thinking',
          phase: 'validating',
          label: `New errors detected: ${postEditErrorCount - baselineErrorCount} new error(s) introduced`,
        });
        for (const issue of mergedIssues.filter(i => i.severity === 'error')) {
          onProgress?.({
            type: 'diagnostics',
            file: issue.file,
            line: issue.line,
            severity: issue.severity,
            message: issue.message,
            category: issue.category,
          });
        }
        const syntaxErrors = mergedIssues
          .filter(i => i.severity === 'error')
          .slice(0, 5)
          .map(i => `${i.file}:${i.line} — ${i.message}`);
        validationIssues.push({ gate: 'syntax', errors: syntaxErrors, changesKept: true });
        fullText += `\n\n**Validation warning:** ${postEditErrorCount - baselineErrorCount} new error(s) introduced by this edit (baseline: ${baselineErrorCount}, post-edit: ${postEditErrorCount}). Changes are preserved — review the errors below.`;
      } else if (!verification.passed || (themeCheckResult && !themeCheckResult.passed)) {
        onProgress?.({
          type: 'thinking',
          phase: 'validating',
          label: `Pre-existing: ${postEditErrorCount} error(s), no new errors introduced`,
        });
      } else if (verification.warningCount > 0) {
        onProgress?.({
          type: 'thinking',
          phase: 'validating',
          label: `Verification passed with ${verification.warningCount} warning(s)`,
        });
      }
      if (!verification.passed) {
        const syntaxErrors = verification.issues
          .filter(i => i.severity === 'error')
          .slice(0, 5)
          .map(i => `${i.file}:${i.line} — ${i.message}`);
        if (!validationIssues.some(v => v.gate === 'syntax')) {
          validationIssues.push({ gate: 'syntax', errors: syntaxErrors, changesKept: true });
        }
        fullText += `\n\n**Syntax issues (changes kept):**\n${verification.formatted}`;
      }
    }

    // ── Change-set validation ───────────────────────────────────────────────
    if (accumulatedChanges.length > 0) {
      const validation = validateChangeSet(accumulatedChanges, allFiles);
      if (!validation.valid) {
        const errorIssues = validation.issues.filter(i => i.severity === 'error');
        const warnIssues = validation.issues.filter(i => i.severity === 'warning');
        onProgress?.({
          type: 'thinking',
          phase: 'validating',
          label: `Change-set: ${errorIssues.length} error(s), ${warnIssues.length} warning(s)`,
        });
        for (const issue of validation.issues) {
          onProgress?.({
            type: 'diagnostics',
            file: issue.file,
            severity: issue.severity,
            message: issue.description,
            category: issue.category,
          });
        }
        const crossFileErrors = errorIssues.slice(0, 5).map(i => `${i.file} — ${i.description}`);
        validationIssues.push({ gate: 'cross_file', errors: crossFileErrors, changesKept: true });
        fullText += '\n\n**Cross-file validation issues (changes kept):** Review the contract errors above.';

        // Hard gate for companion-contract violations:
        // If Liquid introduces component hooks/classes without required companion updates,
        // block completion so the run cannot succeed on partial cross-layer edits.
        const blockingCompanionErrors = errorIssues.filter(
          (i) =>
            i.category === 'companion_css' ||
            i.category === 'companion_schema',
        );
        if (blockingCompanionErrors.length > 0) {
          const blocking = blockingCompanionErrors
            .slice(0, 5)
            .map((i) => `${i.file} — ${i.description}`);
          validationIssues.push({ gate: 'cross_file', errors: blocking, changesKept: false });
          accumulatedChanges.length = 0;
          fullText +=
            '\n\nCross-file companion gate blocked completion — required CSS/schema companion updates were missing. Changes were cleared.';
        }
      }
    }

    // ── Theme-wide artifact + policy checks ────────────────────────────────
    if (intentMode === 'code' && accumulatedChanges.length > 0 && hasThemeLayoutContext) {
      const artifact = buildThemePlanArtifact(
        accumulatedChanges,
        allFiles,
        readFiles,
        searchedFiles
      );
      onProgress?.({
        type: 'diagnostics',
        detail: artifact.markdown,
      });
      if (artifact.policyIssues.length > 0) {
        fullText += `\n\n**Note:** Theme policy flagged ${artifact.policyIssues.length} issue(s):\n${artifact.policyIssues.map((i) => `- ${i}`).join('\n')}`;
      }
    }

    // ── Hard gate: theme_check on projected final state ────────────────────
    // CRITICAL: Compare against baseline to avoid clearing valid changes due to
    // pre-existing theme errors. Only block if the agent's changes INTRODUCED
    // new errors (not errors that existed before the edit session).
    if (intentMode === 'code' && accumulatedChanges.length > 0 && hasThemeLayoutContext) {
      const baselineFiles = allFiles.map((f) => ({ path: f.path ?? f.fileName, content: f.content ?? '' }));
      const baselineCheck = runThemeCheck(baselineFiles);
      const baselineErrorCount = baselineCheck.errorCount;

      const projectedFiles = allFiles.map((f) => {
        const change = accumulatedChanges.find((c) => c.fileName === f.fileName || c.fileName === (f.path ?? ''));
        return { path: f.path ?? f.fileName, content: change ? (change.proposedContent ?? '') : (f.content ?? '') };
      });
      const themeCheck = runThemeCheck(projectedFiles);
      const newErrors = Math.max(0, themeCheck.errorCount - baselineErrorCount);

      if (newErrors > 0) {
        // Changes introduced new theme errors — this is a hard block
        onProgress?.({
          type: 'diagnostics',
          detail: `Theme check: ${newErrors} new error(s) introduced by changes (${baselineErrorCount} pre-existing, ${themeCheck.errorCount} total after).`,
        });
        const themeErrors = themeCheck.issues
          .filter((i: { severity: string }) => i.severity === 'error')
          .slice(0, 5)
          .map((i: { file?: string; message: string }) => `${i.file ?? 'unknown'} — ${i.message}`);
        validationIssues.push({ gate: 'theme_check', errors: themeErrors, changesKept: false });
        accumulatedChanges.length = 0;
        fullText += `\n\nTheme check gate blocked completion — changes introduced ${newErrors} new error(s). Changes were cleared to protect production.`;
      } else if (!themeCheck.passed && baselineErrorCount > 0) {
        // Pre-existing errors only — keep changes, surface as warning
        onProgress?.({
          type: 'diagnostics',
          detail: `Theme check: ${baselineErrorCount} pre-existing error(s) in theme (not introduced by this edit). Changes preserved.`,
        });
        const themeErrors = themeCheck.issues
          .filter((i: { severity: string }) => i.severity === 'error')
          .slice(0, 5)
          .map((i: { file?: string; message: string }) => `${i.file ?? 'unknown'} — ${i.message}`);
        validationIssues.push({ gate: 'theme_check', errors: themeErrors, changesKept: true });
        fullText += `\n\n**Note:** Theme has ${baselineErrorCount} pre-existing error(s) unrelated to this edit. Changes applied.`;
      }
    }
    if (intentMode === 'code' && accumulatedChanges.length > 0 && validationIssues.length === 0) {
      fullText += '\n\nVerification evidence: verifyChanges passed; cross-file validation passed; theme_check passed.';
    }

    // ── EPIC 2d: File context rule enforcement ─────────────────────────────
    if (accumulatedChanges.length > 0) {
      const { allowed, rejected } = enforceFileContextRule(accumulatedChanges, allFiles, readFiles);
      if (rejected.length > 0) {
        console.warn(`[V2] File Context Rule rejected ${rejected.length} change(s)`);
        onProgress?.({
          type: 'thinking',
          phase: 'validating',
          label: `Rejected ${rejected.length} out-of-context change(s)`,
        });
        accumulatedChanges.length = 0;
        accumulatedChanges.push(...allowed);
      }
    }

    // ── Tier escalation on empty results ──────────────────────────────
    // If a code/debug request produced zero changes and no substantive
    // analysis, the tier was likely too low. Escalate and retry once.
    const isCodeMode = intentMode === 'code' || intentMode === 'debug';
    const hasSubstantiveAnalysis = fullText.length > 100;
    const escalationDepth = options._escalationDepth ?? 0;
    const shouldEscalate =
      isCodeMode &&
      accumulatedChanges.length === 0 &&
      !needsClarification &&
      !hasSubstantiveAnalysis &&
      escalationDepth < 1;

    if (shouldEscalate) {
      const nextTier = escalateTier(tier);
      if (nextTier) {
        console.log(`[V2] Zero changes on ${tier} — escalating to ${nextTier}`);
        onProgress?.({
          type: 'thinking',
          phase: 'analyzing',
          label: `Upgrading to ${nextTier} analysis`,
          detail: 'Initial attempt produced no results — retrying with stronger model',
        });

        return streamV2(
          executionId + '-esc',
          projectId,
          userId,
          userRequest,
          files,
          userPreferences,
          {
            ...options,
            _tierOverride: nextTier,
            _escalationDepth: escalationDepth + 1,
          },
        );
      }
    }

    if (referentialCodePrompt && intentMode === 'code' && !hasAttemptedEdit) {
      const referentialGateMsg =
        'This referential code request did not attempt a mutating edit. ' +
        'Please choose a target file or provide exact before/after snippet so I can apply deterministically.';
      fullText = fullText.trim() ? `${fullText}\n\n${referentialGateMsg}` : referentialGateMsg;
      onProgress?.({
        type: 'thinking',
        phase: 'clarification',
        label: 'Referential enactment requires concrete target',
        detail: referentialGateMsg,
      });
    }

    if (intentMode === 'code' && needsClarification && !hasStructuredClarification) {
      const fallbackOptions = buildFallbackClarificationOptions(allFiles, referentialArtifacts);
      onProgress?.({
        type: 'thinking',
        phase: 'clarification',
        label: 'Additional input needed to enact changes',
        detail:
          fullText.trim().length > 0
            ? fullText.trim()
            : 'I need one specific detail to apply the requested code changes safely.',
        metadata: {
          options: fallbackOptions,
          clarificationRound: 1,
          maxRounds: 2,
        },
      });
      hasStructuredClarification = true;
    }

    // ── Finalize ──────────────────────────────────────────────────────
    executionPhase = 'complete';

    // Flush any pending background DB writes before returning results.
    await fileStore?.flush();

    console.log(
      `[V2] Complete after ${iteration + 1} iterations, ${fullText.length} chars, ${accumulatedChanges.length} changes`,
    );

    const noChangeCodeRun = intentMode === 'code' && accumulatedChanges.length === 0;
    if (noChangeCodeRun) {
      appendExecutionTerminalLog(
        executionId,
        'result',
        'Code-mode request completed without mutating changes; status forced to failed.',
      );
    }
    if (accumulatedChanges.length > 0) {
      // Persist proposed changes for approve/reject flows.
      storeChanges(executionId, 'project_manager', accumulatedChanges);
    }
    updateExecutionStatus(executionId, noChangeCodeRun ? 'failed' : 'completed');
    await persistExecution(executionId);

    // Fire-and-forget: learn term-to-file mappings from this execution
    if (accumulatedChanges.length > 0 && intentMode === 'code') {
      const queryTerms = extractQueryTerms(userRequest);
      if (queryTerms.length > 0) {
        learnFromExecution(projectId, userId, {
          queryTerms,
          editedFiles: accumulatedChanges.map((c) => c.fileName),
          searchedFiles: [...searchedFiles],
        }).catch((err) => console.warn('[V2] Term mapping learning failed:', err));
      }
    }

    // Fire-and-forget: store task outcome for episodic memory
    if (pmSupa && intentMode === 'code') {
      import('@/lib/agents/memory/task-outcomes').then(({ storeTaskOutcome }) => {
        storeTaskOutcome(pmSupa!, {
          projectId,
          userId,
          taskSummary: userRequest.slice(0, 2000),
          strategy: currentStrategy,
          outcome: accumulatedChanges.length > 0 ? 'success' : noChangeCodeRun ? 'failure' : 'partial',
          filesChanged: accumulatedChanges.map(c => c.fileName),
          toolSequence: toolSequenceLog.slice(0, 50),
          iterationCount: iteration + 1,
          tokenUsage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens, model },
        });
      }).catch(() => {});
    }

    // Fire-and-forget: record tier-level telemetry
    recordTierMetrics({
      executionId,
      tier,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      filesPreloaded: preloaded.length,
      filesReadOnDemand,
      iterations: iteration + 1,
      firstTokenMs,
      totalMs: Date.now() - startTime,
      editSuccess: accumulatedChanges.length > 0,
      pipelineVersion: options._useLeanPipeline ? 'lean' : 'legacy',
    }).catch((err) => console.warn('[V2] Tier metrics recording failed:', err));

    if (totalCacheReadTokens > 0 || totalCacheWriteTokens > 0) {
      const cacheHitRate = totalInputTokens > 0
        ? Math.round((totalCacheReadTokens / (totalInputTokens + totalCacheReadTokens)) * 100)
        : 0;
      console.log(`[V2-Cache] Session summary: ${totalCacheReadTokens} read, ${totalCacheWriteTokens} created, ${cacheHitRate}% hit rate across ${iteration + 1} iterations`);
    }

    // needsClarification is only true when the agent explicitly called ask_clarification.
    const finalNeedsClarification = accumulatedChanges.length > 0 ? false : needsClarification;

    // When code mode ends with no changes, always stream a completion summary
    // so the user knows what was attempted, what failed, and how to proceed.
    if (intentMode === 'code' && accumulatedChanges.length === 0) {
      const wrapUp = buildCompletionSummary(
        fullText,
        toolSequenceLog,
        iteration + 1,
        lastMutationFailure as MutationFailure | null,
        hasAttemptedEdit,
      );
      if (wrapUp) {
        fullText += wrapUp;
        onContentChunk?.(wrapUp);
      }
    }

    const finalAnalysis = ensureCompletionResponseSections({
      analysis: fullText,
      intentMode,
      needsClarification: finalNeedsClarification,
      changes: accumulatedChanges,
      reviewResult: latestReviewResult,
    });

    // Clear checkpoint on successful completion
    if (isBackgroundResumeEnabled()) {
      clearCheckpoint(executionId).catch(() => {});
    }

    // Build cost summary from orchestration signals
    const costEvents = orchestrationSignals
      .filter(s => s.type === 'cost_event' && s.details)
      .map(s => s.details as unknown as import('./model-router').AgentCostEvent);
    const costSummary = costEvents.length > 0 ? {
      totalCostCents: costEvents.reduce((sum, e) => sum + (e.costCents ?? 0), 0),
      byPhase: {
        pm: costEvents.filter(e => e.phase === 'pm'),
        specialist: costEvents.filter(e => e.phase === 'specialist'),
        review: costEvents.filter(e => e.phase === 'review'),
      },
    } : undefined;

    // Emit cost summary to client
    if (costSummary) {
      onProgress?.({
        type: 'cost_summary',
        phase: 'complete',
        label: `Total: $${(costSummary.totalCostCents / 100).toFixed(4)}`,
        metadata: costSummary as unknown as Record<string, unknown>,
      });
    }

    return {
      agentType: 'project_manager',
      success: true,
      analysis: finalAnalysis,
      changes: accumulatedChanges.length > 0 ? accumulatedChanges : undefined,
      reviewResult: latestReviewResult,
      needsClarification: finalNeedsClarification,
      directStreamed: true,
      costSummary,
      usage: {
        totalInputTokens,
        totalOutputTokens,
        totalCacheReadTokens,
        totalCacheWriteTokens,
        model,
        provider: providerName,
        tier,
        phaseDiagnostics: {
          finalPhase: executionPhase,
          referentialMode: referentialCodePrompt,
          applyAttempted: hasAttemptedEdit,
          replayArtifactsResolved: referentialArtifacts.length,
          replayAppliedCount,
          replaySource,
          sessionId: options.sessionId,
        },
      },
      failureReason: (lastMutationFailure as MutationFailure | null)?.reason === 'old_text_not_found'
        ? 'search_replace_failed'
        : (lastMutationFailure as MutationFailure | null)?.reason === 'file_not_found'
          ? 'file_not_found'
          : (lastMutationFailure as MutationFailure | null)?.reason === 'validation_error'
            ? 'validation_failed'
            : null,
      suggestedAction: lastMutationFailure
        ? 'Try rephrasing the edit or paste the exact before/after code.'
        : null,
      failedTool: (lastMutationFailure as MutationFailure | null)?.toolName ?? null,
      failedFilePath: (lastMutationFailure as MutationFailure | null)?.filePath ?? null,
      verificationEvidence,
      validationIssues: validationIssues.length > 0 ? validationIssues : undefined,
    };
  } catch (error) {
    console.error('[V2] Fatal error:', error);

    // Flush pending writes even on error — partial edits are already committed locally
    await fileStore?.flush().catch(() => {});

    const classifiedError = error instanceof AIProviderError
      ? error
      : classifyNetworkError(error, 'v2-coordinator');

    // Completion contract: if execution was interrupted by a retryable provider/network fault,
    // checkpoint and continue in background instead of reporting a terminal completion.
    if (isBackgroundResumeEnabled() && classifiedError.retryable) {
      try {
        if (fileStore) {
          const dirtyIds = [...fileStore.getDirtyFileIds()];
          await checkpointSaveAfterSpecialist(
            executionId,
            'pm',
            {
              agentType: 'project_manager',
              success: false,
              analysis: fullText || `Interrupted: ${classifiedError.message}`,
            },
            dirtyIds,
            [...accumulatedChanges],
          );
        }
        onProgress?.({
          type: 'checkpointed',
          phase: 'background',
          label: 'Connection interrupted — continuing in background...',
          metadata: { executionId, code: classifiedError.code },
        });
        const { enqueueAgentJob, triggerDispatch } = await import('@/lib/tasks/agent-job-queue');
        await enqueueAgentJob({
          executionId,
          projectId,
          userId,
          userRequest,
          options: {
            ...options,
            onProgress: undefined,
            onContentChunk: undefined,
            onToolEvent: undefined,
            onReasoningChunk: undefined,
            loadContent: undefined,
          } as Record<string, unknown>,
        });
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        triggerDispatch(appUrl);
        return {
          agentType: 'project_manager',
          success: true,
          analysis: fullText || 'Execution interrupted and resumed in background.',
          changes: accumulatedChanges.length > 0 ? accumulatedChanges : undefined,
          needsClarification: false,
          directStreamed: true,
          checkpointed: true,
          usage: {
            totalInputTokens,
            totalOutputTokens,
            totalCacheReadTokens,
            totalCacheWriteTokens,
            model,
            provider: providerName,
            tier,
          },
        };
      } catch (checkpointErr) {
        console.error('[V2] Failed to checkpoint interrupted execution:', checkpointErr);
      }
    }

    // ── Error-based tier escalation ──────────────────────────────────
    const errDepth = options._escalationDepth ?? 0;
    if (errDepth < 1) {
      const nextTier = escalateTier(options._tierOverride ?? 'SIMPLE');
      if (nextTier) {
        console.log(`[V2] Error on tier — escalating to ${nextTier}`);
        options.onProgress?.({
          type: 'thinking',
          phase: 'analyzing',
          label: `Upgrading to ${nextTier} analysis`,
          detail: 'Error occurred — retrying with stronger model',
        });

        return streamV2(
          executionId + '-esc',
          projectId,
          userId,
          userRequest,
          files,
          userPreferences,
          {
            ...options,
            _tierOverride: nextTier,
            _escalationDepth: errDepth + 1,
          },
        );
      }
    }

    appendExecutionTerminalLog(
      executionId,
      'error',
      error instanceof Error
        ? `Fatal coordinator error: ${error.message}`
        : `Fatal coordinator error: ${String(error)}`,
    );
    updateExecutionStatus(executionId, 'failed');
    await persistExecution(executionId).catch(() => {});

    return {
      agentType: 'project_manager',
      success: false,
      analysis:
        error instanceof AIProviderError
          ? `AI provider error: ${error.message}`
          : `Unexpected error: ${String(error)}`,
      error: {
        code: error instanceof AIProviderError ? error.code : 'UNKNOWN',
        message: String(error),
        agentType: 'project_manager',
        recoverable: false,
      },
    };
  }
}

// ── Client tool handler ─────────────────────────────────────────────────────

// handleClientTool removed — all tools now routed through dispatchToolCall via the server path.

// ── Batch-to-stream adapter ─────────────────────────────────────────────────

/**
 * Synthesize a ToolStreamResult from a batch AIToolCompletionResult.
 * Used as a fallback when streaming is unavailable.
 */
function synthesizeBatchAsStream(
  batchResult: AIToolCompletionResult,
): ToolStreamResult {
  const events: ToolStreamEvent[] = [];

  // Emit text content as a single text_delta
  if (batchResult.content) {
    events.push({ type: 'text_delta', text: batchResult.content });
  }

  // Emit tool calls as start + end pairs
  if (batchResult.toolCalls) {
    for (const tc of batchResult.toolCalls) {
      events.push({ type: 'tool_start', id: tc.id, name: tc.name });
      events.push({
        type: 'tool_end',
        id: tc.id,
        name: tc.name,
        input: tc.input,
      });
    }
  }

  // Build raw content blocks for multi-turn
  const rawBlocks: unknown[] = [];
  if (batchResult.content) {
    rawBlocks.push({ type: 'text', text: batchResult.content });
  }
  if (batchResult.toolCalls) {
    for (const tc of batchResult.toolCalls) {
      rawBlocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
    }
  }

  const stream = new ReadableStream<ToolStreamEvent>({
    start(controller) {
      for (const event of events) {
        controller.enqueue(event);
      }
      controller.close();
    },
  });

  return {
    stream,
    getUsage: async () => ({
      inputTokens: batchResult.inputTokens ?? 0,
      outputTokens: batchResult.outputTokens ?? 0,
      cacheCreationInputTokens: (batchResult as unknown as Record<string, number>).cacheCreationInputTokens ?? 0,
      cacheReadInputTokens: (batchResult as unknown as Record<string, number>).cacheReadInputTokens ?? 0,
    }),
    getStopReason: async () => batchResult.stopReason,
    getRawContentBlocks: async () => rawBlocks,
  };
}
