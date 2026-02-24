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
import { ContextEngine, getProjectContextEngine } from '@/lib/ai/context-engine';
import { SymbolGraphCache } from '@/lib/context/symbol-graph-cache';
import { DependencyGraphCache } from '@/lib/context/dependency-graph-cache';
import type { FileContext as GraphFileContext } from '@/lib/context/types';
import { getAIProvider } from '@/lib/ai/get-provider';
import { isToolProvider } from './base';
import type { AIAction } from './model-router';
import { getProviderForModel, resolveModel } from './model-router';
import { classifyRequest, escalateTier, type RoutingTier } from './classifier';
import {
  shouldRequirePlanModeFirst,
  buildPlanModeRequiredMessage,
  hasPlanApprovalSignal,
  buildMaximumEffortPolicyMessage,
} from './orchestration-policy';
import { verifyChanges } from './verification';
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
} from './execution-store';
import { learnFromExecution, extractQueryTerms } from '@/lib/ai/term-mapping-learner';
import { estimateTokens } from '@/lib/ai/token-counter';
import { persistToolTurn } from '@/lib/ai/message-persistence';
import { recordTierMetrics } from '@/lib/telemetry/tier-metrics';
import { selectV2Tools } from './tools/v2-tool-definitions';
import { executeToolCall, type ToolExecutorContext } from './tools/tool-executor';
import { executeV2Tool, type V2ToolExecutorContext } from './tools/v2-tool-executor';
import { expandKeepExisting } from './tools/keep-existing-expander';
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
  getModelOverlay,
} from './prompts/v2-pm-prompt';
import type { LoadContentFn } from '@/lib/supabase/file-loader';
import { recordHistogram } from '@/lib/observability/metrics';

// ── Constants ───────────────────────────────────────────────────────────────

/** Iteration limits per intent mode (max tool-use rounds per run). */
const ITERATION_LIMITS: Record<string, number> = {
  ask: 18,
  code: 28,
  plan: 18,
  debug: 28,
};

/** Total timeout for the entire streamV2 execution. Env AGENT_TOTAL_TIMEOUT_MS overrides (e.g. 1800000 = 30 min). */
const TOTAL_TIMEOUT_MS = Number(process.env.AGENT_TOTAL_TIMEOUT_MS) || 1_800_000; // 30 min default

/** Max characters for a single tool result before truncation. */
const MAX_TOOL_RESULT_CHARS = 6_000;

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
const MUTATING_CLIENT_TOOL_NAMES = new Set([
  'propose_code_edit',
  'search_replace',
  'create_file',
  'write_file',
  'delete_file',
  'rename_file',
]);

const PRE_EDIT_LOOKUP_BUDGET = 1;
const PRE_EDIT_BLOCK_THRESHOLD = 2;
const PRE_EDIT_ENFORCEMENT_ABORT_THRESHOLD = 2;
const REFERENTIAL_PRE_EDIT_LOOKUP_BUDGET = 0;
const REFERENTIAL_PRE_EDIT_BLOCK_THRESHOLD = 1;

/** Tool call cap: 0 = no cap; iteration limit and timeout guard the run. */
const MAX_TOOL_CALLS = 0;

function parseReviewToolContent(content: string): ReviewResult | null {
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
  'run_specialist',  // v2: specialist delegation is a server tool
  'run_review',      // v2: review is a server tool
]);

/** V2-only tools that require the V2ToolExecutorContext. */
const V2_ONLY_TOOLS = new Set(['run_specialist', 'run_review']);

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
  /** Max parallel specialists (1–4). Default 3. */
  maxParallelSpecialists?: number;
}

// ── V2 Context Builder ──────────────────────────────────────────────────────

interface V2Context {
  preloaded: FileContext[];
  allFiles: FileContext[];
  manifest: string;
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
    return { preloaded, allFiles: files, manifest };
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
    const graphMatched = symbolGraphCache.lookupFiles(graph, userRequest, tier === 'TRIVIAL' ? 4 : 10);
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
  const preloadedIds = new Set(preloaded.map(f => f.fileId));
  for (const pmf of promptMentionedFiles) {
    if (!preloadedIds.has(pmf.fileId)) {
      preloaded.push(pmf);
      preloadedIds.add(pmf.fileId);
    }
  }

  // Context packing scorer: prioritize active/open tabs/prompt/symbol files.
  const score = new Map<string, number>();
  for (const f of result.files) score.set(f.fileId, (score.get(f.fileId) ?? 0) + 10);
  for (const id of graphMatchedIds) score.set(id, (score.get(id) ?? 0) + 20);
  for (const f of promptMentionedFiles) score.set(f.fileId, (score.get(f.fileId) ?? 0) + 35);
  for (const id of options.openTabs ?? []) score.set(id, (score.get(id) ?? 0) + 30);
  if (options.activeFilePath) {
    const active = files.find((f) => f.path === options.activeFilePath || f.fileName === options.activeFilePath);
    if (active) score.set(active.fileId, (score.get(active.fileId) ?? 0) + 40);
  }
  const preloadedCap = tier === 'TRIVIAL' ? 6 : tier === 'SIMPLE' ? 12 : 20;
  preloaded = [...new Map(preloaded.map((f) => [f.fileId, f])).values()]
    .sort((a, b) => (score.get(b.fileId) ?? 0) - (score.get(a.fileId) ?? 0))
    .slice(0, preloadedCap);

  // Hydrate selected files with real content if loadContent is available
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

  // Build compact manifest from structured index, excluding preloaded files
  const fileIndex = contextEngine.getFileIndex();
  const MAX_MANIFEST_ENTRIES = 50;
  const preloadedIdSet = new Set(preloaded.map(f => f.fileId));
  const otherEntries = fileIndex
    .filter(m => !preloadedIdSet.has(m.fileId))
    .sort((a, b) => a.fileName.localeCompare(b.fileName));
  const shownOthers = otherEntries.slice(0, MAX_MANIFEST_ENTRIES);
  const manifestLines = shownOthers.map(
    m => `  ${m.fileName} (${m.fileType}, ~${m.tokenEstimate} tok)`,
  );
  if (otherEntries.length > shownOthers.length) {
    manifestLines.push(`  ... and ${otherEntries.length - shownOthers.length} more files`);
  }
  const manifestHeader = `${files.length} files in project (${preloadedIdSet.size} already loaded in context above, ${otherEntries.length} others):`;
  const manifest = `${manifestHeader}\n${manifestLines.join('\n')}`;

  return { preloaded, allFiles: files, manifest };
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
const ENABLE_UNISOLATED_PARALLEL_SERVER_TOOLS = false;

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

// ── Main entry point ────────────────────────────────────────────────────────

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

  const contextEngine = getProjectContextEngine(projectId);
  const onProgress = options.onProgress;
  const onContentChunk = options.onContentChunk;
  const onToolEvent = options.onToolEvent;
  const intentMode = options.intentMode ?? 'code';

  console.log(`[V2] Starting for execution ${executionId}, mode=${intentMode}`);

  onProgress?.({
    type: 'thinking',
    phase: 'analyzing',
    subPhase: 'building_context',
    label: 'Building context...',
  });

  try {
    // ── Classify request complexity ─────────────────────────────────
    let tier: RoutingTier = 'SIMPLE';
    if (options._tierOverride) {
      tier = options._tierOverride;
      console.log(`[V2] Tier override: ${tier} (escalation depth=${options._escalationDepth ?? 0})`);
    } else {
      try {
        const classification = await classifyRequest(userRequest, files.length, {
          lastMessageSummary: options.recentMessages?.slice(-1)[0],
          recentMessages: options.recentMessages,
          skipLLM: intentMode === 'ask',
        });
        tier = classification.tier;
        console.log(`[V2] Classified as ${tier} (source=${classification.source}, confidence=${classification.confidence}${intentMode === 'ask' ? ', llm=skipped' : ''})`);
      } catch (err) {
        console.warn('[V2] Classification failed, defaulting to SIMPLE:', err);
      }
    }

    // ── Load learned term mappings (best-effort, cached in context engine)
    if (contextEngine.getTermMappingCount() === 0) {
      try {
        const { loadTermMappings } = await import('@/lib/ai/term-mapping-learner');
        const mappings = await loadTermMappings(projectId);
        if (mappings.length > 0) {
          contextEngine.loadTermMappingsData(mappings);
          console.log(`[V2] Loaded ${mappings.length} term mappings for project`);
        }
      } catch { /* term mappings are best-effort */ }
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
    const { preloaded, allFiles, manifest } = await buildV2Context(projectId, files, userRequest, options, tier);

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

    // Format pre-loaded files for the user message
    const fileContents = preloaded
      .filter(f => f.content && !f.content.startsWith('['))
      .map(f => {
        let content = f.content;
        // Auto-strip schemas from section files to reduce context size
        if (isSectionFile(f.fileName || f.path || '')) {
          content = contentWithSchemaSummary(content);
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
    systemPrompt += '\n\n' + buildMaximumEffortPolicyMessage();

    // â”€â”€ Style-aware context assembly (Phases 1.1, 1.2, 2.2, 2.3) â”€â”€â”€â”€

    // Phase 5: Unified style profile (merges design tokens + code style + patterns + memory)
    let styleProfileContent = '';
    let styleProfileStats = { tokenCount: 0, styleRuleCount: 0, patternCount: 0, memoryCount: 0, conflictResolutions: 0 };
    try {
      const profile = await buildUnifiedStyleProfile(projectId, userId, files);
      styleProfileContent = profile.content;
      styleProfileStats = profile.stats;
    } catch { /* never blocks execution */ }

    if (styleProfileContent) {
      systemPrompt += '\n\n' + styleProfileContent;
    }

    // Extended pattern detection (run once per 5min, fire-and-forget)
    try {
      const patternLearner = new PatternLearning();
      patternLearner.detectExtendedPatterns(projectId, userId, files).catch(() => {});
    } catch { /* never blocks */ }

    // Legacy designContext alias for downstream consumers
    const designContext = styleProfileContent;

    // Phase 1.2: Reference section injection
    let fileTreeData: ShopifyFileTree | null = null;
    try {
      fileTreeData = await getFileTree(projectId);
    } catch { /* best-effort */ }

    const refSections = selectReferenceSections(
      userRequest,
      options.activeFilePath,
      allFiles,
      fileTreeData,
    );

    // Phase 2.2: CSS custom property preloading
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
      '## FILE MANIFEST:',
      manifest,
    ];
    // Mark file context message for prompt caching â€” this stays identical across iterations
    const fileContextMsg: AIMessage = { role: 'user', content: userMessageParts.join('\n') };
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
      console.log('[V2] Fast edit path activated (MAX_ITERATIONS=2)');
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
    const accumulatedChanges: CodeChange[] = [];
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
    let readOnlyIterationCount = 0;
    let failedMutationCount = 0;
    let debugFixAttemptCount = 0;
    const proposeOnlyFiles = new Set<string>();
    const toolOutputCache = new Map<string, string>();
    const invalidateProjectGraphs = () => {
      dependencyGraphCache.invalidateProject(projectId).catch(() => {});
      symbolGraphCache.invalidateProject(projectId).catch(() => {});
    };

    onProgress?.({
      type: 'thinking',
      phase: 'analyzing',
      subPhase: 'building_context',
      label: `${tier} tier — using ${model.split('/').pop() ?? model}`,
      metadata: { routingTier: tier },
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

      let needsClarification = false;
      if (intentMode === 'code') {
        needsClarification = true;
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
        needsClarification,
        changes: [],
        reviewResult: undefined,
      });

      return {
        agentType: 'project_manager',
        success: true,
        analysis: finalAnalysis,
        needsClarification,
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

    // Standard tool executor context (for read_file, search, grep, etc.)
    const toolCtx: ToolExecutorContext = {
      files: allFiles,
      contextEngine,
      projectId,
      userId,
      loadContent: options.loadContent,
      sessionId: options.sessionId,
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
        onToolEvent?.({
          type: 'tool_call',
          name: 'propose_code_edit',
          id: `specialist-${Date.now()}`,
          input: {
            filePath: change.fileName,
            newContent: change.proposedContent,
            reasoning: change.reasoning,
          },
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
      },
      model: options.model,
      dependencyContext: undefined,
      designContext: designContext || undefined,
      memoryContext: options.memoryContext,
      loadContent: options.loadContent,
      onProgress,
      specialistCallCount: { value: 0 },
      tier,
    };

    // Map of pre-loaded files for read_file short-circuiting
    const preloadedMap = new Map<string, FileContext>();
    for (const f of preloaded.filter(p => p.content && !p.content.startsWith('['))) {
      preloadedMap.set(f.fileId, f);
      preloadedMap.set(f.fileName, f);
      if (f.path) preloadedMap.set(f.path, f);
    }

    // â”€â”€ Inject style-aware reference context into preloadedMap â”€â”€â”€â”€â”€â”€

    // Phase 1.2: Add reference sections to preloaded context
    if (refSections.length > 0 && options.loadContent) {
      const refIds = refSections
        .filter(f => !f.content || f.content.startsWith('['))
        .map(f => f.fileId);
      if (refIds.length > 0) {
        try {
          const hydrated = await options.loadContent(refIds);
          const hydratedMap = new Map(hydrated.map((f: FileContext) => [f.fileId, f]));
          for (const ref of refSections) {
            const h = hydratedMap.get(ref.fileId) ?? ref;
            if (h.content && !h.content.startsWith('[')) {
              preloadedMap.set(h.fileName, h);
              if (h.path) preloadedMap.set(h.path, h);
              readFiles.add(h.fileName);
            }
          }
        } catch { /* best-effort hydration */ }
      } else {
        for (const ref of refSections) {
          if (ref.content && !ref.content.startsWith('[')) {
            preloadedMap.set(ref.fileName, ref);
            if (ref.path) preloadedMap.set(ref.path, ref);
            readFiles.add(ref.fileName);
          }
        }
      }
    }

    // Phase 2.2: Add CSS file to preloaded context
    if (preloadedCssFile && !preloadedMap.has(preloadedCssFile.fileName)) {
      let cssContent = preloadedCssFile.content;
      if (!cssContent || cssContent.startsWith('[')) {
        if (options.loadContent) {
          try {
            const [hydrated] = await options.loadContent([preloadedCssFile.fileId]);
            if (hydrated?.content) cssContent = hydrated.content;
          } catch { /* best-effort */ }
        }
      }
      if (cssContent && !cssContent.startsWith('[')) {
        const cappedContent = cssContent.length > 10_000
          ? cssContent.slice(0, 10_000) + '\n/* ... truncated at 10K chars ... */'
          : cssContent;
        const cssCopy = { ...preloadedCssFile, content: cappedContent };
        preloadedMap.set(cssCopy.fileName, cssCopy);
        if (cssCopy.path) preloadedMap.set(cssCopy.path, cssCopy);
        readFiles.add(cssCopy.fileName);
      }
    }

    // Phase 2.3: Add snippet consumer sections to preloaded context
    if (snippetConsumers.length > 0 && options.loadContent) {
      const consumerIds = snippetConsumers
        .filter(f => !f.content || f.content.startsWith('['))
        .map(f => f.fileId);
      if (consumerIds.length > 0) {
        try {
          const hydrated = await options.loadContent(consumerIds);
          const hydratedMap = new Map(hydrated.map((f: FileContext) => [f.fileId, f]));
          for (const consumer of snippetConsumers) {
            const h = hydratedMap.get(consumer.fileId) ?? consumer;
            if (h.content && !h.content.startsWith('[')) {
              preloadedMap.set(h.fileName, h);
              if (h.path) preloadedMap.set(h.path, h);
              readFiles.add(h.fileName);
            }
          }
        } catch { /* best-effort hydration */ }
      } else {
        for (const consumer of snippetConsumers) {
          if (consumer.content && !consumer.content.startsWith('[')) {
            preloadedMap.set(consumer.fileName, consumer);
            if (consumer.path) preloadedMap.set(consumer.path, consumer);
            readFiles.add(consumer.fileName);
          }
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

    // ── Validation baseline: capture pre-edit error counts ──────────
    let baselineErrorCount = 0;
    if (intentMode === 'code' || intentMode === 'debug') {
      try {
        const baselineFiles = allFiles.map((f) => ({ path: f.path ?? f.fileName, content: f.content }));
        const baseline = runThemeCheck(baselineFiles, undefined, { bypassCache: true });
        baselineErrorCount = baseline.errorCount;
      } catch { /* theme check unavailable */ }
    }

    // ── Agent loop ────────────────────────────────────────────────────
    while (!skippedLoop && iteration < MAX_ITERATIONS) {
      const changesAtIterationStart = accumulatedChanges.length;
      let mutatingAttemptedThisIteration = false;
      if (Date.now() - startTime > TOTAL_TIMEOUT_MS) {
        console.warn(`[V2] Timeout after ${iteration} iterations`);
        break;
      }

      // Mid-execution context summarization: compress oldest messages when approaching 80% of context limit
      const contextTokens = messages.reduce(
        (sum, m) => sum + estimateTokens(typeof m.content === 'string' ? m.content : JSON.stringify(m.content)),
        0,
      );
      const contextLimit = model.includes('claude') ? 180_000 : model.includes('gpt') ? 120_000 : 100_000;
      if (contextTokens > contextLimit * 0.8) {
        const compressible = messages.filter((m, i) => i > 0 && m.role !== 'system');
        if (compressible.length > 4) {
          const oldest = compressible.slice(0, Math.floor(compressible.length / 2));
          for (const msg of oldest) {
            if (typeof msg.content === 'string' && msg.content.length > 500) {
              msg.content = msg.content.slice(0, 200) + '\n[... compressed for context budget]';
            }
          }
          console.log(`[V2] Context budget: ${contextTokens}/${contextLimit} tokens (${Math.round(contextTokens / contextLimit * 100)}%) — compressed ${oldest.length} old messages`);
        }
      }

      // Apply token budget before each iteration
      const budgeted = enforceRequestBudget(messages);

      console.log(
        `[V2] Iteration ${iteration}, messages=${budgeted.messages.length}, truncated=${budgeted.truncated}`,
      );

      // Stream with tools — gate Anthropic-specific features by provider
      const isAnthropic = providerName === 'anthropic';

      const completionOpts: Record<string, unknown> = {
        model,
        maxTokens: intentMode === 'ask' ? 2048 : 4096,
        ...(isAnthropic && ptcContainerId ? { container: ptcContainerId } : {}),
        ...(AI_FEATURES.adaptiveThinking ? {
          thinking: { type: 'adaptive' },
          effort: tier === 'ARCHITECTURAL' ? 'high' : tier === 'COMPLEX' ? 'medium' : 'low',
        } : {}),
        ...(isAnthropic && AI_FEATURES.contextEditing ? {
          contextManagement: {
            edits: [
              ...(AI_FEATURES.adaptiveThinking ? [{
                type: 'clear_thinking_20251015' as const,
                keep: { type: 'thinking_turns' as const, value: 1 },
              }] : []),
              {
                type: 'clear_tool_uses_20250919' as const,
                trigger: { type: 'input_tokens' as const, value: 50_000 },
                keep: { type: 'tool_uses' as const, value: 3 },
                clear_at_least: { type: 'input_tokens' as const, value: 5_000 },
              },
            ],
          },
        } : {}),
      };

      let streamResult: ToolStreamResult;

      if (isV2StreamBroken()) {
        const batchResult = await provider.completeWithTools(budgeted.messages, tools, completionOpts);
        streamResult = synthesizeBatchAsStream(batchResult);
      } else {
        let raced: ToolStreamResult | null = null;
        try {
          const rawStream = await provider.streamWithTools(budgeted.messages, tools, completionOpts);
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
          const batchResult = await provider.completeWithTools(budgeted.messages, tools, completionOpts);
          streamResult = synthesizeBatchAsStream(batchResult);
        }
      }

      // Cache tool results during streaming (keyed by tool_use_id)
      const iterToolResults = new Map<string, { content: string; is_error?: boolean; isPTC?: boolean }>();
      const pendingServerTools: Extract<ToolStreamEvent, { type: 'tool_end' }>[] = [];
      // PTC: tool calls made by the code-execution sandbox
      const pendingPTCTools: Extract<ToolStreamEvent, { type: 'server_tool_use' }>[] = [];
      const reader = streamResult.stream.getReader();

      try {
        while (true) {
          let readResult: ReadableStreamReadResult<ToolStreamEvent>;
          try {
            readResult = await reader.read();
          } catch (streamErr) {
            console.error('[V2] Mid-stream read error:', streamErr);
            break; // Use accumulated results so far
          }
          const { done, value } = readResult;
          if (done) break;

          const event = value as ToolStreamEvent;

          // ── Text streaming ──────────────────────────────────────────
          if (event.type === 'text_delta') {
            if (firstTokenMs === 0) firstTokenMs = Date.now() - startTime;
            fullText += event.text;
            onContentChunk?.(event.text);
          }

          // Forward thinking events to the reasoning UI
          if (event.type === 'thinking_delta') {
            options.onReasoningChunk?.('project_manager', event.text);
          }

          // ── Tool start ──────────────────────────────────────────────
          if (event.type === 'tool_start') {
            onToolEvent?.({
              type: 'tool_start',
              name: event.name,
              id: event.id,
            });
          }

          // ── Tool end ────────────────────────────────────────────────
          if (event.type === 'tool_end') {
            const isServerTool = V2_SERVER_TOOLS.has(event.name);

            if (isServerTool) {
              // Collect server tools for execution after stream iteration
              pendingServerTools.push(event);
            } else {
              // Client-rendered tool — forward to UI
              onToolEvent?.({
                type: 'tool_call',
                name: event.name,
                id: event.id,
                input: event.input,
              });

              // Track clarification requests
              if (event.name === 'ask_clarification') {
                needsClarification = true;
                const inputOptions = (event.input?.options as Array<{ id?: string; label?: string }> | undefined) ?? [];
                if (Array.isArray(inputOptions) && inputOptions.length > 0) {
                  hasStructuredClarification = true;
                }
              }

              // Accumulate code changes + update in-memory state
              const changesBeforeTool = accumulatedChanges.length;
              const syntheticMsg = handleClientTool(
                event,
                files,
                preloadedMap,
                accumulatedChanges,
                resolveFile,
              );
              const wasNetZero = MUTATING_CLIENT_TOOL_NAMES.has(event.name) &&
                accumulatedChanges.length === changesBeforeTool;
              if (MUTATING_CLIENT_TOOL_NAMES.has(event.name)) {
                hasAttemptedEdit = true;
                mutatingAttemptedThisIteration = true;
                executionPhase = 'applyPatch';
                contextVersion += 1;
                invalidateProjectGraphs();
              }
              if (wasNetZero) {
                onToolEvent?.({
                  type: 'tool_result',
                  name: event.name,
                  id: event.id,
                  netZero: true,
                });
              }
              iterToolResults.set(event.id, { content: syntheticMsg });
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
      if (pendingServerTools.length > 0) {
        const maxParallel = options.maxParallelSpecialists ?? 3;
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
              // Don't count: zero-cost cache hit (limit is for actual execution cost)
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
            } else if (V2_ONLY_TOOLS.has(evt.name)) {
              // V2-specific tools: run_specialist, run_review
              onToolEvent?.({
                type: 'tool_progress',
                name: evt.name,
                id: evt.id,
                toolCallId: evt.id,
                progress: { phase: 'executing', detail: `Running ${evt.name}...` },
              });
              try {
                toolResult = await executeV2Tool(toolCall, v2ToolCtx);
                if (evt.name === 'run_review' && !toolResult.is_error) {
                  const parsed = parseReviewToolContent(toolResult.content ?? '');
                  if (parsed) {
                    latestReviewResult = parsed;
                    setReviewResult(executionId, parsed);
                  }
                }
                if (evt.name === 'run_specialist' && !toolResult.is_error) {
                  hasAttemptedEdit = true;
                  executionPhase = 'applyPatch';
                  contextVersion += 1;
                  invalidateProjectGraphs();
                }
              } catch (err) {
                toolResult = {
                  tool_use_id: evt.id,
                  content: `V2 tool execution failed: ${String(err)}`,
                  is_error: true,
                };
              }
            } else {
              // Standard server tools
              let intercepted = false;
              if (evt.name === 'search_replace') {
                const targetPath = (evt.input?.filePath ?? evt.input?.file_path) as string | undefined;
                if (targetPath && proposeOnlyFiles.has(targetPath)) {
                  toolResult = {
                    tool_use_id: evt.id,
                    content: `search_replace is disabled for ${targetPath} after repeated failures. Use propose_code_edit instead — it uses a unified diff and does not require exact string matching.`,
                    is_error: true,
                  };
                  intercepted = true;
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
                  toolResult = await executeToolCall(toolCall, toolCtx);
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
              // Treat as attempted edit so we don't restart the lookup budget
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
              (MUTATING_CLIENT_TOOL_NAMES.has(evt.name) || evt.name === 'search_replace' || evt.name === 'create_file') &&
              !toolResult.is_error
            ) {
              const lintFilePath = (evt.input?.filePath ?? evt.input?.path ?? evt.input?.file_path) as string | undefined;
              if (lintFilePath && typeof lintFilePath === 'string') {
                try {
                  const lintResult = await executeToolCall(
                    { id: `auto-lint-${Date.now()}`, name: 'check_lint', input: { fileName: lintFilePath } },
                    toolCtx,
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

            // Truncate large results — cache full content for read_file retrieval
            let truncatedContent = toolResult.content;
            if (toolResult.content.length > MAX_TOOL_RESULT_CHARS) {
              const summary = toolResult.content.slice(0, 2000);
              const fullLength = toolResult.content.length;
              const outputId = `tool-output-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
              toolOutputCache.set(outputId, toolResult.content);
              truncatedContent = `${summary}\n\n... (${fullLength} chars total, showing first 2000. Full output available — use read_file with fileId "${outputId}" to see more.)`;
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

        // Run file-conflicting / no-file-declared tools sequentially
        for (const evt of sequential) {
          await executeOneServerTool(evt);
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
        needsClarification = true;
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
            'or (2) ask_clarification if required details are missing. ' +
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
            'Next attempt must begin with an edit tool (search_replace/propose_code_edit/create_file) ' +
            'or ask_clarification if details are missing.';
          needsClarification = true;
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
          needsClarification = true;
          const abortMsg =
            'Stopping: repeated edit failures with no net change applied. ' +
            'Please share the exact file content or accept a full file rewrite.';
          fullText = fullText.trim() ? `${fullText}\n\n${abortMsg}` : abortMsg;
          onContentChunk?.(`\n\n${abortMsg}`);
          break;
        }
        enactEnforcementCount += 1;
        if (debugFixAttemptCount >= 5) {
          needsClarification = true;
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
                toolResult = await executeToolCall(toolCall, toolCtx);
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
            if (MUTATING_CLIENT_TOOL_NAMES.has(evt.name) && !toolResult.is_error) {
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
                  const ptcLintResult = await executeToolCall(
                    { id: `auto-lint-ptc-${Date.now()}`, name: 'check_lint', input: { fileName: ptcLintPath } },
                    toolCtx,
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
            let truncatedContentPTC = toolResult.content;
            if (toolResult.content.length > MAX_TOOL_RESULT_CHARS) {
              const ptcSummary = toolResult.content.slice(0, 2000);
              const ptcFullLen = toolResult.content.length;
              const ptcOutputId = `tool-output-ptc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
              toolOutputCache.set(ptcOutputId, toolResult.content);
              truncatedContentPTC = `${ptcSummary}\n\n... (${ptcFullLen} chars total, showing first 2000. Full output available — use read_file with fileId "${ptcOutputId}" to see more.)`;
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

      // ── Log context editing stats ────────────────────────────────
      try {
        const edits = await streamResult.getContextEdits?.();
        if (edits && edits.length > 0) {
          for (const edit of edits) {
            if (edit.type === 'clear_tool_uses_20250919') {
              console.log(`[V2-ContextEdit] Cleared ${edit.cleared_tool_uses ?? 0} tool use(s), ${edit.cleared_input_tokens ?? 0} tokens (iter ${iteration})`);
            }
            if (edit.type === 'clear_thinking_20251015') {
              console.log(`[V2-ContextEdit] Cleared ${edit.cleared_thinking_turns ?? 0} thinking turn(s), ${edit.cleared_input_tokens ?? 0} tokens (iter ${iteration})`);
            }
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

      // ── Read-only loop detection: force action after 3 read-only iterations
      const READ_ONLY_TOOLS = new Set([
        'read_file', 'grep_content', 'search_files', 'glob_files', 'list_files',
        'get_dependency_graph', 'get_schema_settings', 'find_references',
        'read_chunk', 'parallel_batch_read',
      ]);
      const iterToolNames = [...iterToolResults.keys()].map(() => ''); // tool names aren't tracked in results
      const onlyReadToolsThisIter = !hasAttemptedEdit && !mutatingAttemptedThisIteration;
      if (onlyReadToolsThisIter && (intentMode === 'code' || intentMode === 'debug')) {
        readOnlyIterationCount = (readOnlyIterationCount ?? 0) + 1;
        if (readOnlyIterationCount >= 3) {
          messages.push({
            role: 'user',
            content:
              'SYSTEM: You have investigated for 3 iterations without making changes. ' +
              'You MUST now either: (1) call search_replace or propose_code_edit to make the change, ' +
              '(2) call run_specialist to delegate the work, or (3) respond with your findings. ' +
              'Do NOT read more files.',
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
        if (hasApprovedPlanSignal && mutatingAttemptedThisIteration && !addedChangesThisIteration) {
          needsClarification = true;
          const approvedPlanBreakerMsg =
            'Approved-plan execution attempted an edit but produced no net file change. ' +
            'Please confirm the exact file/path and expected delta so I can enact directly without re-looping.';
          fullText = fullText.trim()
            ? `${fullText}\n\n${approvedPlanBreakerMsg}`
            : approvedPlanBreakerMsg;
          onProgress?.({
            type: 'thinking',
            phase: 'clarification',
            label: 'Approved plan blocked — no net change applied',
            detail: approvedPlanBreakerMsg,
          });
          break;
        }
        if (addedChangesThisIteration) {
          postEditNoChangeIterations = 0;
        } else {
          // Treat mutating client-tool attempts as execution too; otherwise we can loop on
          // repeated no-op write/edit attempts without tripping the stagnation breaker.
          const hadExecution =
            pendingPTCTools.length > 0 ||
            pendingServerTools.length > 0 ||
            mutatingAttemptedThisIteration;
          if (hadExecution) {
            postEditNoChangeIterations += 1;
            if (postEditNoChangeIterations >= 4) {
              needsClarification = true;
              const breakerMsg =
                'Stopped after repeated execution-only iterations with no net code changes. ' +
                'Confirm the exact target file/path or intended delta so I can apply changes directly.';
              fullText = fullText.trim() ? `${fullText}\n\n${breakerMsg}` : breakerMsg;
              onProgress?.({
                type: 'thinking',
                phase: 'clarification',
                label: 'Execution stalled — clarification required',
                detail: breakerMsg,
              });
              break;
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
      } catch { /* getUsage may fail if stream errored */ }
      // ── Check stop reason ─────────────────────────────────────────
      const stopReason = await streamResult.getStopReason();
      const rawBlocks = await streamResult.getRawContentBlocks();

      if (stopReason !== 'tool_use' || iteration >= MAX_ITERATIONS - 1) {
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
          rawBlocks.filter((b: { type: string }) => b.type === 'tool_use' || b.type === 'server_tool_use'),
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

      // Compress old tool results to save tokens in later iterations
      // Skip when context editing is active (API handles it server-side)
      if (!AI_FEATURES.contextEditing) {
        compressOldToolResults(messages);
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
        needsClarification = true;
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
      needsClarification = true;
      onProgress?.({
        type: 'thinking',
        phase: 'clarification',
        label: 'Investigation complete — awaiting direction',
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
      needsClarification = true;
      onProgress?.({
        type: 'thinking',
        phase: 'clarification',
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
        const autoReviewToolResult = await executeV2Tool(reviewToolCall, v2ToolCtx);
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

    // ── Unified verification pipeline ──────────────────────────────────────
    // Run verifyChanges and runThemeCheck together, merge issues, build evidence.
    let verificationEvidence: {
      syntaxCheck: { passed: boolean; errorCount: number; warningCount: number };
      themeCheck?: { passed: boolean; errorCount: number; warningCount: number; infoCount: number };
      checkedFiles: string[];
      totalCheckTimeMs: number;
    } | undefined;

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

      // Compare post-edit errors against baseline — only block on NEW errors
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
        needsClarification = true;
        accumulatedChanges.length = 0;
        fullText += `\n\nValidation blocked: ${postEditErrorCount - baselineErrorCount} new error(s) introduced by this edit (baseline: ${baselineErrorCount}, post-edit: ${postEditErrorCount}).`;
      } else if (!verification.passed || (themeCheckResult && !themeCheckResult.passed)) {
        // Pre-existing errors — report but don't block
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
      // Hard gate: block completion if core verification found errors.
      if (!verification.passed) {
        needsClarification = true;
        accumulatedChanges.length = 0;
        fullText += `\n\nValidation gate blocked completion:\n${verification.formatted}`;
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
        // Hard gate: invalid cross-file contracts cannot be finalized.
        needsClarification = true;
        accumulatedChanges.length = 0;
        fullText += '\n\nCross-file contract gate blocked completion due to validation errors.';
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
        // Informational: policy issues are logged but don't block changes
        fullText += `\n\n**Note:** Theme policy flagged ${artifact.policyIssues.length} issue(s):\n${artifact.policyIssues.map((i) => `- ${i}`).join('\n')}`;
      }
    }

    // ── Hard gate: theme_check on projected final state ────────────────────
    if (intentMode === 'code' && accumulatedChanges.length > 0 && hasThemeLayoutContext) {
      const projectedFiles = allFiles.map((f) => {
        const change = accumulatedChanges.find((c) => c.fileName === f.fileName || c.fileName === (f.path ?? ''));
        return { path: f.path ?? f.fileName, content: change ? change.proposedContent : f.content };
      });
      const themeCheck = runThemeCheck(projectedFiles);
      if (!themeCheck.passed) {
        onProgress?.({
          type: 'diagnostics',
          detail: `Theme check failed with ${themeCheck.errorCount} error(s) and ${themeCheck.warningCount} warning(s).`,
        });
        needsClarification = true;
        accumulatedChanges.length = 0;
        fullText += `\n\nTheme check gate blocked completion (${themeCheck.errorCount} error(s)).`;
      }
    }
    if (intentMode === 'code' && accumulatedChanges.length > 0) {
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
      needsClarification = true;
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

    // If edits were successfully applied, this is not a clarification situation
    // regardless of what post-loop checks decided. The agent did its job.
    const finalNeedsClarification = accumulatedChanges.length > 0 ? false : needsClarification;

    const finalAnalysis = ensureCompletionResponseSections({
      analysis: fullText,
      intentMode,
      needsClarification: finalNeedsClarification,
      changes: accumulatedChanges,
      reviewResult: latestReviewResult,
    });

    return {
      agentType: 'project_manager',
      success: true,
      analysis: finalAnalysis,
      changes: accumulatedChanges.length > 0 ? accumulatedChanges : undefined,
      reviewResult: latestReviewResult,
      needsClarification: finalNeedsClarification,
      directStreamed: true,
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
    };
  } catch (error) {
    console.error('[V2] Fatal error:', error);

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

/**
 * Handle a client-rendered tool event (propose_code_edit, search_replace,
 * create_file, etc.). Accumulates code changes and updates in-memory file
 * state for read-after-write freshness in subsequent iterations.
 *
 * Returns a synthetic message to feed back to the model as a tool result.
 */
function handleClientTool(
  event: Extract<ToolStreamEvent, { type: 'tool_end' }>,
  files: FileContext[],
  preloadedMap: Map<string, FileContext>,
  accumulatedChanges: CodeChange[],
  resolveFileFn?: (ref: string) => FileContext | undefined,
): string {
  if (event.name === 'propose_code_edit') {
    const filePath = event.input?.filePath as string;
    let newContent = event.input?.newContent as string;
    const reasoning = event.input?.reasoning as string;
    const matchedFile = resolveFileFn?.(filePath) ?? preloadedMap.get(filePath);

    const originalContent = matchedFile?.content ?? '';
    if (newContent && /keep existing code/i.test(newContent)) {
      newContent = expandKeepExisting(newContent, originalContent);
    }
    const isNetChange = (newContent ?? '') !== originalContent;

    // Destructive change guard: block edits that remove >50% of file content.
    // This catches model truncation where the LLM generates a partial file.
    const origLen = originalContent.length;
    const newLen = (newContent ?? '').length;
    const isDestructive = origLen > 200 && newLen < origLen * 0.5;

    if (isDestructive) {
      return `BLOCKED: propose_code_edit for ${filePath} was rejected because it would remove ${Math.round((1 - newLen / origLen) * 100)}% of the file content (${origLen} → ${newLen} chars). This looks like model truncation, not an intentional edit. Use search_replace for targeted changes instead of rewriting the entire file.`;
    }

    if (isNetChange) {
      accumulatedChanges.push({
        fileId: matchedFile?.fileId ?? '',
        fileName: filePath ?? '',
        originalContent,
        proposedContent: newContent ?? '',
        reasoning: reasoning ?? '',
        agentType: 'project_manager',
      });
    }

    // Read-after-write: update in-memory state (only if not destructive)
    if (matchedFile) {
      matchedFile.content = newContent ?? '';
      preloadedMap.set(filePath, matchedFile);
      if (matchedFile.fileId) preloadedMap.set(matchedFile.fileId, matchedFile);
      if (matchedFile.path && matchedFile.path !== filePath) {
        preloadedMap.set(matchedFile.path, matchedFile);
      }
    }

    if (!isNetChange) {
      return `NET ZERO: propose_code_edit for ${filePath} produced no change — the file already contains the proposed content. Do NOT retry the same edit. Either the change was already applied, or you need a different approach. Summarize what you attempted and respond to the user.`;
    }
    const lineCount = (newContent ?? '').split('\n').length;
    return `Full rewrite applied to ${filePath} (${lineCount} lines). The file is updated in your context.`;
  }

  if (event.name === 'search_replace') {
    const filePath = event.input?.filePath as string;
    const oldText = event.input?.old_text as string;
    const newText = event.input?.new_text as string;
    const reasoning = event.input?.reasoning as string;
    const matchedFile = resolveFileFn?.(filePath) ?? preloadedMap.get(filePath);
    const currentContent = matchedFile?.content ?? '';
    const replaceIdx = currentContent.indexOf(oldText);
    const proposedContent =
      replaceIdx !== -1
        ? currentContent.slice(0, replaceIdx) +
          newText +
          currentContent.slice(replaceIdx + oldText.length)
        : currentContent;

    const isNetChange = replaceIdx !== -1 && proposedContent !== currentContent;
    if (isNetChange) {
      accumulatedChanges.push({
        fileId: matchedFile?.fileId ?? '',
        fileName: filePath ?? '',
        originalContent: currentContent,
        proposedContent,
        reasoning: reasoning ?? '',
        agentType: 'project_manager',
      });
    }

    // Read-after-write: update in-memory state
    if (matchedFile && replaceIdx !== -1) {
      matchedFile.content = proposedContent;
      preloadedMap.set(filePath, matchedFile);
      if (matchedFile.fileId) preloadedMap.set(matchedFile.fileId, matchedFile);
      if (matchedFile.path && matchedFile.path !== filePath) {
        preloadedMap.set(matchedFile.path, matchedFile);
      }
    }

    if (replaceIdx === -1) {
      return `MATCH FAILED: old_text was not found in ${filePath}. Re-read the file to get current content, then retry with the exact text. Do NOT guess.`;
    }
    if (!isNetChange) {
      return `NET ZERO: search_replace for ${filePath} produced no change — old_text and new_text are identical. Do NOT retry. Summarize what you attempted and respond to the user.`;
    }

    const oldLines = (oldText ?? '').split('\n').length;
    const newLines = (newText ?? '').split('\n').length;
    if (replaceIdx !== -1) {
      return `Edit applied to ${filePath}: replaced ${oldLines} line(s) with ${newLines} line(s). The file is updated in your context.`;
    }
    return `Edit failed for ${filePath}: old_text not found in the current file content. Re-read the file with read_file to see its current content before retrying.`;
  }

  if (event.name === 'create_file') {
    const newFileName = (event.input?.fileName as string) ?? '';
    const newFileContent = (event.input?.content as string) ?? '';

    accumulatedChanges.push({
      fileId: `new_${newFileName}`,
      fileName: newFileName,
      originalContent: '',
      proposedContent: newFileContent,
      reasoning: (event.input?.reasoning as string) ?? '',
      agentType: 'project_manager',
    });

    // Read-after-write: add new file so read_file can find it
    const newFileCtx: FileContext = {
      fileId: `new_${newFileName}`,
      fileName: newFileName,
      fileType: newFileName.endsWith('.liquid')
        ? 'liquid'
        : newFileName.endsWith('.js')
          ? 'javascript'
          : newFileName.endsWith('.css')
            ? 'css'
            : 'other',
      content: newFileContent,
      path: newFileName,
    };
    files.push(newFileCtx);
    preloadedMap.set(newFileName, newFileCtx);
    preloadedMap.set(newFileCtx.fileId, newFileCtx);

    const createLines = newFileContent.split('\n').length;
    return `File ${newFileName} created (${createLines} lines). Available via read_file.`;
  }

  if (event.name === 'write_file') {
    const filePath =
      (event.input?.filePath as string) ?? (event.input?.fileName as string) ?? '';
    const newContent =
      (event.input?.content as string) ?? (event.input?.newContent as string) ?? '';
    const matchedFile = files.find(f => f.fileName === filePath || f.path === filePath);

    const previousContent = matchedFile?.content ?? '';
    if (newContent !== previousContent) {
      accumulatedChanges.push({
        fileId: matchedFile?.fileId ?? '',
        fileName: filePath,
        originalContent: previousContent,
        proposedContent: newContent,
        reasoning: (event.input?.reasoning as string) ?? '',
        agentType: 'project_manager',
      });
    }

    if (matchedFile) {
      matchedFile.content = newContent;
      preloadedMap.set(filePath, matchedFile);
      if (matchedFile.fileId) preloadedMap.set(matchedFile.fileId, matchedFile);
      if (matchedFile.path && matchedFile.path !== filePath) {
        preloadedMap.set(matchedFile.path, matchedFile);
      }
    }

    const writeLines = newContent.split('\n').length;
    return `File ${filePath} written (${writeLines} lines). The file is updated in your context.`;
  }

  if (event.name === 'delete_file') {
    const filePath =
      (event.input?.filePath as string) ?? (event.input?.fileName as string) ?? '';
    const matchedFile = files.find(f => f.fileName === filePath || f.path === filePath);

    if (matchedFile) {
      preloadedMap.delete(filePath);
      if (matchedFile.fileId) preloadedMap.delete(matchedFile.fileId);
      if (matchedFile.fileName) preloadedMap.delete(matchedFile.fileName);
      if (matchedFile.path) preloadedMap.delete(matchedFile.path);
      const idx = files.indexOf(matchedFile);
      if (idx !== -1) files.splice(idx, 1);
    }

    return `File ${filePath} deleted.`;
  }

  if (event.name === 'rename_file') {
    const oldPath =
      (event.input?.oldPath as string) ?? (event.input?.filePath as string) ?? '';
    const newPath =
      (event.input?.newPath as string) ?? (event.input?.newName as string) ?? '';
    const matchedFile = files.find(f => f.fileName === oldPath || f.path === oldPath);

    if (matchedFile) {
      // Remove old keys
      preloadedMap.delete(oldPath);
      if (matchedFile.fileId) preloadedMap.delete(matchedFile.fileId);
      if (matchedFile.fileName) preloadedMap.delete(matchedFile.fileName);
      if (matchedFile.path) preloadedMap.delete(matchedFile.path);
      // Update file metadata
      matchedFile.fileName = newPath;
      matchedFile.path = newPath;
      // Re-add with new keys
      preloadedMap.set(newPath, matchedFile);
      if (matchedFile.fileId) preloadedMap.set(matchedFile.fileId, matchedFile);
    }

    return `File renamed from ${oldPath} to ${newPath}.`;
  }

  if (event.name === 'propose_plan') {
    return 'Plan proposed. Waiting for user review.';
  }

  if (event.name === 'ask_clarification') {
    return 'Clarification question sent. Waiting for user response.';
  }

  return `Tool ${event.name} call forwarded to client.`;
}

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
