import type {
  AgentType,
  AgentMessage,
  AgentContext,
  AgentTask,
  AgentResult,
  CodeChange,
  CodePatch,
  FileContext,
  UserPreference,
  ElementHint,
  ToolProgressEvent,
} from '@/lib/types/agent';
import {
  createExecution,
  updateExecutionStatus,
  addMessage,
  setAgentActive,
  setAgentCompleted,
  storeChanges,
  setReviewResult,
  persistExecution,
} from './execution-store';
import { ProjectManagerAgent } from './project-manager';
import { LiquidAgent } from './specialists/liquid';
import { JavaScriptAgent } from './specialists/javascript';
import { CSSAgent } from './specialists/css';
import { JSONAgent } from './specialists/json';
import { ReviewAgent } from './review';
import { isToolProvider, type AgentExecuteOptions, type AgentUsage } from './base';
import type { AIAction } from './model-router';
import { getProviderForModel, resolveModel } from './model-router';
import { getAIProvider } from '@/lib/ai/get-provider';
import {
  classifyRequest,
  escalateTier,
  TIER_ORDER,
  type RoutingTier,
  type ClassificationResult,
} from './classifier';
import {
  shouldRequirePlanModeFirst,
  buildPlanModeRequiredMessage,
  hasPlanApprovalSignal,
  buildMaximumEffortPolicyMessage,
} from './orchestration-policy';
import { AIProviderError } from '@/lib/ai/errors';
import { DependencyDetector, ContextCache, CodexContextPackager } from '@/lib/context';
import type { ProposedChange } from '@/lib/context/packager';
import type {
  FileContext as ContextFileContext,
  ProjectContext,
  FileDependency,
} from '@/lib/context/types';
import { DependencyGraphCache } from '@/lib/context/dependency-graph-cache';
import { SymbolGraphCache } from '@/lib/context/symbol-graph-cache';
import { DesignSystemContextProvider } from '@/lib/design-tokens/agent-integration';
import { generateFileGroups } from '@/lib/shopify/theme-grouping';
import { ContextEngine, getProjectContextEngine } from '@/lib/ai/context-engine';
import { validateChangeSet } from './validation/change-set-validator';
import { runDiagnostics, formatDiagnostics } from './tools/diagnostics-tool';
import { createTwoFilesPatch } from 'diff';
import { estimateTokens } from '@/lib/ai/token-counter';
import { getTieredBudget, getTierAgentBudget } from '@/lib/ai/request-budget';
import { budgetFiles } from './specialists/prompt-budget';
import {
  parseClarificationFromAnalysis,
  formatClarificationForPrompt,
  MAX_CLARIFICATION_ROUNDS,
} from './clarification';
import { verifyChanges } from './verification';
import { runThemeCheck } from './tools/theme-check';
import { buildThemePlanArtifact } from './theme-plan-artifact';
import { ensureCompletionResponseSections } from './completion-format-guard';
import { saveAfterPM, saveAfterSpecialist, saveAfterReview, clearCheckpoint } from './checkpoint';
import { compareSnapshots, type DOMSnapshot as VerifierDOMSnapshot, type PreviewVerificationResult } from './preview-verifier';
import type { LoadContentFn } from '@/lib/supabase/file-loader';
import type { AIMessage, AIToolCompletionResult, ToolStreamEvent, ToolStreamResult, ToolDefinition, ToolResult, ToolCall as AIToolCall } from '@/lib/ai/types';
import { AI_FEATURES } from '@/lib/ai/feature-flags';
import {
  PM_EXPLORATION_TOOLS,
  PROPOSE_CODE_EDIT_TOOL,
  SEARCH_REPLACE_TOOL,
  PROPOSE_PLAN_TOOL,
  CREATE_FILE_TOOL,
  ASK_CLARIFICATION_TOOL,
  NAVIGATE_PREVIEW_TOOL,
  AGENT_TOOLS,
  CHECK_LINT_TOOL,
} from './tools/definitions';
import { executeToolCall, type ToolExecutorContext } from './tools/tool-executor';
import {
  ASK_DIRECT_PROMPT,
  AGENT_BASE_PROMPT,
  AGENT_CODE_OVERLAY,
  AGENT_PLAN_OVERLAY,
  AGENT_DEBUG_OVERLAY,
} from './prompts';
import { enforceRequestBudget } from '@/lib/ai/request-budget';

// ── Cross-file context helpers (REQ-5) ────────────────────────────────

/** Module-level singletons so cache persists across requests within the same process. */
const contextCache = new ContextCache();
const dependencyDetector = new DependencyDetector();
const dependencyGraphCache = new DependencyGraphCache();
const symbolGraphCache = new SymbolGraphCache();
const designContextProvider = new DesignSystemContextProvider();
const DOM_CONTEXT_BUDGET = 10_000; // tokens

/**
 * Detect cross-file dependencies and format a human-readable summary.
 * Uses TTL-based caching to avoid recomputing on every request.
 * Fails gracefully — returns empty string on error so agent execution is never blocked.
 */
function toContextFiles(files: FileContext[]): ContextFileContext[] {
  return files.map((f) => ({
    fileId: f.fileId,
    fileName: f.fileName,
    fileType: f.fileType,
    content: f.content,
    sizeBytes: f.content.length,
    lastModified: new Date(),
    dependencies: { imports: [], exports: [], usedBy: [] },
  }));
}

async function getDependenciesForFiles(
  projectId: string,
  contextFiles: ContextFileContext[],
): Promise<FileDependency[]> {
  const { dependencies, cacheHit } = await dependencyGraphCache.getOrComputeIncremental(
    projectId,
    contextFiles,
    (file, allFiles) => dependencyDetector.detectDependenciesForFile(file, allFiles),
  );
  if (cacheHit) {
    console.log(`[AgentCoordinator] Dependency cache hit for project ${projectId}`);
  }
  return dependencies;
}

async function getSymbolMatchedFileNames(
  projectId: string,
  contextFiles: ContextFileContext[],
  userRequest: string,
): Promise<string[]> {
  const { graph } = await symbolGraphCache.getOrCompute(projectId, contextFiles);
  return symbolGraphCache.lookupFiles(graph, userRequest, 12);
}

async function buildDependencyContext(
  files: FileContext[],
  projectId: string,
): Promise<string> {
  try {
    const contextFiles = toContextFiles(files);
    const dependencies = await getDependenciesForFiles(projectId, contextFiles);

    // Cache the full ProjectContext for the TTL window
    const projectContext: ProjectContext = {
      projectId,
      files: contextFiles,
      dependencies,
      loadedAt: new Date(),
      totalSizeBytes: contextFiles.reduce((sum, f) => sum + f.sizeBytes, 0),
    };
    await contextCache.set(projectId, projectContext);

    return formatDependencies(dependencies, contextFiles);
  } catch (error) {
    console.warn('[AgentCoordinator] Failed to build dependency context:', error);
    return '';
  }
}

/**
 * B3: Format dependencies as structured cross-file relationship maps.
 * Groups by source file and categorises by dependency type for richer AI context.
 */
function formatDependencies(
  dependencies: FileDependency[],
  files: ContextFileContext[],
): string {
  if (dependencies.length === 0) return '';

  const nameMap = new Map(files.map((f) => [f.fileId, f.fileName]));
  const idByName = new Map(files.map((f) => [f.fileName, f.fileId]));

  // Group deps by source file
  const bySource = new Map<string, FileDependency[]>();
  for (const dep of dependencies) {
    const source = nameMap.get(dep.sourceFileId) ?? dep.sourceFileId;
    const existing = bySource.get(source) ?? [];
    existing.push(dep);
    bySource.set(source, existing);
  }

  // Build reverse lookup: which files reference a given target?
  const usedByMap = new Map<string, Set<string>>();
  for (const dep of dependencies) {
    const target = nameMap.get(dep.targetFileId) ?? dep.targetFileId;
    const source = nameMap.get(dep.sourceFileId) ?? dep.sourceFileId;
    if (!usedByMap.has(target)) usedByMap.set(target, new Set());
    usedByMap.get(target)!.add(source);
  }

  const sections: string[] = [];

  for (const [sourceFile, deps] of bySource) {
    const lines: string[] = [`## Cross-File Relationships for ${sourceFile}`];

    // Categorise outgoing dependencies
    const renders: string[] = [];
    const styledBy: string[] = [];
    const usedIn: string[] = [];
    const other: string[] = [];

    for (const dep of deps) {
      const target = nameMap.get(dep.targetFileId) ?? dep.targetFileId;
      const refs = dep.references.map((r) => r.symbol).join(', ');

      if (dep.dependencyType === 'liquid_include' || dep.dependencyType === 'snippet_variable') {
        renders.push(`${target} (passes: ${refs})`);
      } else if (dep.dependencyType === 'css_class' || dep.dependencyType === 'css_import' || dep.dependencyType === 'css_section') {
        styledBy.push(`${target} (classes: ${refs})`);
      } else if (dep.dependencyType === 'template_section' || dep.dependencyType === 'schema_setting') {
        usedIn.push(`${target} (${refs})`);
      } else {
        other.push(`${target} (${dep.dependencyType}): ${refs}`);
      }
    }

    if (renders.length > 0) lines.push(`Renders: ${renders.join(', ')}`);
    if (styledBy.length > 0) lines.push(`Styled by: ${styledBy.join(', ')}`);
    if (usedIn.length > 0) lines.push(`Used in: ${usedIn.join(', ')}`);
    if (other.length > 0) lines.push(`Related: ${other.join(', ')}`);

    // Schema settings from file metadata
    const sourceId = idByName.get(sourceFile);
    if (sourceId) {
      const sourceCtxFile = files.find((f) => f.fileId === sourceId);
      const schemaSettings = sourceCtxFile?.dependencies?.exports ?? [];
      if (schemaSettings.length > 0) {
        lines.push(`Schema settings: ${schemaSettings.join(', ')}`);
      }
    }

    // Reverse: who references this file?
    const referencedBy = usedByMap.get(sourceFile);
    lines.push(`Used by: ${referencedBy ? [...referencedBy].join(', ') : '(nothing references this file directly)'}`);

    sections.push(lines.join('\n'));
  }

  return sections.join('\n\n');
}

// ── Element-hint file matching helpers ──────────────────────────────────

/**
 * Convert a normalized section ID to file path patterns to search for.
 * Covers Liquid sections, JSON configs, and related CSS/JS assets.
 */
function sectionIdToPatterns(normalizedId: string): string[] {
  const name = normalizedId.replace(/_/g, '-');
  return [
    `sections/${name}.liquid`,
    `sections/${name}.json`,
    `assets/section-${name}.css`,
    `assets/${name}.css`,
    `assets/component-${name}.css`,
    `assets/section-${name}.js`,
    `assets/${name}.js`,
  ];
}

/**
 * Find file IDs matching an element hint's section and class metadata.
 * Checks both FileContext.path and FileContext.fileName for matches.
 * Returns empty array (graceful fallback) when nothing matches.
 * Exported for use in Ask mode file selection.
 */
export function findFilesFromElementHint(hint: ElementHint, files: FileContext[]): string[] {
  const ids: string[] = [];
  if (!hint.sectionId) return ids;

  const patterns = sectionIdToPatterns(hint.sectionId);

  // Add class-derived patterns (BEM base extraction)
  for (const cls of hint.cssClasses ?? []) {
    const base = cls.replace(/^t4s-/, '').split(/__|--/)[0];
    if (base.length >= 3) {
      patterns.push(`assets/${base}.css`, `assets/section-${base}.css`);
    }
  }

  for (const f of files) {
    const filePath = f.path ?? f.fileName;
    if (patterns.some(p => filePath === p || filePath.endsWith(`/${p}`))) {
      ids.push(f.fileId);
    }
  }
  return ids;
}

/**
 * Select files for the PM agent using ContextEngine with conversation-aware prioritization.
 * Used by both orchestrated and solo pipelines.
 *
 * Files arrive as STUBS (no content). This function:
 * 1. Indexes stubs for fuzzy matching (reference detection is skipped for stubs)
 * 2. Selects relevant file IDs via ContextEngine
 * 3. Uses elementHint for smart section/asset auto-selection (if provided)
 * 4. Hydrates selected files via loadContent
 * 5. Returns the hydrated selection + remaining stubs for manifest
 */
async function selectPMFiles(
  files: FileContext[],
  userRequest: string,
  projectId: string,
  options?: CoordinatorExecuteOptions,
): Promise<FileContext[]> {
  const contextEngine = getProjectContextEngine(projectId, 60_000);
  await contextEngine.indexFiles(files);

  const openTabIds = options?.openTabs ?? [];
  const loadContent = options?.loadContent;
  const elementHint = options?.elementHint;
  const tier: RoutingTier = options?.tier ?? 'COMPLEX';

  // Tier-aware file budget
  const tieredBudget = getTieredBudget(tier);
  const fileBudget = tieredBudget.files;

  // Skip element hint reserve for TRIVIAL (reserve > budget)
  const elementReserve = tier === 'TRIVIAL' ? 0 : (elementHint?.sectionId ? 10_000 : 0);
  const normalBudget = fileBudget - elementReserve;

  const pmSelection = contextEngine.selectRelevantFiles(
    userRequest,
    options?.recentMessages ?? [],
    options?.activeFilePath,
    normalBudget,
  );

  // Graph-first retrieval: use cached symbol graph to pull likely targets.
  const symbolMatchedIds: string[] = [];
  try {
    const symbolMatches = await getSymbolMatchedFileNames(projectId, toContextFiles(files), userRequest);
    for (const fileName of symbolMatches) {
      const match = files.find((f) => f.fileName === fileName || f.path === fileName);
      if (match) symbolMatchedIds.push(match.fileId);
    }
  } catch {
    // Best-effort only.
  }

  // Element-driven file selection: auto-load section + related CSS/JS
  const elementFileIds = elementHint
    ? findFilesFromElementHint(elementHint, files)
    : [];

  // Resolve snippet dependencies for element files (e.g., {% render 'icon-account' %})
  const elementWithDeps = elementFileIds.length > 0
    ? contextEngine.resolveWithDependencies(elementFileIds)
    : [];

  // Phase 3b: Resolve explicit file paths to IDs (highest priority)
  const explicitFileIds = (options?.explicitFiles ?? [])
    .map((path) => files.find((f) => f.path === path || f.path === '/' + path)?.fileId)
    .filter((id): id is string => !!id);

  // Merge: explicit files (user-pinned) > element files > open tabs > ContextEngine selection
  const pmSelectedIds = new Set([
    ...explicitFileIds,
    ...elementWithDeps,
    ...elementFileIds,
    ...openTabIds,
    ...symbolMatchedIds,
    ...pmSelection.files.map((f: FileContext) => f.fileId),
  ]);

  const score = new Map<string, number>();
  for (const id of pmSelection.files.map((f) => f.fileId)) score.set(id, (score.get(id) ?? 0) + 10);
  for (const id of symbolMatchedIds) score.set(id, (score.get(id) ?? 0) + 20);
  for (const id of openTabIds) score.set(id, (score.get(id) ?? 0) + 30);
  for (const id of elementWithDeps) score.set(id, (score.get(id) ?? 0) + 40);
  for (const id of elementFileIds) score.set(id, (score.get(id) ?? 0) + 45);
  for (const id of explicitFileIds) score.set(id, (score.get(id) ?? 0) + 55);

  if (elementFileIds.length > 0) {
    console.log(`[selectPMFiles] element hint matched ${elementFileIds.length} file(s), ${elementWithDeps.length} with deps`);
  }

  // Tier-aware fallback count: TRIVIAL gets top 3 files, SIMPLE 8, COMPLEX+ 15
  const fallbackCount = tier === 'TRIVIAL' ? 3 : tier === 'SIMPLE' ? 8 : 15;

  // Fallback: if nothing matched, pick a reasonable default set
  if (pmSelectedIds.size === 0) {
    // Use file names from the index (no content needed for selection)
    const indexedFiles = contextEngine.getFileIndex();
    const sorted = [...indexedFiles].sort((a, b) => b.sizeBytes - a.sizeBytes);
    for (const f of sorted.slice(0, fallbackCount)) {
      pmSelectedIds.add(f.fileId);
    }
  }

  const maxSelectedCount = tier === 'TRIVIAL' ? 6 : tier === 'SIMPLE' ? 14 : 24;
  const selectedIds = [...pmSelectedIds]
    .sort((a, b) => (score.get(b) ?? 0) - (score.get(a) ?? 0))
    .slice(0, maxSelectedCount);

  console.log(`[selectPMFiles] tier=${tier}, selected=${pmSelectedIds.size}, excluded=${files.length - pmSelectedIds.size}, total=${files.length}, budget=${fileBudget}`);

  // Hydrate selected files via loadContent (if available)
  if (loadContent && selectedIds.length > 0) {
    const hydratedFiles = await loadContent(selectedIds);
    const hydratedMap = new Map(hydratedFiles.map(f => [f.fileId, f]));

    const selectedSet = new Set(selectedIds);
    const result = files.map(f => selectedSet.has(f.fileId) ? (hydratedMap.get(f.fileId) ?? f) : f);
    const hydratedTokens = hydratedFiles.reduce((s, f) => s + estimateTokens(f.content), 0);
    console.log(`[selectPMFiles] hydrated ${hydratedFiles.length} files, ~${hydratedTokens} tokens`);
    return result;
  }

  // Fallback without loadContent: keep existing content for selected, stub others
  const selectedSet = new Set(selectedIds);
  return files.map(f =>
    selectedSet.has(f.fileId)
      ? f
      : { ...f, content: `[${f.content.length} chars — content excluded, see manifest]` }
  );
}

// ── Signal-based file context (Cursor-like architecture) ─────────────────

export interface SignalContext {
  /** Files with full content pre-loaded into the system prompt. */
  preloaded: FileContext[];
  /** Compact manifest of all other files (name, type, size) for tool-based loading. */
  manifest: string;
  /** All files (for tool executor context). */
  allFiles: FileContext[];
}

// ── Stream fallback helpers ─────────────────────────────────────────

/** Timeout (ms) for the first byte of a streamWithTools() response. 0 = disabled. */
function getStreamFirstByteTimeout(): number {
  return Number(process.env.STREAM_FIRST_BYTE_TIMEOUT_MS ?? 30_000);
}

/**
 * Persistent stream health flag: once streaming fails in this process,
 * skip the 30s race for subsequent requests until the TTL expires.
 * Prevents paying the timeout penalty on every request.
 */
const STREAM_HEALTH_TTL_MS = 5 * 60 * 1000; // 5 minutes
let streamHealthBroken = false;
let streamHealthBrokenAt = 0;

function isStreamingBroken(): boolean {
  if (!streamHealthBroken) return false;
  if (Date.now() - streamHealthBrokenAt > STREAM_HEALTH_TTL_MS) {
    streamHealthBroken = false;
    streamHealthBrokenAt = 0;
    console.log('[StreamHealth] TTL expired — will retry streaming');
    return false;
  }
  return true;
}

function markStreamingBroken(): void {
  streamHealthBroken = true;
  streamHealthBrokenAt = Date.now();
  console.warn('[StreamHealth] Streaming marked broken (TTL=5m)');
}

/**
 * Race streamWithTools() against a first-byte timeout. If no ToolStreamEvent
 * arrives within `timeoutMs`, abort and return null so the caller can fall back
 * to completeWithTools().
 */
async function raceFirstByte(
  streamResult: ToolStreamResult,
  timeoutMs: number,
): Promise<ToolStreamResult | null> {
  if (timeoutMs <= 0) return streamResult; // disabled

  const reader = streamResult.stream.getReader();
  let firstEvent: ToolStreamEvent | null = null;

  const readPromise = reader.read().then(({ done, value }) => {
    if (done) return null;
    return value ?? null;
  });

  const timeoutPromise = new Promise<'timeout'>((resolve) =>
    setTimeout(() => resolve('timeout'), timeoutMs),
  );

  const winner = await Promise.race([readPromise, timeoutPromise]);

  if (winner === 'timeout') {
    try { reader.cancel(); } catch { /* ignore */ }
    reader.releaseLock();
    return null;
  }

  firstEvent = winner as ToolStreamEvent | null;
  reader.releaseLock();

  if (!firstEvent) return streamResult; // stream closed immediately (empty)

  // Build a new stream that emits the first event, then pipes the rest
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
      } catch (err) {
        controller.error(err);
      } finally {
        innerReader.releaseLock();
        controller.close();
      }
    },
  });

  return {
    stream: prependedStream,
    getUsage: streamResult.getUsage,
    getStopReason: streamResult.getStopReason,
    getRawContentBlocks: streamResult.getRawContentBlocks,
  };
}

/**
 * Convert a completeWithTools() batch result into a synthetic ToolStreamResult.
 * This lets the agent loop consume the result identically to a real stream.
 */
function synthesizeToolStream(
  result: AIToolCompletionResult & { __rawContentBlocks?: unknown[] },
): ToolStreamResult {
  const events: ToolStreamEvent[] = [];

  // Emit text content as chunked text_delta events (~100 chars each)
  if (result.content) {
    const CHUNK_SIZE = 100;
    for (let i = 0; i < result.content.length; i += CHUNK_SIZE) {
      events.push({ type: 'text_delta', text: result.content.slice(i, i + CHUNK_SIZE) });
    }
  }

  // Emit tool calls as tool_start + tool_end pairs
  if (result.toolCalls) {
    for (const tc of result.toolCalls) {
      events.push({ type: 'tool_start', id: tc.id, name: tc.name });
      events.push({ type: 'tool_end', id: tc.id, name: tc.name, input: tc.input });
    }
  }

  const stream = new ReadableStream<ToolStreamEvent>({
    start(controller) {
      for (const e of events) controller.enqueue(e);
      controller.close();
    },
  });

  const stopReason = result.stopReason ?? 'end_turn';
  const rawBlocks = result.__rawContentBlocks ?? [];
  const usage = { inputTokens: result.inputTokens ?? 0, outputTokens: result.outputTokens ?? 0 };

  return {
    stream,
    getUsage: async () => usage,
    getStopReason: async () => stopReason,
    getRawContentBlocks: async () => rawBlocks,
  };
}

/**
 * Build signal-based file context for the streaming agent loop.
 * Pre-loads only high-confidence files (active, pinned, open tabs, element hint + deps).
 * Everything else goes into a compact manifest the LLM can search/read via tools.
 */
/**
 * Compress tool results from old iterations to save tokens.
 * Keeps the last `keepRecent` iterations' tool results intact;
 * older results are truncated to a short summary line.
 */
function compressOldToolResults(messages: AIMessage[], keepRecent: number = 2): void {
  // Walk backwards to find tool-result messages; keep the last `keepRecent` fresh
  let recentToolMsgCount = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as unknown as Record<string, unknown>;
    if (!msg.__toolResults) continue;
    recentToolMsgCount++;
    if (recentToolMsgCount <= keepRecent) continue;

    // Old iteration — compress each tool result's content
    const results = msg.__toolResults as Array<{ type: string; tool_use_id: string; content: string; is_error?: boolean }>;
    for (const result of results) {
      if (!result.content || result.content.length <= 200) continue;
      const firstLine = result.content.split('\n')[0].slice(0, 120);
      const lineCount = result.content.split('\n').length;
      result.content = `${firstLine}... [${lineCount} lines, ${result.content.length} chars — re-call tool for full output]`;
    }
  }
}

/**
 * Truncate large files for pre-loading to save tokens.
 * Keeps head (80 lines), optional cursor region (+/- 30 lines), and tail (30 lines).
 * Files under MAX_PRELOAD_LINES are returned unchanged.
 */
const MAX_PRELOAD_LINES = 200;

function truncateForPreload(content: string, cursorLine?: number): string {
  const lines = content.split('\n');
  if (lines.length <= MAX_PRELOAD_LINES) return content;

  const HEAD = 80;
  const TAIL = 30;
  const CURSOR_RADIUS = 30;
  const head = lines.slice(0, HEAD);
  const tail = lines.slice(-TAIL);

  if (cursorLine && cursorLine > HEAD && cursorLine < lines.length - TAIL) {
    const cursorStart = Math.max(HEAD, cursorLine - CURSOR_RADIUS);
    const cursorEnd = Math.min(lines.length - TAIL, cursorLine + CURSOR_RADIUS);
    const cursorSection = lines.slice(cursorStart, cursorEnd);
    const omitted1 = cursorStart - HEAD;
    const omitted2 = (lines.length - TAIL) - cursorEnd;
    return [
      ...head,
      `\n[... ${omitted1} lines omitted — use read_file for full content ...]\n`,
      ...cursorSection,
      `\n[... ${omitted2} lines omitted ...]\n`,
      ...tail,
    ].join('\n');
  }

  const omitted = lines.length - HEAD - TAIL;
  return [
    ...head,
    `\n[... ${omitted} lines omitted — use read_file for full content ...]\n`,
    ...tail,
  ].join('\n');
}

export async function buildSignalContext(
  files: FileContext[],
  options?: CoordinatorExecuteOptions & { projectId?: string },
): Promise<SignalContext> {
  const contextEngine = options?.projectId
    ? getProjectContextEngine(options.projectId, 60_000)
    : new ContextEngine(60_000);
  const preloadIds = new Set<string>();

  // Signal 1: Active file (highest priority)
  if (options?.activeFilePath) {
    const active = files.find(
      f => f.path === options.activeFilePath || f.fileName === options.activeFilePath
    );
    if (active) preloadIds.add(active.fileId);
  }

  // Signal 2: Explicit/pinned files (user-dragged into chat)
  for (const path of options?.explicitFiles ?? []) {
    const match = files.find(f => f.path === path || f.path === '/' + path || f.fileName === path);
    if (match) preloadIds.add(match.fileId);
  }

  // Signal 3: Open editor tabs
  for (const tabId of options?.openTabs ?? []) {
    preloadIds.add(tabId);
  }

  // Signal 4: Element hint files (preview selection)
  if (options?.elementHint) {
    const elementIds = findFilesFromElementHint(options.elementHint, files);
    for (const id of elementIds) preloadIds.add(id);
  }

  // Signal 5: Resolve direct dependencies for all signal files
  if (preloadIds.size > 0) {
    await contextEngine.indexFiles(files);
    const withDeps = contextEngine.resolveWithDependencies([...preloadIds]);
    for (const depId of withDeps) preloadIds.add(depId);
  }

  // Cap at 8 pre-loaded files to keep initial context manageable
  const MAX_PRELOAD = 8;
  const preloadArray = [...preloadIds].slice(0, MAX_PRELOAD);

  // Hydrate pre-loaded files via loadContent
  let preloaded: FileContext[];
  if (options?.loadContent && preloadArray.length > 0) {
    const hydrated = await options.loadContent(preloadArray);
    const hydratedMap = new Map(hydrated.map(f => [f.fileId, f]));
    preloaded = preloadArray
      .map(id => hydratedMap.get(id) ?? files.find(f => f.fileId === id))
      .filter((f): f is FileContext => !!f);
  } else {
    preloaded = preloadArray
      .map(id => files.find(f => f.fileId === id))
      .filter((f): f is FileContext => !!f);
  }

  // Truncate large pre-loaded files to save tokens (agent can read_file for full content)
  const activeFilePath = options?.activeFilePath;
  for (const f of preloaded) {
    if (f.content) {
      // If this is the active file, try to preserve cursor region (no cursor line available here)
      f.content = truncateForPreload(f.content, f.path === activeFilePath ? undefined : undefined);
    }
  }

  // Build compact manifest for remaining files
  const preloadSet = new Set(preloaded.map(f => f.fileId));
  const manifestFiles = files.filter(f => !preloadSet.has(f.fileId));
  const manifestLines = manifestFiles
    .sort((a, b) => a.fileName.localeCompare(b.fileName))
    .map(f => {
      // Parse actual size from stub format "[N chars]" instead of using stub string length
      const stubMatch = f.content?.match(/^\[(\d+)\s+chars\]$/);
      const sizeBytes = stubMatch ? parseInt(stubMatch[1], 10) : (f.content?.length ?? 0);
      const size = `${(sizeBytes / 1024).toFixed(1)}KB`;
      return `- ${f.fileName} (${f.fileType}, ${size})`;
    });

  const manifest = [
    `## Theme Files (${files.length} total, ${preloaded.length} pre-loaded)`,
    '',
    ...manifestLines,
    '',
    'Use `read_file` to load any file. Use `grep_content` to search across all files.',
  ].join('\n');

  return { preloaded, manifest, allFiles: files };
}

// ── p0 Architectural Principles ──────────────────────────────────────────

/**
 * File Context Rule: Reject code changes to files that aren't loaded in context.
 * This prevents agents from hallucinating changes to files they haven't seen.
 * The optional `readFiles` set allows dynamically read files (via read_file tool) to also pass.
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

/** Format changes for the review agent using patches or unified diffs. */
function formatChangesForReview(change: CodeChange): string {
  if (change.patches && change.patches.length > 0) {
    return [
      `## ${change.fileName}`,
      `Reasoning: ${change.reasoning}`,
      ...change.patches.map((p: CodePatch, i: number) =>
        `### Patch ${i + 1}\n<<<SEARCH>>>\n${p.search}\n<<<REPLACE>>>\n${p.replace}`
      ),
    ].join('\n');
  }
  // Fallback: generate unified diff for full-file changes
  return generateUnifiedDiff(change);
}

/** Generate a unified diff between original and proposed content. */
function generateUnifiedDiff(change: CodeChange): string {
  return createTwoFilesPatch(
    change.fileName, change.fileName,
    change.originalContent, change.proposedContent,
    'original', 'proposed',
    { context: 3 },
  );
}

/**
 * Scope Assessment Gate: Check if the PM flagged the request as needing clarification.
 */
function checkNeedsClarification(pmResult: AgentResult): boolean {
  if (!pmResult.analysis) return false;

  try {
    const jsonMatch = pmResult.analysis.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.needsClarification === true;
    }
  } catch {
    // Not JSON, check for the flag in the raw text
  }

  return pmResult.analysis.toLowerCase().includes('needsclarification');
}

// ── Thinking Events (real-time progress) ────────────────────────────────

export interface ThinkingEvent {
  type: 'thinking' | 'diagnostics' | 'worker_progress';
  phase?: 'analyzing' | 'planning' | 'executing' | 'reviewing' | 'validating' | 'fixing' | 'change_ready' | 'clarification' | 'budget_warning' | 'reasoning' | 'complete';
  label?: string;
  detail?: string;
  agent?: string;
  analysis?: string;
  summary?: string;
  /** Granular sub-phase within the rail phase (e.g. 'analyzing_files', 'specialist_liquid'). */
  subPhase?: import('@/lib/agents/phase-mapping').SubPhase;
  metadata?: Record<string, unknown>;
  /** Diagnostics event fields (type: 'diagnostics') */
  file?: string;
  errorCount?: number;
  warningCount?: number;
  severity?: string;
  message?: string;
  category?: string;
  /** Worker progress event fields (type: 'worker_progress') */
  workerId?: string;
  status?: 'running' | 'complete' | 'error';
}

export type ProgressCallback = (event: ThinkingEvent) => void;

// ── Coordinator Options ─────────────────────────────────────────────────

export interface CoordinatorExecuteOptions {
  /** Source chat session to bind execution records to. */
  sessionId?: string;
  /** The primary AI action being performed. */
  action?: AIAction;
  /** User's preferred model override (from useAgentSettings). */
  model?: string;
  /** @deprecated Use subagentMode instead. */
  mode?: 'orchestrated' | 'solo';
  /** Subagent dispatch mode: 'specialist' uses domain agents (Liquid/CSS/JS/JSON), 'general' uses general-purpose subagents. */
  subagentMode?: 'specialist' | 'general';
  /** DOM context from preview bridge. */
  domContext?: string;
  /** Developer memory context (formatted string). */
  memoryContext?: string;
  /** Liquid diagnostic context from buildDiagnosticContext (formatted string). */
  diagnosticContext?: string;
  /** Real-time progress callback for thinking events. */
  onProgress?: ProgressCallback;
  /** If true, return after PM analysis without delegating to specialists. */
  planOnly?: boolean;
  /** Intent mode from the UI — shapes agent behavior (preference, not capability gate). */
  intentMode?: 'code' | 'ask' | 'plan' | 'debug';
  /** Active file path from the editor. */
  activeFilePath?: string;
  /** Open tab file IDs for priority context selection. */
  openTabs?: string[];
  /** Recent conversation messages for context-aware file selection. */
  recentMessages?: string[];
  /**
   * Content hydrator: given file IDs, returns FileContexts with real content.
   * Files parameter to execute() should contain stubs only; use this to
   * selectively load content for specific files on-demand.
   */
  loadContent?: LoadContentFn;
  /** Element hint from preview selection for smart file auto-selection. */
  elementHint?: ElementHint;
  /** Pre-classified routing tier (skips classifier if set). */
  tier?: RoutingTier;
  /** If true, auto-classify the request complexity. Defaults to true. */
  autoRoute?: boolean;
  /** Current clarification round (EPIC V4). 0 = no prior clarification. */
  clarificationRound?: number;
  /** Prior clarification Q&A pairs for multi-round dialogue (EPIC V4). */
  clarificationHistory?: Array<{ question: string; answer: string }>;
  /** EPIC V3: Before DOM snapshot for preview verification (captured at request start). */
  beforeDOMSnapshot?: VerifierDOMSnapshot;
  /** EPIC V3: Callback to capture the current DOM snapshot after changes are applied. */
  captureAfterSnapshot?: () => Promise<VerifierDOMSnapshot | null>;
  /** Phase 3b: Explicit file paths dragged into the chat by the user. These override auto-selection. */
  explicitFiles?: string[];
  /** Phase 8a: Maximum number of specialist agents to run in parallel. */
  maxAgents?: number;
  /**
   * When provided, LLM output is streamed token-by-token via this callback.
   * Each call includes the agent name and the text chunk.
   */
  onReasoningChunk?: (agent: string, chunk: string) => void;
  /** Stream content tokens directly to the client (for conversational fast paths like Ask mode). */
  onContentChunk?: (chunk: string) => void;
  /** Stream tool lifecycle events to the client (tool_start, tool_call with results). */
  onToolEvent?: (event: AgentToolEvent) => void;
  /** True when the user is referencing proposed changes from a prior turn. Bypasses plan-first policy. */
  isReferentialCodePrompt?: boolean;
}

/** Tool event emitted from the streaming agent loop to the client via SSE. */
export interface AgentToolEvent {
  type: 'tool_start' | 'tool_call' | 'tool_progress';
  name: string;
  id?: string;
  toolCallId?: string;
  input?: Record<string, unknown>;
  /** Included for server-executed tools (the LLM used the result; client renders a card). */
  result?: unknown;
  /** True if the tool execution failed. */
  isError?: boolean;
  progress?: ToolProgressEvent['progress'];
}

// ── Usage tracking types ────────────────────────────────────────────────

export interface AgentUsageEntry {
  agentType: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface ExecutionUsage {
  totalInputTokens: number;
  totalOutputTokens: number;
  perAgent: AgentUsageEntry[];
}

/**
 * Message queue coordinator for multi-agent orchestration.
 * Routes messages between agents, manages execution lifecycle,
 * and handles parallel specialist execution.
 *
 * EPIC 1a Architectural Principles (p0):
 * - File Context Rule: reject changes to files not in context
 * - Scope Assessment Gate: PM returns needsClarification for broad requests
 * - Verification First-Class: review agent mandatory in orchestrated mode
 * - Parallel over Sequential: Promise.all for context loading
 * - Testing Always First: "Verify this works" chip after code_change
 */
export class AgentCoordinator {
  private pm: ProjectManagerAgent;
  private specialists: Record<string, LiquidAgent | JavaScriptAgent | CSSAgent | JSONAgent>;
  private reviewer: ReviewAgent;
  /** Pool of PM instances for general subagent mode. Lazily initialized. */
  private generalSubagents: ProjectManagerAgent[] = [];
  /** Maps fileName -> general subagent index for re-invocation during verification/diagnostics. */
  private subagentAssignments = new Map<string, number>();

  constructor() {
    this.pm = new ProjectManagerAgent();

    // EPIC C: Try registry first, fall back to hardcoded specialists
    let registrySpecialists: Record<string, LiquidAgent | JavaScriptAgent | CSSAgent | JSONAgent> | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic require for optional registry
      const { getAgentRegistry } = require('./registry');
      const registry = getAgentRegistry();
      const allAgents = registry.getEnabled();
      if (allAgents.length >= 4) {
        registrySpecialists = {} as Record<string, LiquidAgent | JavaScriptAgent | CSSAgent | JSONAgent>;
        for (const meta of allAgents) {
          registrySpecialists[meta.type] = meta.factory() as LiquidAgent | JavaScriptAgent | CSSAgent | JSONAgent;
        }
      }
    } catch {
      // Registry not available -- use hardcoded fallback
    }

    this.specialists = registrySpecialists ?? {
      liquid: new LiquidAgent(),
      javascript: new JavaScriptAgent(),
      css: new CSSAgent(),
      json: new JSONAgent(),
    };
    this.reviewer = new ReviewAgent();
  }

  /**
   * Initialize the general subagent pool for Cursor-style parallel execution.
   * Each subagent is a PM instance that uses the general subagent prompt.
   */
  private initGeneralSubagents(count: number): void {
    this.generalSubagents = [];
    this.subagentAssignments.clear();
    for (let i = 0; i < count; i++) {
      this.generalSubagents.push(new ProjectManagerAgent());
    }
  }

  /**
   * Resolve the agent responsible for a file change, supporting both specialist
   * and general subagent modes. Used for verification and diagnostics re-invocation.
   */
  private resolveAgentForChange(change: { agentType: string; fileName: string }): {
    agent: { execute: (task: AgentTask, opts?: AgentExecuteOptions) => Promise<AgentResult> };
    id: string;
    isGeneral: boolean;
  } | null {
    if (change.agentType.startsWith('general')) {
      const idx = this.subagentAssignments.get(change.fileName);
      if (idx !== undefined && this.generalSubagents[idx]) {
        return { agent: this.generalSubagents[idx], id: `general_${idx + 1}`, isGeneral: true };
      }
      return this.generalSubagents[0] ? { agent: this.generalSubagents[0], id: 'general_1', isGeneral: true } : null;
    }
    const specialist = this.specialists[change.agentType];
    return specialist ? { agent: specialist, id: change.agentType, isGeneral: false } : null;
  }

  /**
   * Execute a fix task using the correct prompt for the agent type.
   * General subagents use executeDirectPrompt with the general subagent system prompt;
   * specialists use the standard execute() method.
   */
  private async executeFixTask(
    resolved: { agent: { execute: (task: AgentTask, opts?: AgentExecuteOptions) => Promise<AgentResult> }; id: string; isGeneral: boolean },
    task: AgentTask,
    options: AgentExecuteOptions,
  ): Promise<AgentResult> {
    if (resolved.isGeneral) {
      const pmInstance = resolved.agent as ProjectManagerAgent;
      const prompt = pmInstance.formatGeneralSubagentPrompt(task);
      const systemPrompt = pmInstance.getGeneralSubagentSystemPrompt();
      const raw = await pmInstance.executeDirectPrompt(prompt, systemPrompt, options);
      const result = pmInstance.parseResponse(raw, task);
      if (result.changes) {
        for (const c of result.changes) {
          c.agentType = resolved.id as AgentType;
        }
      }
      result.agentType = resolved.id as AgentType;
      return result;
    }
    return resolved.agent.execute(task, options);
  }

  /**
   * Run the PM exploration phase: the PM uses read-only tools (read_file,
   * search_files, grep_content, check_lint) to gather additional context
   * before making its JSON decision. Returns a context string with tool
   * results that gets injected into the PM's decision prompt.
   *
   * Feature-gated by AI_FEATURES.pmExplorationTools.
   */
  private async runPMExploration(
    files: FileContext[],
    userRequest: string,
    options: {
      projectId: string;
      userId: string;
      loadContent?: LoadContentFn;
      onProgress?: (event: ThinkingEvent) => void;
      onReasoningChunk?: (agent: string, chunk: string) => void;
      model?: string;
      tier?: RoutingTier;
      action?: AIAction;
    },
  ): Promise<{ explorationContext: string; usedTools: boolean }> {
    console.log('[PM-Exploration] Feature flag:', AI_FEATURES.pmExplorationTools);
    if (!AI_FEATURES.pmExplorationTools) {
      console.log('[PM-Exploration] Skipped — feature flag disabled');
      return { explorationContext: '', usedTools: false };
    }

    console.log('[PM-Exploration] Starting — files:', files.length, 'request:', userRequest.slice(0, 80));
    const EXPLORATION_TIMEOUT_MS = 30_000;
    const MAX_EXPLORATION_ITERATIONS = 5;

    const toolCtx: ToolExecutorContext = {
      files,
      contextEngine: getProjectContextEngine(options.projectId, 60_000),
      projectId: options.projectId,
      userId: options.userId,
      loadContent: options.loadContent,
    };

    const explorationPrompt = [
      `You are a Shopify theme expert. The user wants: "${userRequest}"`,
      '',
      'Before making any decisions, explore the codebase to understand the current state.',
      'Use tools to read files, search for patterns, and check syntax as needed.',
      'When you have gathered enough context, respond with a summary of what you found.',
      '',
      'Available files in context:',
      files.slice(0, 30).map(f => `- ${f.fileName} (${f.fileType})`).join('\n'),
      files.length > 30 ? `... and ${files.length - 30} more files` : '',
    ].join('\n');

    const explorationSystemPrompt = [
      'You are in exploration mode. Your ONLY job is to gather context.',
      'Use the provided tools to read files and search the codebase.',
      'Do NOT propose any code changes. Just explore and summarize.',
      'Be efficient — only read files that are directly relevant.',
      'When done, provide a concise summary of your findings.',
    ].join('\n');

    options.onProgress?.({
      type: 'thinking',
      phase: 'analyzing',
      subPhase: 'exploring',
      label: 'Exploring codebase',
      detail: 'Reading relevant files before making decisions',
    });

    const toolResults: string[] = [];
    let usedTools = false;

    try {
      const model = resolveModel({
        action: options.action,
        userOverride: options.model,
        agentRole: 'project_manager',
        tier: options.tier,
      });
      const providerName = getProviderForModel(model);
      const provider = getAIProvider(providerName as Parameters<typeof getAIProvider>[0]);

      if (!isToolProvider(provider)) {
        console.log('[PM-Exploration] Provider does not support tools, skipping');
        return { explorationContext: '', usedTools: false };
      }

      console.log('[PM-Exploration] Using model:', model, 'provider:', providerName);

      const messages: AIMessage[] = [
        { role: 'system', content: explorationSystemPrompt },
        { role: 'user', content: explorationPrompt },
      ];

      const timeoutAt = Date.now() + EXPLORATION_TIMEOUT_MS;

      for (let i = 0; i < MAX_EXPLORATION_ITERATIONS; i++) {
        if (Date.now() > timeoutAt) {
          console.log('[PM-Exploration] Timeout reached at iteration', i);
          toolResults.push('[Exploration timeout — proceeding with gathered context]');
          break;
        }

        const result = await provider.completeWithTools(
          messages,
          PM_EXPLORATION_TOOLS,
          { model, maxTokens: 2048 },
        );

        console.log('[PM-Exploration] Iteration', i, '— stopReason:', result.stopReason, 'toolCalls:', result.toolCalls?.length ?? 0);

        if (result.stopReason === 'end_turn' || !result.toolCalls?.length) {
          if (result.content) {
            console.log('[PM-Exploration] Final summary received (%d chars)', result.content.length);
            toolResults.push(result.content);
          }
          break;
        }

        usedTools = true;

        for (const tc of result.toolCalls) {
          console.log('[PM-Exploration] Tool call:', tc.name, JSON.stringify(tc.input).slice(0, 120));
          options.onProgress?.({
            type: 'thinking',
            phase: 'analyzing',
            subPhase: 'exploring',
            label: `Exploring: ${tc.name}`,
            detail: tc.name === 'read_file'
              ? `Reading ${String(tc.input.fileId ?? '')}`
              : tc.name === 'grep_content'
                ? `Searching for "${String(tc.input.pattern ?? '')}"`
                : tc.name === 'check_lint'
                  ? `Checking ${String(tc.input.fileName ?? '')}`
                  : String(tc.input.query ?? tc.input.fileId ?? ''),
          });

          options.onReasoningChunk?.('project_manager', `\n[tool: ${tc.name}] `);

          const toolResult = await Promise.resolve(executeToolCall(tc, toolCtx));
          const truncatedContent = toolResult.content.length > 8000
            ? toolResult.content.slice(0, 8000) + `\n\n... [truncated — showing 8000 of ${toolResult.content.length} chars]`
            : toolResult.content;
          toolResults.push(`[${tc.name}] ${truncatedContent}`);
        }

        // Append assistant + tool results for next iteration
        messages.push({
          role: 'assistant',
          content: result.content || '',
          __toolCalls: (result as AIToolCompletionResult & { __rawContentBlocks?: unknown }).__rawContentBlocks,
        } as AIMessage & { __toolCalls: unknown });

        messages.push({
          role: 'user',
          content: '',
          __toolResults: result.toolCalls.map((tc, idx) => ({
            type: 'tool_result',
            tool_use_id: tc.id,
            content: toolResults[toolResults.length - result.toolCalls!.length + idx] ?? '',
            is_error: false,
          })),
        } as AIMessage & { __toolResults: unknown });
      }
    } catch (err) {
      console.warn('[Coordinator] PM exploration failed, proceeding without:', err);
      options.onProgress?.({
        type: 'thinking',
        phase: 'analyzing',
        subPhase: 'exploring',
        label: 'Exploration skipped',
        detail: 'Proceeding with pre-loaded context',
      });
      return { explorationContext: '', usedTools: false };
    }

    if (toolResults.length === 0) {
      console.log('[PM-Exploration] No results gathered, skipping injection');
      return { explorationContext: '', usedTools: false };
    }

    const explorationContext = [
      '## Exploration Results',
      'The following information was gathered by exploring the codebase:',
      '',
      ...toolResults,
    ].join('\n');

    console.log('[PM-Exploration] Done — usedTools:', usedTools, 'results:', toolResults.length, 'contextLen:', explorationContext.length);

    options.onProgress?.({
      type: 'thinking',
      phase: 'analyzing',
      subPhase: 'exploring',
      label: usedTools ? 'Exploration complete' : 'Context gathered',
      detail: `Gathered ${toolResults.length} piece(s) of additional context`,
    });

    return { explorationContext, usedTools };
  }

  /**
   * Collect token usage from every agent that participated in the last execution.
   * Call this after execute() or executeSolo() completes.
   * Returns accumulated totals + per-agent breakdown.
   */
  getAccumulatedUsage(): ExecutionUsage {
    const entries: AgentUsageEntry[] = [];

    const collect = (agentType: string, usage: AgentUsage | null) => {
      if (!usage) return;
      entries.push({
        agentType,
        provider: getProviderForModel(usage.model),
        model: usage.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      });
    };

    collect('project_manager', this.pm.getLastUsage());

    for (const [name, agent] of Object.entries(this.specialists)) {
      collect(name, agent.getLastUsage());
    }

    for (let i = 0; i < this.generalSubagents.length; i++) {
      collect(`general_${i + 1}`, this.generalSubagents[i].getLastUsage());
    }

    collect('review', this.reviewer.getLastUsage());

    return {
      totalInputTokens: entries.reduce((s, e) => s + e.inputTokens, 0),
      totalOutputTokens: entries.reduce((s, e) => s + e.outputTokens, 0),
      perAgent: entries,
    };
  }

  /**
   * Execute a full multi-agent workflow:
   * 1. PM analyzes request and creates delegations
   * 2. Scope Assessment Gate: check if PM needs clarification
   * 3. Specialists execute in parallel
   * 4. File Context Rule: filter out changes to files not in context
   * 5. Verification First-Class: review agent validates all changes
   * 6. Persist execution and return result
   */
  async execute(
    executionId: string,
    projectId: string,
    userId: string,
    userRequest: string,
    files: FileContext[],
    userPreferences: UserPreference[],
    options?: CoordinatorExecuteOptions,
  ): Promise<AgentResult> {
    // Top-level coordinator timeout (120s) -- ensures we never hang
    const COORDINATOR_TIMEOUT_MS = 120_000;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new AIProviderError(
        'TIMEOUT',
        `Coordinator execution timed out after ${COORDINATOR_TIMEOUT_MS / 1000}s`,
        'coordinator'
      )), COORDINATOR_TIMEOUT_MS)
    );

    try {
      return await Promise.race([
        this._executeInner(executionId, projectId, userId, userRequest, files, userPreferences, options),
        timeoutPromise,
      ]);
    } catch (error) {
      updateExecutionStatus(executionId, 'failed');
      await persistExecution(executionId);

      const isProviderErr = error instanceof AIProviderError;
      return {
        agentType: 'project_manager',
        success: false,
        error: {
          code: isProviderErr ? error.code : 'EXECUTION_FAILED',
          message: isProviderErr ? error.userMessage : String(error),
          agentType: 'project_manager',
          recoverable: isProviderErr ? error.retryable : false,
        },
      };
    }
  }

  private async _executeInner(
    executionId: string,
    projectId: string,
    userId: string,
    userRequest: string,
    files: FileContext[],
    userPreferences: UserPreference[],
    options?: CoordinatorExecuteOptions,
  ): Promise<AgentResult> {
    createExecution(executionId, projectId, userId, userRequest, options?.sessionId);
    updateExecutionStatus(executionId, 'in_progress');

    const onProgress = options?.onProgress;

    // ── Smart Routing: classify request complexity ────────────────────
    const autoRoute = options?.autoRoute !== false;
    let currentTier: RoutingTier = options?.tier ?? 'COMPLEX';
    let classification: ClassificationResult | undefined;

    if (autoRoute && !options?.tier) {
      classification = await classifyRequest(userRequest, files.length, {
        lastMessageSummary: options?.recentMessages?.slice(-1)[0],
        recentDelegationCount: undefined,
      });
      currentTier = classification.tier;
    }

    // Emit routing tier event
    const tierModelName = currentTier === 'TRIVIAL' ? 'Haiku'
      : currentTier === 'SIMPLE' ? 'Sonnet'
      : currentTier === 'ARCHITECTURAL' ? 'Sonnet 4 1M'
      : 'Opus';
    onProgress?.({
      type: 'thinking',
      phase: 'analyzing',
      subPhase: 'building_context',
      label: `${currentTier} request — using ${tierModelName}`,
      detail: userRequest.slice(0, 120),
      metadata: {
        routingTier: currentTier,
        model: tierModelName,
        classifierConfidence: classification?.confidence,
        classifierSource: classification?.source,
      },
    });

    // For TRIVIAL/SIMPLE tiers without specialists, redirect to solo mode.
    // NOTE: executeSolo calls createExecution again, which resets the Map entry.
    // This is fine — the progress event above was already flushed to the SSE stream.
    if (currentTier === 'TRIVIAL' || currentTier === 'SIMPLE') {
      return this.executeSolo(executionId, projectId, userId, userRequest, files, userPreferences, {
        ...options,
        tier: currentTier,
        autoRoute: false, // prevent re-classification
      });
    }

    const onReasoning = options?.onReasoningChunk;
    const agentOptions: AgentExecuteOptions = {
      action: 'analyze' as AIAction,
      model: options?.model,
      tier: currentTier,
      onReasoningChunk: onReasoning ? (chunk: string) => onReasoning('project_manager', chunk) : undefined,
    };

    // ── Parallel context building (p0: Parallel over Sequential) ──────
    // Build all context layers simultaneously instead of sequentially.
    // NOTE: buildDependencyContext and buildFileGroupContext need files with real content
    // for accurate reference detection. We hydrate PM-selected files first.
    const pmFiles = await selectPMFiles(files, userRequest, projectId, { ...options, tier: currentTier });
    const hydratedForDeps = pmFiles.filter(f => !f.content.startsWith('['));
    const [dependencyContext, designContext, fileGroupContext] = await Promise.all([
      buildDependencyContext(hydratedForDeps, projectId),
      buildDesignContext(projectId),
      buildFileGroupContext(hydratedForDeps),
    ]);

    // Trim domContext to token budget using iterative tiktoken trimming
    let trimmedDomContext = options?.domContext;
    if (trimmedDomContext) {
      let domTokens = estimateTokens(trimmedDomContext);
      while (domTokens > DOM_CONTEXT_BUDGET && trimmedDomContext.length > 100) {
        trimmedDomContext = trimmedDomContext.slice(0, Math.floor(trimmedDomContext.length * 0.9));
        domTokens = estimateTokens(trimmedDomContext);
      }
    }

    const context: AgentContext = {
      executionId,
      projectId,
      userId,
      userRequest,
      files: pmFiles,
      userPreferences,
      dependencyContext: (dependencyContext + fileGroupContext) || undefined,
      designContext: designContext || undefined,
      domContext: trimmedDomContext || undefined,
      memoryContext: options?.memoryContext || undefined,
      diagnosticContext: options?.diagnosticContext || undefined,
    };

    try {
      // ── PM Exploration Phase (feature-gated) ─────────────────────────
      const { explorationContext: orchExplorationCtx, usedTools: orchPmUsedTools } =
        await this.runPMExploration(pmFiles, userRequest, {
          projectId,
          userId,
          loadContent: options?.loadContent,
          onProgress,
          onReasoningChunk: options?.onReasoningChunk,
          model: options?.model,
          tier: currentTier,
          action: 'analyze' as AIAction,
        });

      // Step 1: Project Manager analyzes and delegates
      onProgress?.({
        type: 'thinking',
        phase: 'analyzing',
        subPhase: 'analyzing_files',
        label: 'Reviewing your request',
        detail: userRequest.slice(0, 120),
      });

      setAgentActive(executionId, 'project_manager');

      // EPIC V4: If we have prior clarification history, enrich the user request
      let enrichedRequest = userRequest;
      if (options?.clarificationHistory && options.clarificationHistory.length > 0) {
        enrichedRequest = formatClarificationForPrompt(
          userRequest,
          options.clarificationHistory.map((h) => ({
            request: { question: h.question, allowFreeform: true, context: '', round: 0 },
            response: { value: h.answer, isFreeform: true },
          })),
        );
      }

      // Inject exploration results into the PM prompt if available
      if (orchExplorationCtx) {
        enrichedRequest = `${enrichedRequest}\n\n${orchExplorationCtx}`;
      }

      const pmTask: AgentTask = {
        executionId,
        instruction: enrichedRequest,
        context: {
          ...context,
          userRequest: enrichedRequest,
        },
      };

      this.logMessage(executionId, 'coordinator', 'project_manager', 'task', {
        instruction: enrichedRequest,
      });

      const pmResult = await this.pm.execute(pmTask, {
        ...agentOptions,
        action: 'analyze',
      });
      setAgentCompleted(executionId, 'project_manager');

      // ── PM self-assessment tier escalation ──────────────────────────
      // If PM reports a higher tier than the classifier assigned, escalate
      if (pmResult.selfAssessedTier && TIER_ORDER[pmResult.selfAssessedTier as RoutingTier] > TIER_ORDER[currentTier]) {
        const newTier = pmResult.selfAssessedTier as RoutingTier;
        onProgress?.({
          type: 'thinking',
          phase: 'analyzing',
          subPhase: 'reasoning',
          label: `Upgrading to ${newTier} analysis`,
          detail: 'PM assessed higher complexity than initial classification',
          metadata: { routingTier: newTier, tierUpgrade: true, fromTier: currentTier },
        });
        currentTier = newTier;
      }

      // Apply PM's direct changes (hybrid output) before running specialists
      let allChanges: CodeChange[] = [];
      if (pmResult.changes?.length) {
        allChanges.push(...pmResult.changes);
      }

      // Per-agent token logging for observability
      const pmPromptTokens = estimateTokens(this.pm.formatPrompt(pmTask));
      console.log(`[Coordinator] PM prompt: ~${pmPromptTokens} tokens (budget: 80k)`);

      // Emit budget_warning if PM prompt is suspiciously large
      if (pmPromptTokens > 70_000) {
        onProgress?.({
          type: 'thinking',
          phase: 'budget_warning',
          label: 'Context was trimmed to fit within token limits',
          detail: `PM prompt used ~${pmPromptTokens} tokens`,
        });
      }

      this.logMessage(executionId, 'project_manager', 'coordinator', 'result', {
        instruction: pmResult.analysis,
      });

      onProgress?.({
        type: 'thinking',
        phase: 'planning',
        subPhase: 'creating_delegations',
        label: 'Planning changes',
        analysis: pmResult.analysis,
        detail: pmResult.delegations?.length
          ? `Delegating to ${pmResult.delegations.length} specialist(s)`
          : 'Analyzing results',
        summary: pmResult.delegations?.length
          ? `Delegated to ${pmResult.delegations.map(d => d.agent).join(' + ')}`
          : undefined,
      });

      // ── p0: Scope Assessment Gate (enhanced with EPIC V4 multi-round) ──
      // If PM signals the request is too broad/ambiguous, return early
      // with needsClarification so the frontend can prompt the user.
      // Supports up to MAX_CLARIFICATION_ROUNDS rounds of structured dialogue.
      const currentRound = options?.clarificationRound ?? 0;
      if (checkNeedsClarification(pmResult) && currentRound < MAX_CLARIFICATION_ROUNDS) {
        // Extract structured options for the ClarificationCard UI
        const clarificationOptions = this.extractClarificationOptions(pmResult);
        const questions = this.extractClarificationQuestions(pmResult);

        // EPIC V4: Also parse structured ClarificationRequests from analysis
        const structuredClarifications = parseClarificationFromAnalysis(pmResult.analysis ?? '');
        const nextRound = currentRound + 1;
        const isFirstRound = nextRound === 1;

        // Emit clarification request via SSE so the frontend shows a prompt
        onProgress?.({
          type: 'thinking',
          phase: 'clarification',
          label: isFirstRound ? 'Need more information' : 'Follow-up clarification',
          detail: pmResult.analysis ?? 'Could you provide more details about your request?',
          metadata: {
            questions,
            options: clarificationOptions,
            structuredClarifications,
            clarificationRound: nextRound,
            maxRounds: MAX_CLARIFICATION_ROUNDS,
          },
        });

        updateExecutionStatus(executionId, 'completed');
        await persistExecution(executionId);
        return {
          agentType: 'project_manager',
          success: true,
          analysis: pmResult.analysis,
          needsClarification: true,
        };
      }

      // ── Plan-only mode: return after PM analysis (no specialists) ────
      if (options?.planOnly) {
        onProgress?.({
          type: 'thinking',
          phase: 'complete',
          subPhase: 'finalizing',
          label: 'Analysis complete',
          summary: pmResult.delegations?.length
            ? `Plan: ${pmResult.delegations.length} delegation${pmResult.delegations.length !== 1 ? 's' : ''}`
            : 'Analysis complete',
        });
        updateExecutionStatus(executionId, 'completed');
        await persistExecution(executionId);
        return {
          agentType: 'project_manager',
          success: true,
          analysis: pmResult.analysis,
          delegations: pmResult.delegations,
        };
      }

      // If PM handled everything directly (changes but no delegations), return early with changes
      if (pmResult.success && allChanges.length > 0 && !pmResult.delegations?.length) {
        storeChanges(executionId, 'project_manager', allChanges);
        onProgress?.({
          type: 'thinking',
          phase: 'complete',
          subPhase: 'finalizing',
          label: 'Changes ready',
          summary: `${allChanges.length} file${allChanges.length !== 1 ? 's' : ''} changed directly`,
          metadata: { routingTier: currentTier, directChanges: allChanges.length },
        });
        updateExecutionStatus(executionId, 'awaiting_approval');
        return {
          ...pmResult,
          changes: allChanges,
        };
      }

      if (!pmResult.success || !pmResult.delegations?.length) {
        updateExecutionStatus(executionId, 'failed');
        await persistExecution(executionId);
        return pmResult;
      }

      await saveAfterPM(executionId, pmResult.delegations, pmResult.changes);

      // Collect all affected file names from delegations for specialist context
      const affectedFileNames = (pmResult.delegations ?? []).flatMap(d => d.affectedFiles);
      const affectedFileIds = files
        .filter(f => affectedFileNames.includes(f.fileName))
        .map(f => f.fileId);

      // Expand with dependencies (using stub index — reference detection skipped for stubs)
      const expandedIds = getProjectContextEngine(projectId, 60_000).resolveWithDependencies(affectedFileIds);

      // Hydrate specialist files via loadContent (bounded to expanded set only)
      const loadContent = options?.loadContent;
      const specialistHydratedFiles = loadContent
        ? await loadContent([...new Set([...affectedFileIds, ...expandedIds])])
        : files.filter(f => expandedIds.includes(f.fileId) || affectedFileIds.includes(f.fileId));

      // Step 2: Specialists execute in dependency-ordered waves
      //
      // Build a file-conflict graph: delegations that share `affectedFiles`
      // must not run in the same wave to avoid conflicting edits.
      // Independent delegations run concurrently in the same wave.

      const delegations = pmResult.delegations;

      // Build conflict adjacency: delegation indices that share files
      const fileOwners = new Map<string, number[]>(); // fileName -> delegation indices
      for (let i = 0; i < delegations.length; i++) {
        for (const fileName of delegations[i].affectedFiles) {
          const owners = fileOwners.get(fileName) ?? [];
          owners.push(i);
          fileOwners.set(fileName, owners);
        }
      }

      // Build adjacency set for each delegation (conflicting peers)
      const conflicts = new Map<number, Set<number>>();
      for (const owners of fileOwners.values()) {
        if (owners.length <= 1) continue;
        for (const a of owners) {
          for (const b of owners) {
            if (a === b) continue;
            if (!conflicts.has(a)) conflicts.set(a, new Set());
            if (!conflicts.has(b)) conflicts.set(b, new Set());
            conflicts.get(a)!.add(b);
            conflicts.get(b)!.add(a);
          }
        }
      }

      // Greedy wave assignment (graph coloring): assign each delegation
      // to the earliest wave where it has no conflicts.
      const waveOf = new Array<number>(delegations.length).fill(-1);
      let maxWave = 0;
      for (let i = 0; i < delegations.length; i++) {
        const peerWaves = new Set<number>();
        for (const peer of conflicts.get(i) ?? []) {
          if (waveOf[peer] >= 0) peerWaves.add(waveOf[peer]);
        }
        let wave = 0;
        while (peerWaves.has(wave)) wave++;
        waveOf[i] = wave;
        if (wave > maxWave) maxWave = wave;
      }

      // Group delegations into waves
      const waves: number[][] = [];
      for (let w = 0; w <= maxWave; w++) {
        const wave = waveOf.reduce<number[]>((acc, wv, idx) => {
          if (wv === w) acc.push(idx);
          return acc;
        }, []);
        if (wave.length > 0) waves.push(wave);
      }

      // Determine subagent mode for this execution
      const useGeneralSubagents = options?.subagentMode === 'general';

      // Initialize general subagent pool if needed
      if (useGeneralSubagents) {
        this.initGeneralSubagents(options?.maxAgents ?? delegations.length);
      }

      // Execute wave helper: runs a single delegation
      const executeDelegation = async (delegation: typeof delegations[0], delegationIndex: number) => {
        // Resolve which agent handles this delegation
        const isGeneral = useGeneralSubagents || delegation.agent === 'general';
        const subagentIdx = isGeneral ? (delegationIndex % this.generalSubagents.length) : -1;
        const agentId = (isGeneral ? `general_${subagentIdx + 1}` : delegation.agent) as AgentType;
        const agent = isGeneral
          ? this.generalSubagents[subagentIdx]
          : this.specialists[delegation.agent];
        if (!agent) return null;

        // Track assignment for re-invocation during verification/diagnostics
        if (isGeneral) {
          for (const f of delegation.affectedFiles) {
            this.subagentAssignments.set(f, subagentIdx);
          }
        }

        const agentLabel = isGeneral ? `Subagent ${subagentIdx + 1}` : `${delegation.agent} agent`;

        onProgress?.({
          type: 'thinking',
          phase: 'executing',
          subPhase: (isGeneral ? 'general_subagent' : `specialist_${delegation.agent}`) as import('@/lib/agents/phase-mapping').SubPhase,
          label: agentLabel,
          detail: delegation.task.slice(0, 120),
          agent: agentId,
          metadata: {
            agentType: agentId,
            affectedFiles: delegation.affectedFiles,
          },
        });

        setAgentActive(executionId, agentId);

        this.logMessage(executionId, 'coordinator', agentId, 'task', {
          instruction: delegation.task,
        });

        // Build scoped context: hydrate only affected + dependency files
        const specialistBudget = getTierAgentBudget(currentTier, 'specialist');
        const specialistContextEngine = new ContextEngine(specialistBudget);
        await specialistContextEngine.indexFiles(specialistHydratedFiles);
        const specialistCtx = specialistContextEngine.selectRelevantFiles(
          delegation.task,
          [],
          delegation.affectedFiles[0],
        );

        const delegationFileIds = new Set(
          files.filter(f => delegation.affectedFiles.includes(f.fileName)).map(f => f.fileId)
        );
        const specialistFiles = specialistCtx.files.length > 0
          ? specialistCtx.files
          : (loadContent
            ? await loadContent([...delegationFileIds])
            : specialistHydratedFiles.filter(f => delegationFileIds.has(f.fileId)));

        const delegationTask: AgentTask = {
          executionId,
          instruction: delegation.task,
          context: {
            ...context,
            files: specialistFiles,
            // General subagents get the original user request for context awareness;
            // specialists get the delegation task as their scoped request.
            userRequest: isGeneral ? context.userRequest : delegation.task,
          },
        };

        let result: AgentResult;
        if (isGeneral) {
          // General subagent: use PM instance with general subagent prompt
          const pmInstance = agent as ProjectManagerAgent;
          const prompt = pmInstance.formatGeneralSubagentPrompt(delegationTask);
          const systemPrompt = pmInstance.getGeneralSubagentSystemPrompt();
          const raw = await pmInstance.executeDirectPrompt(prompt, systemPrompt, {
            ...agentOptions,
            action: 'generate',
            onReasoningChunk: onReasoning ? (chunk: string) => onReasoning(agentId, chunk) : undefined,
          });
          result = pmInstance.parseResponse(raw, delegationTask);
          // Tag result and changes with general agent type
          result.agentType = agentId;
          if (result.changes) {
            for (const c of result.changes) {
              c.agentType = agentId;
            }
          }
        } else {
          result = await agent.execute(delegationTask, {
            ...agentOptions,
            action: 'generate',
            onReasoningChunk: onReasoning ? (chunk: string) => onReasoning(agentId, chunk) : undefined,
          });
        }
        setAgentCompleted(executionId, agentId);
        await saveAfterSpecialist(executionId, agentId, result);
        console.log(`[Coordinator] ${agentId}: ${specialistFiles.length} files, ~${estimateTokens(JSON.stringify(delegationTask.context.files.map(f => f.content)).slice(0, 200_000))} tokens`);

        if (result.changes?.length) {
          storeChanges(executionId, agentId, result.changes);

          onProgress?.({
            type: 'thinking',
            phase: 'change_ready',
            subPhase: 'change_ready',
            label: `${agentLabel} completed`,
            detail: `${result.changes.length} change(s) ready for preview`,
            summary: `${result.changes.length} file${result.changes.length !== 1 ? 's' : ''} modified`,
            metadata: {
              agentType: agentId,
              changeCount: result.changes.length,
              affectedFiles: delegation.affectedFiles,
            },
          });
        }

        this.logMessage(executionId, agentId, 'coordinator', 'result', {
          changes: result.changes,
        });

        return result;
      };

      // Execute waves sequentially, specialists within each wave concurrently
      // Phase 8a: Respect maxAgents concurrency limit
      const maxConcurrent = options?.maxAgents ?? 4;
      const specialistResults: AgentResult[] = [];

      for (let waveIdx = 0; waveIdx < waves.length; waveIdx++) {
        const waveIndices = waves[waveIdx];
        const waveNames = waveIndices.map(i => {
          if (useGeneralSubagents || delegations[i].agent === 'general') {
            return `Subagent ${(i % (this.generalSubagents.length || 1)) + 1}`;
          }
          return delegations[i].agent;
        });

        if (waves.length > 1) {
          const waveAffectedFiles = waveIndices.flatMap(i => delegations[i].affectedFiles);
          const waveAgentTypes = waveIndices.map(i => {
            const isGen = useGeneralSubagents || delegations[i].agent === 'general';
            return isGen ? `general_${(i % (this.generalSubagents.length || 1)) + 1}` : delegations[i].agent;
          });
          onProgress?.({
            type: 'thinking',
            phase: 'executing',
            subPhase: 'coordinating_changes',
            label: `Wave ${waveIdx + 1}/${waves.length}: ${waveNames.join(' + ')} in parallel`,
            metadata: {
              affectedFiles: waveAffectedFiles,
              agentType: waveAgentTypes[0],
              agentTypes: waveAgentTypes,
            },
          });
        }

        // Chunk wave indices by maxAgents to enforce concurrency limit
        for (let chunkStart = 0; chunkStart < waveIndices.length; chunkStart += maxConcurrent) {
          const chunk = waveIndices.slice(chunkStart, chunkStart + maxConcurrent);

          // Emit worker_progress start for each agent in this chunk
          for (const idx of chunk) {
            const isGen = useGeneralSubagents || delegations[idx].agent === 'general';
            const wkId = isGen ? `general_${(idx % (this.generalSubagents.length || 1)) + 1}` : delegations[idx].agent;
            const wkLabel = isGen ? `Subagent ${(idx % (this.generalSubagents.length || 1)) + 1}` : delegations[idx].agent + ' specialist';
            onProgress?.({
              type: 'worker_progress',
              workerId: wkId,
              label: wkLabel,
              status: 'running',
              metadata: {
                agentType: wkId,
                affectedFiles: delegations[idx].affectedFiles,
              },
            } as ThinkingEvent);
          }

          const chunkResults = await Promise.all(
            chunk.map(i => executeDelegation(delegations[i], i))
          );

          // Emit worker_progress complete for each agent
          for (const idx of chunk) {
            const isGen = useGeneralSubagents || delegations[idx].agent === 'general';
            const wkId = isGen ? `general_${(idx % (this.generalSubagents.length || 1)) + 1}` : delegations[idx].agent;
            const wkLabel = isGen ? `Subagent ${(idx % (this.generalSubagents.length || 1)) + 1}` : delegations[idx].agent + ' specialist';
            onProgress?.({
              type: 'worker_progress',
              workerId: wkId,
              label: wkLabel,
              status: 'complete',
              metadata: {
                agentType: wkId,
                affectedFiles: delegations[idx].affectedFiles,
              },
            } as ThinkingEvent);
          }

          for (const r of chunkResults) {
            if (r !== null) specialistResults.push(r);
          }
        }
      }

      // ── C1: Inter-Agent Proposal Sharing ──────────────────────────────
      // Build a proposal summary so agents can see each other's changes
      const proposalSummary = this.buildProposalSummary(specialistResults);
      if (proposalSummary && specialistResults.length > 1) {
        const coordinatingFiles = specialistResults
          .flatMap(r => (r.changes ?? []).map(c => c.fileName))
          .filter(Boolean);
        onProgress?.({
          type: 'thinking',
          phase: 'executing',
          subPhase: 'coordinating_changes',
          label: 'Coordinating changes',
          detail: 'Cross-checking specialist proposals for consistency',
          metadata: {
            agentType: 'coordinator',
            affectedFiles: [...new Set(coordinatingFiles)],
          },
        });

        // Second-pass: Let agents see each other's proposals and adjust
        const refinementPromises = specialistResults
          .filter(r => r.changes && r.changes.length > 0)
          .map(async (result) => {
            const resolved = this.resolveAgentForChange({ agentType: result.agentType, fileName: result.changes?.[0]?.fileName ?? '' });
            if (!resolved) return null;

            // Build cross-context: what other agents proposed
            const otherProposals = specialistResults
              .filter(other => other.agentType !== result.agentType && other.changes?.length)
              .map(other => {
                const changes = (other.changes ?? []).map(c => `  - ${c.fileName}: ${c.reasoning}`).join('\n');
                return `${other.agentType} agent proposed:\n${changes}`;
              })
              .join('\n\n');

            if (!otherProposals) return null;

            // Budget the refinement context to prevent unbounded proposedContent
            const refinementFiles: FileContext[] = budgetFiles(
              (result.changes ?? []).map(c => ({
                fileId: c.fileId,
                fileName: c.fileName,
                fileType: c.fileName.endsWith('.liquid') ? 'liquid' as const : c.fileName.endsWith('.css') ? 'css' as const : c.fileName.endsWith('.js') ? 'javascript' as const : 'other' as const,
                content: c.proposedContent,
              })),
              35_000,
            );

            const refinementTask: AgentTask = {
              executionId,
              instruction: `Review your proposed changes in light of what other specialists are changing. Adjust if needed to ensure consistency.\n\nYour changes:\n${(result.changes ?? []).map(c => `- ${c.fileName}: ${c.reasoning}`).join('\n')}\n\nOther specialists' changes:\n${otherProposals}\n\nIf your changes are already consistent, return them unchanged. If adjustments are needed, return the corrected versions.`,
              context: {
                ...context,
                files: refinementFiles,
                userRequest: `Ensure consistency with other specialists' changes`,
              },
            };

            try {
              const refined = await this.executeFixTask(resolved, refinementTask, { ...agentOptions, action: 'fix' });
              return refined.success ? refined : null;
            } catch {
              return null; // Keep original on failure
            }
          });

        const refinements = (await Promise.all(refinementPromises)).filter(
          (r): r is AgentResult => r !== null
        );

        // Merge refinements into specialist results (replace originals if refined)
        for (const refined of refinements) {
          if (!refined.changes?.length) continue;
          const idx = specialistResults.findIndex(r => r.agentType === refined.agentType);
          if (idx >= 0) {
            specialistResults[idx] = refined;
          }
        }
      }

      // Collect all proposed changes (PM direct + specialist)
      const specialistChanges: CodeChange[] = specialistResults.flatMap(
        (r) => r.changes ?? []
      );
      // Merge PM direct changes (from hybrid output) with specialist changes
      // PM changes go first; specialists may override if they touch the same file
      allChanges.push(...specialistChanges);

      // ── p0: File Context Rule ──────────────────────────────────────
      // Reject changes to files not loaded in the current context.
      if (allChanges.length > 0) {
        const { allowed, rejected } = enforceFileContextRule(allChanges, files);
        if (rejected.length > 0) {
          console.warn(
            `[AgentCoordinator] File Context Rule rejected ${rejected.length} change(s) to files not in context:`,
            rejected.map((c) => c.fileName)
          );
        }
        allChanges = allowed;
      }

      if (allChanges.length === 0) {
        updateExecutionStatus(executionId, 'completed');
        await clearCheckpoint(executionId);
        await persistExecution(executionId);
        return {
          agentType: 'project_manager',
          success: true,
          changes: [],
          analysis: pmResult.analysis ?? 'No changes needed based on the analysis.',
        };
      }

      // ── EPIC V1: Agent Self-Verification Loop ────────────────────────
      // Validate proposed changes against Liquid syntax, types, schema,
      // and cross-file references. If errors are found, re-invoke the
      // responsible specialist with the diagnostic output (max 1 retry).
      if (allChanges.length > 0) {
        onProgress?.({
          type: 'thinking',
          phase: 'validating',
          subPhase: 'validating_syntax',
          label: 'Verifying changes (syntax, types, schema, references)...',
        });

        const verification = verifyChanges(allChanges, files);

        if (!verification.passed) {
          onProgress?.({
            type: 'thinking',
            phase: 'validating',
            subPhase: 'checking_consistency',
            label: `Found ${verification.errorCount} error(s), ${verification.warningCount} warning(s) — attempting self-correction`,
            detail: verification.formatted.slice(0, 300),
          });

          // Group verification issues by file for targeted re-invocation
          const issuesByFile = new Map<string, typeof verification.issues>();
          for (const issue of verification.issues.filter(i => i.severity === 'error')) {
            const existing = issuesByFile.get(issue.file) ?? [];
            existing.push(issue);
            issuesByFile.set(issue.file, existing);
          }

          // Re-invoke responsible agents with verification diagnostics
          const verifyFixPromises: Promise<AgentResult | null>[] = [];
          for (const [fileName, fileIssues] of issuesByFile) {
            const originalChange = allChanges.find(c => c.fileName === fileName);
            if (!originalChange) continue;
            const resolved = this.resolveAgentForChange(originalChange);
            if (!resolved) continue;

            const issueReport = fileIssues
              .map(i => `- [${i.category}] Line ${i.line}: ${i.message} (${i.severity})`)
              .join('\n');

            onProgress?.({
              type: 'thinking',
              phase: 'fixing',
              subPhase: 'fixing_errors',
              label: `Self-correcting ${fileName}...`,
              agent: originalChange.agentType,
            });

            const fixFileId = files.find(f => f.fileName === fileName)?.fileId;
            const fixContextFiles = fixFileId && loadContent
              ? await loadContent([fixFileId])
              : files.filter(f => f.fileName === fileName);

            const verifyFixTask: AgentTask = {
              executionId,
              instruction: [
                `Fix the following verification issues in ${fileName}:`,
                '',
                issueReport,
                '',
                'Current proposed code:',
                originalChange.proposedContent,
                '',
                'Return the corrected version of the file.',
              ].join('\n'),
              context: {
                ...context,
                files: fixContextFiles,
                userRequest: `Fix verification issues in ${fileName}`,
              },
            };

            verifyFixPromises.push(
              this.executeFixTask(resolved, verifyFixTask, { ...agentOptions, action: 'fix' }).catch(() => null)
            );
          }

          const verifyFixResults = (await Promise.all(verifyFixPromises)).filter(
            (r): r is AgentResult => r !== null && r.success
          );

          // Merge fixed changes back
          const fixedChanges = verifyFixResults.flatMap(r => r.changes ?? []);
          for (const fixed of fixedChanges) {
            const idx = allChanges.findIndex(c => c.fileName === fixed.fileName);
            if (idx >= 0) {
              allChanges[idx] = fixed;
            }
          }

          if (fixedChanges.length > 0) {
            onProgress?.({
              type: 'thinking',
              phase: 'validating',
              subPhase: 'validating_syntax',
              label: `Self-corrected ${fixedChanges.length} file(s)`,
              summary: `Fixed ${fixedChanges.length} file${fixedChanges.length !== 1 ? 's' : ''}`,
            });
          }
        } else {
          onProgress?.({
            type: 'thinking',
            phase: 'validating',
            subPhase: 'validating_syntax',
            label: 'Verification passed — no syntax, type, or schema errors',
            summary: 'All checks passed',
          });
        }
      }

      // ── Post-edit diagnostics gate ─────────────────────────────────────
      // Run unified diagnostics on all changed files and feed errors back
      // to specialists with full context (line numbers, suggestions).
      if (allChanges.length > 0) {
        onProgress?.({
          type: 'thinking',
          phase: 'validating',
          subPhase: 'validating_syntax',
          label: `Running diagnostics on ${allChanges.length} file(s)...`,
        });

        for (const change of allChanges) {
          const fileType = change.fileName.endsWith('.liquid') ? 'liquid'
            : change.fileName.endsWith('.css') ? 'css'
            : change.fileName.endsWith('.js') ? 'javascript' : 'other';
          const diagnostics = runDiagnostics(change.fileName, change.proposedContent, fileType);
          const errorCount = diagnostics.filter(d => d.severity === 'error').length;
          const warningCount = diagnostics.filter(d => d.severity === 'warning').length;

          // Emit diagnostics SSE event for the frontend
          if (diagnostics.length > 0) {
            onProgress?.({
              type: 'diagnostics',
              file: change.fileName,
              errorCount,
              warningCount,
            });
          }

          if (errorCount > 0) {
            onProgress?.({
              type: 'thinking',
              phase: 'validating',
              subPhase: 'checking_consistency',
              label: `Found ${errorCount} error(s), ${warningCount} warning(s) in ${change.fileName}`,
              detail: diagnostics
                .filter(d => d.severity === 'error')
                .map(e => `Line ${e.line}: ${e.message}`).join('; '),
            });

            const resolvedFix = this.resolveAgentForChange(change);
            if (resolvedFix) {
              onProgress?.({
                type: 'thinking',
                phase: 'fixing',
                subPhase: 'fixing_errors',
                label: `Fixing ${errorCount} error(s) in ${change.fileName}...`,
              });

              // Build a rich fix prompt with full diagnostic output
              const diagReport = formatDiagnostics(diagnostics);
              const fixTask: AgentTask = {
                executionId,
                instruction: [
                  `Fix the following diagnostics in ${change.fileName}:`,
                  '',
                  diagReport,
                  '',
                  'Proposed code with errors:',
                  change.proposedContent,
                ].join('\n'),
                context: {
                  ...context,
                  files: [{
                    fileId: change.fileId,
                    fileName: change.fileName,
                    fileType: fileType as 'liquid' | 'javascript' | 'css' | 'other',
                    content: change.originalContent,
                  } as FileContext],
                  userRequest: `Fix diagnostics in ${change.fileName}`,
                },
              };

              try {
                const fixResult = await this.executeFixTask(resolvedFix, fixTask, { ...agentOptions, action: 'fix' });
                if (fixResult.success && fixResult.changes?.[0]) {
                  change.proposedContent = fixResult.changes[0].proposedContent;
                } else {
                  onProgress?.({
                    type: 'thinking',
                    phase: 'validating',
                    label: `Issues remain after fix attempt in ${change.fileName}`,
                  });
                }
              } catch {
                onProgress?.({
                  type: 'thinking',
                  phase: 'validating',
                  label: `Issues remain after fix attempt in ${change.fileName}`,
                });
              }
            }
          }
        }
      }

      // ── C4: Cross-File Validation Gate ──────────────────────────────
      // Programmatic cross-file consistency check before review
      const validationResult = validateChangeSet(allChanges, files);
      let validationContext = '';
      if (validationResult.issues.length > 0) {
        const issueLines = validationResult.issues.map(
          (i) => `- [${i.severity}] ${i.file}: ${i.description} (${i.category})`
        );
        validationContext = `\n\n## Pre-Review Validation Issues\n${issueLines.join('\n')}`;
      }

      // ── p0: Verification First-Class (with fast-path for simple edits) ──
      // Skip review for simple edits: single file, <50 lines changed, no dangerous ops.
      const uniqueFilesChanged = new Set(allChanges.map(c => c.fileName)).size;
      const totalLinesChanged = allChanges.reduce((sum, c) => {
        return sum + Math.abs(
          (c.proposedContent ?? '').split('\n').length - (c.originalContent ?? '').split('\n').length
        );
      }, 0);
      const hasDangerousOps = allChanges.some(c =>
        !c.proposedContent || c.proposedContent.trim() === ''
      );
      const skipReview = uniqueFilesChanged <= 1
        && totalLinesChanged < 50
        && !hasDangerousOps
        && validationResult.issues.filter(i => i.severity === 'error').length === 0;

      let reviewResult: AgentResult;

      if (skipReview) {
        // Fast-path: skip review for simple edits
        onProgress?.({
          type: 'thinking',
          phase: 'reviewing',
          subPhase: 'running_review',
          label: 'Review skipped (simple edit)',
          detail: `${uniqueFilesChanged} file, ${totalLinesChanged} lines changed`,
        });
        reviewResult = {
          agentType: 'review',
          success: true,
          changes: [],
          reviewResult: {
            approved: true,
            summary: `Simple edit (${uniqueFilesChanged} file, ${totalLinesChanged} lines) — review skipped.`,
            issues: [],
          },
        };
        setAgentCompleted(executionId, 'review');
      } else {
        // Full review path
        onProgress?.({
          type: 'thinking',
          phase: 'reviewing',
          subPhase: 'running_review',
          label: 'Reviewing changes',
          detail: `Checking ${allChanges.length} proposed change(s)`,
        });

        setAgentActive(executionId, 'review');

        this.logMessage(executionId, 'coordinator', 'review', 'task', {
          instruction: 'Review all proposed changes',
          changes: allChanges,
        });

        // Build review context: hydrate only the changed files (bounded)
        const changedFileIds = files
          .filter(f => allChanges.some(c => c.fileName === f.fileName))
          .map(f => f.fileId);
        const reviewFiles = loadContent
          ? await loadContent(changedFileIds)
          : files.filter(f => changedFileIds.includes(f.fileId));

        // Use Codex packager for review (same packaging as GPT Codex workflow)
        const codexPackager = new CodexContextPackager();
        let projectContext: ProjectContext | null = await contextCache.get(projectId);
        if (!projectContext) {
          const contextFiles = toContextFiles(reviewFiles);
          const dependencies = await getDependenciesForFiles(projectId, contextFiles);
          projectContext = {
            projectId,
            files: contextFiles,
            dependencies,
            loadedAt: new Date(),
            totalSizeBytes: contextFiles.reduce((sum, f) => sum + f.sizeBytes, 0),
          };
        }
        const proposedChanges: ProposedChange[] = allChanges.map((c) => ({
          fileId: c.fileId,
          fileName: c.fileName,
          originalContent: c.originalContent,
          proposedContent: c.proposedContent ?? '',
          agentType: c.agentType,
        }));
        const codexReviewContent = codexPackager.packageForReview(projectContext, proposedChanges);

        const reviewTask: AgentTask = {
          executionId,
          instruction: `Review the following proposed changes for: ${userRequest}${validationContext}${proposalSummary ? `\n\n${proposalSummary}` : ''}\n\n${codexReviewContent}`,
          context: {
            ...context,
            files: reviewFiles,
            userRequest: allChanges.map(formatChangesForReview).join('\n\n'),
          },
        };

        reviewResult = await this.reviewer.execute(reviewTask, {
          ...agentOptions,
          action: 'review',
          onReasoningChunk: onReasoning ? (chunk: string) => onReasoning('review', chunk) : undefined,
        });
        setAgentCompleted(executionId, 'review');
        await saveAfterReview(executionId);
      }

      if (reviewResult.reviewResult) {
        setReviewResult(executionId, reviewResult.reviewResult);
      }

      this.logMessage(executionId, 'review', 'coordinator', 'result', {
        instruction: reviewResult.reviewResult?.summary,
      });

      // ── C3: Review-Triggered Refinement ──────────────────────────────
      // If review found critical errors, re-invoke responsible specialists (1 iteration max)
      if (reviewResult.reviewResult && !reviewResult.reviewResult.approved) {
        const criticalIssues = reviewResult.reviewResult.issues.filter(
          (i) => i.severity === 'error'
        );
        if (criticalIssues.length > 0) {
          const fixingFiles = [...new Set(criticalIssues.map(i => i.file).filter(Boolean))];
          onProgress?.({
            type: 'thinking',
            phase: 'executing',
            subPhase: 'fixing_errors',
            label: 'Fixing critical issues',
            detail: `${criticalIssues.length} critical issue(s) found`,
            metadata: {
              agentType: 'review',
              affectedFiles: fixingFiles,
            },
          });

          // Group issues by file to identify responsible specialists
          const issuesByFile = new Map<string, typeof criticalIssues>();
          for (const issue of criticalIssues) {
            const existing = issuesByFile.get(issue.file) || [];
            existing.push(issue);
            issuesByFile.set(issue.file, existing);
          }

          // Re-invoke responsible agents for files with critical issues
          const refinementPromises: Promise<AgentResult | null>[] = [];
          for (const [fileName, issues] of issuesByFile) {
            const originalChange = allChanges.find(c => c.fileName === fileName);
            if (!originalChange) continue;
            const resolvedAgent = this.resolveAgentForChange(originalChange);
            if (!resolvedAgent) continue;

            const issueDescriptions = issues.map(i =>
              `- [${i.severity}] ${i.description}${i.suggestion ? ` (Suggestion: ${i.suggestion})` : ''}`
            ).join('\n');

            // Hydrate only the specific file being refined (bounded)
            const refinementFileId = files.find(f => f.fileName === fileName)?.fileId;
            const refinementContextFiles = refinementFileId && loadContent
              ? await loadContent([refinementFileId])
              : files.filter(f => f.fileName === fileName);

            const refinementTask: AgentTask = {
              executionId,
              instruction: `Fix the following critical review issues in ${fileName}:\n${issueDescriptions}\n\nOriginal change reasoning: ${originalChange.reasoning}\n\nProvide the corrected version.`,
              context: {
                ...context,
                files: refinementContextFiles,
                userRequest: `Fix critical issues in ${fileName}`,
              },
            };

            refinementPromises.push(
              this.executeFixTask(resolvedAgent, refinementTask, { ...agentOptions, action: 'fix' }).catch(() => null)
            );
          }

          const refinementResults = (await Promise.all(refinementPromises)).filter(
            (r): r is AgentResult => r !== null && r.success
          );

          // Merge refinement changes (replace original changes for the same files)
          const refinedChanges = refinementResults.flatMap(r => r.changes ?? []);
          if (refinedChanges.length > 0) {
            for (const refined of refinedChanges) {
              const idx = allChanges.findIndex(c => c.fileName === refined.fileName);
              if (idx >= 0) {
                allChanges[idx] = refined;
              } else {
                allChanges.push(refined);
              }
            }
          }
        }
      }

      // ── EPIC V3: Preview Feedback Loop (opt-in for COMPLEX/ARCHITECTURAL) ──
      // If a before DOM snapshot and captureAfterSnapshot callback are provided,
      // compare before/after snapshots to detect structural regressions.
      // Only run for COMPLEX/ARCHITECTURAL tiers to avoid slowing down simple edits.
      let previewVerification: PreviewVerificationResult | undefined;
      if (
        (currentTier === 'COMPLEX' || currentTier === 'ARCHITECTURAL') &&
        options?.beforeDOMSnapshot &&
        options?.captureAfterSnapshot
      ) {
        try {
          onProgress?.({
            type: 'thinking',
            phase: 'validating',
            subPhase: 'checking_consistency',
            label: 'Checking preview for visual regressions...',
          });

          const afterSnapshot = await Promise.race([
            options.captureAfterSnapshot(),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 10_000)),
          ]);

          if (afterSnapshot) {
            previewVerification = compareSnapshots(
              options.beforeDOMSnapshot,
              afterSnapshot,
            );

            if (!previewVerification.passed) {
              onProgress?.({
                type: 'thinking',
                phase: 'validating',
                label: `Preview regressions detected: ${previewVerification.regressions.length} issue(s)`,
                detail: previewVerification.formatted.slice(0, 300),
                metadata: {
                  previewRegressions: previewVerification.regressions.map(r => ({
                    type: r.type,
                    severity: r.severity,
                    description: r.description,
                  })),
                },
              });
            } else {
              onProgress?.({
                type: 'thinking',
                phase: 'validating',
                label: 'Preview check passed — no structural regressions',
              });
            }
          }
        } catch {
          // Preview verification is best-effort; never block the pipeline
        }
      }

      // Step 4: Persist and return
      onProgress?.({
        type: 'thinking',
        phase: 'complete',
        subPhase: 'finalizing',
        label: 'Ready',
        summary: reviewResult.reviewResult?.summary ?? `${allChanges.length} file${allChanges.length !== 1 ? 's' : ''} changed`,
      });

      // Emit cost event for the UI
      const totalUsage = this.getAccumulatedUsage();
      if (totalUsage.totalInputTokens > 0) {
        onProgress?.({
          type: 'thinking',
          phase: 'complete',
          label: 'Done',
          metadata: {
            cost: {
              inputTokens: totalUsage.totalInputTokens,
              outputTokens: totalUsage.totalOutputTokens,
              perAgent: totalUsage.perAgent,
            },
          },
        });
      }

      await clearCheckpoint(executionId);

      if (allChanges.length > 0) {
        updateExecutionStatus(executionId, 'awaiting_approval');
      } else {
        updateExecutionStatus(executionId, 'completed');
        await persistExecution(executionId);
      }

      return {
        agentType: 'project_manager',
        success: true,
        changes: allChanges,
        reviewResult: reviewResult.reviewResult,
        analysis: pmResult.analysis,
        suggestVerification: allChanges.length > 0,
        pmUsedTools: orchPmUsedTools,
      };
    } catch (error) {
      updateExecutionStatus(executionId, 'failed');

      this.logMessage(executionId, 'coordinator', 'coordinator', 'error', {
        error: undefined,
        instruction: String(error),
      });

      await persistExecution(executionId);

      const isProviderErr = error instanceof AIProviderError;
      return {
        agentType: 'project_manager',
        success: false,
        error: {
          code: isProviderErr ? error.code : 'EXECUTION_FAILED',
          message: isProviderErr ? error.userMessage : String(error),
          agentType: 'project_manager',
          recoverable: isProviderErr ? error.retryable : false,
        },
      };
    }
  }

  /**
   * Execute in solo mode: PM generates code changes directly without
   * specialist delegation or review. Faster, simpler, best for
   * straightforward requests.
   */
  async executeSolo(
    executionId: string,
    projectId: string,
    userId: string,
    userRequest: string,
    files: FileContext[],
    userPreferences: UserPreference[],
    options?: CoordinatorExecuteOptions,
  ): Promise<AgentResult> {
    // ── Ask mode fast path: single conversational LLM call ──────────
    if (options?.intentMode === 'ask' && options?.onContentChunk) {
      return this.executeAskFastPath(executionId, projectId, userId, userRequest, files, userPreferences, options);
    }

    createExecution(executionId, projectId, userId, userRequest, options?.sessionId);
    updateExecutionStatus(executionId, 'in_progress');

    const onProgress = options?.onProgress;

    // ── Smart Routing: classify if not already classified ─────────────
    const autoRoute = options?.autoRoute !== false;
    let currentTier: RoutingTier = options?.tier ?? 'SIMPLE';

    if (autoRoute && !options?.tier) {
      onProgress?.({
        type: 'thinking',
        phase: 'analyzing',
        subPhase: 'building_context',
        label: 'Classifying request...',
        detail: 'Determining complexity to pick the right model',
      });
      const classification = await classifyRequest(userRequest, files.length, {
        lastMessageSummary: options?.recentMessages?.slice(-1)[0],
      });
      currentTier = classification.tier;

      // In solo mode, cap at SIMPLE. If COMPLEX/ARCHITECTURAL, let caller use orchestrated
      if (currentTier === 'COMPLEX' || currentTier === 'ARCHITECTURAL') {
        currentTier = 'SIMPLE';
      }

      const modelName = currentTier === 'TRIVIAL' ? 'Haiku' : 'Sonnet';
      onProgress?.({
        type: 'thinking',
        phase: 'analyzing',
        subPhase: 'building_context',
        label: `${currentTier} request — using ${modelName}`,
        metadata: {
          routingTier: currentTier,
          model: modelName,
          classifierConfidence: classification.confidence,
          classifierSource: classification.source,
        },
      });
    }

    // Map tier to AI action for model resolution
    const soloAction: AIAction = currentTier === 'TRIVIAL'
      ? 'classify_trivial' as AIAction
      : (options?.action ?? 'generate') as AIAction;

    // Build PM-scoped context with tier-aware file selection
    const pmFiles = await selectPMFiles(files, userRequest, projectId, { ...options, tier: currentTier });

    // Build dependency context using hydrated files only (not stubs)
    const hydratedForDeps = pmFiles.filter(f => !f.content.startsWith('['));
    const dependencyContext = await buildDependencyContext(hydratedForDeps, projectId);

    let designContext = '';
    try {
      designContext = await designContextProvider.getDesignContext(projectId);
    } catch { /* never block */ }

    // Trim domContext to token budget using iterative tiktoken trimming
    let trimmedDomContextSolo = options?.domContext;
    if (trimmedDomContextSolo) {
      let domTokens = estimateTokens(trimmedDomContextSolo);
      while (domTokens > DOM_CONTEXT_BUDGET && trimmedDomContextSolo.length > 100) {
        trimmedDomContextSolo = trimmedDomContextSolo.slice(0, Math.floor(trimmedDomContextSolo.length * 0.9));
        domTokens = estimateTokens(trimmedDomContextSolo);
      }
    }

    const context: AgentContext = {
      executionId,
      projectId,
      userId,
      userRequest,
      files: pmFiles,
      userPreferences,
      dependencyContext: currentTier === 'TRIVIAL' ? undefined : (dependencyContext || undefined),
      designContext: designContext || undefined,
      domContext: trimmedDomContextSolo || undefined,
      memoryContext: options?.memoryContext || undefined,
      diagnosticContext: currentTier === 'TRIVIAL' ? undefined : (options?.diagnosticContext || undefined),
    };

    try {
      // ── PM Exploration Phase (feature-gated) ─────────────────────────
      // Before the PM makes its JSON decision, let it explore the codebase
      // using read-only tools. Skip for TRIVIAL tier (not worth the cost).
      let explorationContext = '';
      let pmUsedTools = false;
      if (currentTier !== 'TRIVIAL') {
        const exploration = await this.runPMExploration(pmFiles, userRequest, {
          projectId,
          userId,
          loadContent: options?.loadContent,
          onProgress,
          onReasoningChunk: options?.onReasoningChunk,
          model: options?.model,
          tier: currentTier,
          action: soloAction,
        });
        explorationContext = exploration.explorationContext;
        pmUsedTools = exploration.usedTools;
      }

      onProgress?.({
        type: 'thinking',
        phase: 'analyzing',
        subPhase: 'analyzing_files',
        label: currentTier === 'TRIVIAL'
          ? 'Quick edit — generating changes'
          : 'Single agent — generating changes directly',
        detail: userRequest.slice(0, 120),
      });

      setAgentActive(executionId, 'project_manager');

      // Enrich the instruction with exploration results if available
      const enrichedInstruction = explorationContext
        ? `${userRequest}\n\n${explorationContext}`
        : userRequest;

      const pmTask: AgentTask = {
        executionId,
        instruction: enrichedInstruction,
        context: {
          ...context,
          userRequest: enrichedInstruction,
        },
      };

      this.logMessage(executionId, 'coordinator', 'project_manager', 'task', {
        instruction: userRequest,
      });

      // Select prompt based on tier and intent mode
      const useLightweight = currentTier === 'TRIVIAL' && options?.intentMode !== 'ask';
      const isAskMode = options?.intentMode === 'ask';
      const prompt = useLightweight
        ? this.pm.formatLightweightPrompt(pmTask)
        : this.pm.formatSoloPrompt(pmTask);
      const systemPrompt = useLightweight
        ? this.pm.getLightweightSystemPrompt()
        : isAskMode
          ? this.pm.getAskSystemPrompt()
          : this.pm.getSoloSystemPrompt();

      // Solo execution: call PM's executeDirectPrompt which handles model
      // resolution, budget enforcement, usage tracking, and validation.
      const soloOnReasoning = options?.onReasoningChunk;
      const agentOptions: AgentExecuteOptions = {
        action: soloAction,
        model: options?.model,
        tier: currentTier,
        onReasoningChunk: soloOnReasoning ? (chunk: string) => soloOnReasoning('project_manager', chunk) : undefined,
      };

      // Heartbeat every 25s so the client doesn't show "Taking longer than expected" (60s stall)
      const heartbeatMs = 25_000;
      const heartbeat = setInterval(() => {
        onProgress?.({
          type: 'thinking',
          phase: 'analyzing',
          label: 'Still generating...',
          detail: 'Model is working on your request',
        });
      }, heartbeatMs);
      let raw: string;
      try {
        raw = await this.pm.executeDirectPrompt(
          prompt,
          systemPrompt,
          agentOptions,
        );
      } finally {
        clearInterval(heartbeat);
      }

      setAgentCompleted(executionId, 'project_manager');

      // Parse the solo response (contains direct changes, not delegations)
      const result = this.pm.parseResponse(raw, pmTask);

      this.logMessage(executionId, 'project_manager', 'coordinator', 'result', {
        instruction: result.analysis,
      });

      // ── Tier escalation on failure ─────────────────────────────────
      // A response with substantive analysis (>100 chars) is a valid result
      // even without code changes — e.g. Ask mode or informational requests.
      const hasSubstantiveAnalysis = result.analysis && result.analysis.length > 100;
      const shouldEscalate = !result.success
        || (!result.changes?.length && !result.delegations?.length && !result.needsClarification && !hasSubstantiveAnalysis);

      if (shouldEscalate && currentTier !== 'COMPLEX') {
        const nextTier = escalateTier(currentTier);
        if (nextTier) {
          onProgress?.({
            type: 'thinking',
            phase: 'analyzing',
            subPhase: 'reasoning',
            label: `Upgrading to ${nextTier} analysis`,
            detail: 'Initial attempt produced no results — retrying with stronger model',
            metadata: { routingTier: nextTier, tierUpgrade: true, fromTier: currentTier },
          });

          // Retry with escalated tier (recursion depth bounded by escalateTier returning null)
          return this.executeSolo(executionId + '-esc', projectId, userId, userRequest, files, userPreferences, {
            ...options,
            tier: nextTier,
            autoRoute: false,
          });
        }
      }

      // Handle clarification in solo mode (mirrors _executeInner)
      if (result.needsClarification) {
        const clarificationOptions = this.extractClarificationOptions(result);

        onProgress?.({
          type: 'thinking',
          phase: 'clarification',
          label: 'Need more information',
          detail: result.analysis ?? 'Could you provide more details?',
          metadata: {
            questions: this.extractClarificationQuestions(result),
            options: clarificationOptions,
          },
        });

        updateExecutionStatus(executionId, 'completed');
        await persistExecution(executionId);
        return {
          ...result,
          needsClarification: true,
        };
      }

      if (result.success && result.changes && result.changes.length > 0) {
        storeChanges(executionId, 'project_manager', result.changes);
        updateExecutionStatus(executionId, 'awaiting_approval');
      } else {
        updateExecutionStatus(executionId, result.success ? 'completed' : 'failed');
        await persistExecution(executionId);
      }

      // Post-solo review: run GPT Codex review when solo mode produced changes
      if (result.changes && result.changes.length > 0) {
        try {
          onProgress?.({
            type: 'thinking',
            phase: 'reviewing',
            subPhase: 'running_review',
            label: 'Reviewing changes (solo)',
            detail: `${result.changes.length} change(s)`,
          });
          const allChanges = result.changes;
          const changedFileIds = files.filter((f) => allChanges.some((c) => c.fileName === f.fileName)).map((f) => f.fileId);
          const reviewFiles = files.filter((f) => changedFileIds.includes(f.fileId));
          const codexPackager = new CodexContextPackager();
          let projectContext: ProjectContext | null = await contextCache.get(projectId);
          if (!projectContext) {
            const contextFiles = toContextFiles(reviewFiles);
            const dependencies = await getDependenciesForFiles(projectId, contextFiles);
            projectContext = {
              projectId,
              files: contextFiles,
              dependencies,
              loadedAt: new Date(),
              totalSizeBytes: contextFiles.reduce((s, f) => s + f.sizeBytes, 0),
            };
          }
          const proposedChanges: ProposedChange[] = allChanges.map((c) => ({
            fileId: c.fileId,
            fileName: c.fileName,
            originalContent: c.originalContent,
            proposedContent: c.proposedContent ?? '',
            agentType: c.agentType,
          }));
          const codexReviewContent = codexPackager.packageForReview(projectContext, proposedChanges);
          const reviewTask: AgentTask = {
            executionId,
            instruction: `Review the following proposed changes for: ${userRequest}\n\n${codexReviewContent}`,
            context: {
              ...context,
              files: reviewFiles,
              userRequest: allChanges.map(formatChangesForReview).join('\n\n'),
            },
          };
          const reviewAgentResult = await this.reviewer.execute(reviewTask, { action: 'review' as AIAction, tier: currentTier });
          setAgentCompleted(executionId, 'review');
          if (reviewAgentResult.reviewResult) setReviewResult(executionId, reviewAgentResult.reviewResult);
          return { ...result, pmUsedTools, reviewResult: reviewAgentResult.reviewResult };
        } catch (reviewErr) {
          console.warn('[AgentCoordinator] Post-solo review failed:', reviewErr);
        }
      }

      return { ...result, pmUsedTools };
    } catch (error) {
      // ── Error-based tier escalation ────────────────────────────────
      const nextTier = escalateTier(currentTier);
      if (nextTier) {
        onProgress?.({
          type: 'thinking',
          phase: 'analyzing',
          subPhase: 'reasoning',
          label: `Upgrading to ${nextTier} analysis`,
          detail: `Error occurred — retrying with stronger model`,
          metadata: { routingTier: nextTier, tierUpgrade: true, fromTier: currentTier },
        });

        try {
          return await this.executeSolo(executionId + '-esc', projectId, userId, userRequest, files, userPreferences, {
            ...options,
            tier: nextTier,
            autoRoute: false,
          });
        } catch { /* fall through to original error handling */ }
      }

      updateExecutionStatus(executionId, 'failed');

      this.logMessage(executionId, 'coordinator', 'coordinator', 'error', {
        error: undefined,
        instruction: String(error),
      });

      await persistExecution(executionId);

      const isProviderErr = error instanceof AIProviderError;
      return {
        agentType: 'project_manager',
        success: false,
        error: {
          code: isProviderErr ? error.code : 'SOLO_EXECUTION_FAILED',
          message: isProviderErr ? error.userMessage : String(error),
          agentType: 'project_manager',
          recoverable: isProviderErr ? error.retryable : false,
        },
      };
    }
  }

  // ── Server-executed tools (results feed back into the LLM) ──────────
  private static SERVER_TOOLS = new Set([
    'read_file', 'search_files', 'grep_content', 'glob_files', 'semantic_search',
    'list_files', 'get_dependency_graph', 'validate_syntax', 'run_diagnostics',
    'check_lint', 'theme_check', 'screenshot_preview', 'compare_screenshots',
    'inspect_element', 'get_page_snapshot', 'query_selector', 'read_console_logs', 'inject_css',
    'inject_html', 'fetch_url', 'web_search', 'spawn_workers',
    'push_to_shopify', 'pull_from_shopify', 'list_themes',
    'list_store_resources', 'get_shopify_asset', 'generate_placeholder',
  ]);

  // ── Client-rendered tools (streamed to user, synthetic result to LLM) ──
  private static CLIENT_TOOLS = new Set([
    'propose_code_edit', 'search_replace', 'create_file', 'propose_plan',
    'ask_clarification', 'navigate_preview',
    'write_file', 'delete_file', 'rename_file',
  ]);

  /**
   * Select tools for the streaming agent loop based on intent mode.
   * Search/read tools always available; mutation tools guided by mode.
   */
  private selectAgentLoopTools(intentMode: string, hasPreview: boolean): ToolDefinition[] {
    // Read-only tools always available
    const tools: ToolDefinition[] = [
      ...AGENT_TOOLS.filter(t =>
        t.name === 'read_file' || t.name === 'search_files' ||
        t.name === 'grep_content' || t.name === 'glob_files' ||
        t.name === 'semantic_search' || t.name === 'list_files' ||
        t.name === 'get_dependency_graph' || t.name === 'run_diagnostics'
      ),
      CHECK_LINT_TOOL,
    ];

    // Ask mode: no mutation tools
    if (intentMode === 'ask') return tools;

    // All non-ask modes get mutation tools
    tools.push(PROPOSE_CODE_EDIT_TOOL);
    tools.push(SEARCH_REPLACE_TOOL);
    tools.push(CREATE_FILE_TOOL);
    tools.push(ASK_CLARIFICATION_TOOL);
    // Keep planning tool exclusive to plan mode to avoid plan loops in code/debug.
    if (intentMode === 'plan') {
      tools.push(PROPOSE_PLAN_TOOL);
    }

    if (hasPreview) {
      tools.push(NAVIGATE_PREVIEW_TOOL);
    }

    // Debug mode gets additional diagnostic tools
    if (intentMode === 'debug') {
      const themeCheck = AGENT_TOOLS.find(t => t.name === 'theme_check');
      if (themeCheck) tools.push(themeCheck);
    }

    return tools;
  }

  /**
   * Streaming agent loop: unified execution path for all solo modes.
   * Replaces executeAskFastPath and the serial pipeline for non-specialist requests.
   *
   * Architecture: multi-iteration wrapper around streamWithTools.
   * Text is streamed between tool executions. Server tools are executed and
   * their results fed back to the LLM. Client tools (propose_code_edit, etc.)
   * are forwarded to the UI with a synthetic result fed back to the LLM.
   */
  async streamAgentLoop(
    executionId: string,
    projectId: string,
    userId: string,
    userRequest: string,
    files: FileContext[],
    userPreferences: UserPreference[],
    options: CoordinatorExecuteOptions,
  ): Promise<AgentResult> {
    createExecution(executionId, projectId, userId, userRequest, options?.sessionId);
    updateExecutionStatus(executionId, 'in_progress');

    const onProgress = options.onProgress;
    const onContentChunk = options.onContentChunk;
    const onToolEvent = options.onToolEvent;
    const intentMode = options.intentMode ?? 'code';
    const effectiveTier = options.tier ?? 'SIMPLE';

    console.log(`[AgentLoop] Starting for execution ${executionId}, mode=${intentMode}`);

    onProgress?.({
      type: 'thinking',
      phase: 'analyzing',
      subPhase: 'building_context',
      label: 'Building context...',
    });

    if (shouldRequirePlanModeFirst({
      intentMode,
      tier: effectiveTier,
      userRequest,
      recentMessages: options.recentMessages,
      isReferentialCodePrompt: options.isReferentialCodePrompt,
    })) {
      const policyMessage = buildPlanModeRequiredMessage(effectiveTier);
      onProgress?.({
        type: 'thinking',
        phase: 'clarification',
        label: 'Plan approval required',
        detail: policyMessage,
      });
      updateExecutionStatus(executionId, 'completed');
      await persistExecution(executionId);
      return {
        agentType: 'project_manager',
        success: true,
        analysis: policyMessage,
        needsClarification: true,
        directStreamed: true,
      };
    }

    try {
      // ── Build signal-based file context ──────────────────────────────
      const signalCtx = await buildSignalContext(files, { ...options, projectId });
      const { preloaded, manifest } = signalCtx;

      // Format pre-loaded files
      const fileContents = preloaded
        .filter(f => f.content && !f.content.startsWith('['))
        .map(f => `### ${f.fileName}\n\`\`\`${f.fileType}\n${f.content}\n\`\`\``)
        .join('\n\n');

      // ── Build system prompt (base + mode overlay) ─────────────────────
      let systemPrompt = AGENT_BASE_PROMPT;
      if (intentMode === 'code') systemPrompt += '\n\n' + AGENT_CODE_OVERLAY;
      else if (intentMode === 'plan') systemPrompt += '\n\n' + AGENT_PLAN_OVERLAY;
      else if (intentMode === 'debug') systemPrompt += '\n\n' + AGENT_DEBUG_OVERLAY;
      systemPrompt += '\n\n' + buildMaximumEffortPolicyMessage();

      // ── Build initial messages ──────────────────────────────────────
      const systemMsg: AIMessage = { role: 'system', content: systemPrompt };
      if (AI_FEATURES.promptCaching) {
        systemMsg.cacheControl = { type: 'ephemeral' };
      }
      const messages: AIMessage[] = [systemMsg];

      // Conversation history
      if (options.recentMessages?.length) {
        for (let i = 0; i < options.recentMessages.length; i++) {
          const role = i % 2 === 0 ? 'user' : 'assistant';
          messages.push({ role: role as 'user' | 'assistant', content: options.recentMessages[i] });
        }
      }

      // Detect plan approval in recent messages and inject execution-forcing instruction
      const hasPlanApproval = hasPlanApprovalSignal(options.recentMessages, userRequest);
      if (hasPlanApproval && intentMode !== 'ask' && intentMode !== 'plan') {
        messages.push({
          role: 'user' as const,
          content: '[SYSTEM] The user has approved the plan. You must now implement the changes directly using propose_code_edit or search_replace. Do NOT call propose_plan again.',
        });
      }

      // User message with file context
      const userMessageParts = [
        userRequest,
        '',
        ...(options.memoryContext ? [options.memoryContext, ''] : []),
        ...(options.domContext ? [options.domContext, ''] : []),
        '## PRE-LOADED FILES:',
        preloaded.length > 0 ? fileContents : '(none)',
        '',
        '## FILE MANIFEST:',
        manifest,
      ];
      messages.push({ role: 'user', content: userMessageParts.join('\n') });

      // ── Select tools ──────────────────────────────────────────────────
      const hasPreview = !!options.domContext;
      const tools = this.selectAgentLoopTools(intentMode, hasPreview);

      // ── Resolve model ─────────────────────────────────────────────────
      const actionForModel: AIAction =
        intentMode === 'ask' ? 'ask' : intentMode === 'debug' ? 'debug' : 'generate';
      const model = resolveModel({
        action: actionForModel,
        userOverride: options.model,
        agentRole: 'project_manager',
        tier: options.tier ?? 'SIMPLE',
      });
      const providerName = getProviderForModel(model);
      const provider = getAIProvider(providerName as Parameters<typeof getAIProvider>[0]);

      if (!isToolProvider(provider)) {
        throw new AIProviderError('UNKNOWN', 'Provider does not support tool streaming', 'coordinator');
      }

      // ── Iteration state ────────────────────────────────────────────────
      const MAX_ITERATIONS = intentMode === 'ask' ? 3 : intentMode === 'code' ? 12 : 8;
      const TOTAL_TIMEOUT_MS = 240_000;
      const startTime = Date.now();
      let iteration = 0;
      let fullText = '';
      const accumulatedChanges: CodeChange[] = [];
      const readFiles = new Set<string>();
      for (const f of preloaded) {
        readFiles.add(f.fileName);
        if (f.fileId) readFiles.add(f.fileId);
        if (f.path) readFiles.add(f.path);
      }
      const hasThemeLayoutContext = files.some((f) => {
        const p = (f.path ?? f.fileName).replace(/\\/g, '/').toLowerCase();
        return p === 'layout/theme.liquid';
      });
      let needsClarification = false;
      let planProposalCount = 0;
      let lookupCallsInCodeMode = 0;
      let blockedLookupStreak = 0;
      let postEditLookupOnlyIterations = 0;
      let contextVersion = 0;
      const lookupResultCache = new Map<string, { version: number; content: string; is_error?: boolean }>();
      const invalidateProjectGraphs = () => {
        dependencyGraphCache.invalidateProject(projectId).catch(() => {});
        symbolGraphCache.invalidateProject(projectId).catch(() => {});
      };

      // Relaxed cap: allow broader discovery before enforcement in code mode.
      const CODE_MODE_MAX_LOOKUPS = 4;
      const LOOKUP_TOOL_NAMES = new Set([
        'read_file',
        'search_files',
        'grep_content',
        'glob_files',
        'semantic_search',
        'list_files',
        'get_dependency_graph',
        'run_diagnostics',
        'check_lint',
      ]);
      const buildLookupCacheKey = (toolName: string, input: Record<string, unknown> | undefined): string => {
        const payload = input ?? {};
        const stable = JSON.stringify(Object.keys(payload).sort().reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = payload[key];
          return acc;
        }, {}));
        return `${toolName}:${stable}`;
      };

      onProgress?.({
        type: 'thinking',
        phase: 'analyzing',
        subPhase: 'building_context',
        label: `Using ${model.split('/').pop() ?? model}`,
      });

      // ── Tool executor context ──────────────────────────────────────────
      const toolCtx: ToolExecutorContext = {
        files: signalCtx.allFiles,
        contextEngine: getProjectContextEngine(projectId, 60_000),
        projectId,
        userId,
        loadContent: options.loadContent,
      };

      // Set of file IDs/names that are already pre-loaded in the user message.
      // read_file calls for these are short-circuited to avoid wasting an iteration.
      const preloadedMap = new Map<string, FileContext>();
      for (const f of preloaded.filter(p => p.content && !p.content.startsWith('['))) {
        preloadedMap.set(f.fileId, f);
        preloadedMap.set(f.fileName, f);
        if (f.path) preloadedMap.set(f.path, f);
      }

      // ── Agent loop ─────────────────────────────────────────────────────
      let loopStreamingDisabled = isStreamingBroken(); // inherit persistent health state
      while (iteration < MAX_ITERATIONS) {
        if (Date.now() - startTime > TOTAL_TIMEOUT_MS) {
          console.warn(`[AgentLoop] Timeout after ${iteration} iterations`);
          break;
        }

        // Apply token budget before each iteration
        const budgeted = enforceRequestBudget(messages);
        const changesAtIterationStart = accumulatedChanges.length;
        let iterationLookupCalls = 0;
        let iterationEditCalls = 0;

        console.log(`[AgentLoop] Iteration ${iteration}, messages=${budgeted.messages.length}, truncated=${budgeted.truncated}`);

        // Stream with first-byte timeout fallback to completeWithTools()
        let streamResult: ToolStreamResult;
        const completionOpts = { model, maxTokens: intentMode === 'ask' ? 2048 : 4096 };

        const firstByteTimeout = getStreamFirstByteTimeout();
        if (firstByteTimeout > 0 && !loopStreamingDisabled) {
          // Race BOTH stream creation AND first-byte against the timeout.
          // In some environments, streamWithTools() itself hangs (HTTP-level buffering).
          let raced: ToolStreamResult | null = null;
          try {
            const streamCreationAndFirstByte = (async () => {
              const rawStream = await provider.streamWithTools(budgeted.messages, tools, completionOpts);
              return raceFirstByte(rawStream, firstByteTimeout);
            })();

            const timeoutRace = new Promise<null>((resolve) =>
              setTimeout(() => resolve(null), firstByteTimeout),
            );

            raced = await Promise.race([streamCreationAndFirstByte, timeoutRace]);
          } catch (err) {
            console.warn(`[AgentLoop] Stream creation failed:`, err);
            raced = null;
          }

          if (raced) {
            streamResult = raced;
          } else {
            // Stream hung — disable for this loop AND persist across requests
            loopStreamingDisabled = true;
            markStreamingBroken();
            console.warn(`[AgentLoop] Stream timeout (${firstByteTimeout}ms), falling back to completeWithTools (persistent)`);
            onProgress?.({
              type: 'thinking',
              phase: 'analyzing',
              label: 'Stream unavailable — using batch mode',
            });
            const batchResult = await provider.completeWithTools(budgeted.messages, tools, completionOpts);
            streamResult = synthesizeToolStream(
              batchResult as AIToolCompletionResult & { __rawContentBlocks?: unknown[] },
            );
          }
        } else if (loopStreamingDisabled) {
          // Streaming known broken — go directly to completeWithTools
          const batchResult = await provider.completeWithTools(budgeted.messages, tools, completionOpts);
          streamResult = synthesizeToolStream(
            batchResult as AIToolCompletionResult & { __rawContentBlocks?: unknown[] },
          );
        } else {
          streamResult = await provider.streamWithTools(budgeted.messages, tools, completionOpts);
        }

        // Cache tool results during streaming (keyed by tool_use_id)
        const iterToolResults = new Map<string, { content: string; is_error?: boolean }>();
        const pendingServerTools: Extract<ToolStreamEvent, { type: 'tool_end' }>[] = [];
        const reader = streamResult.stream.getReader();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const event = value as ToolStreamEvent;

            if (event.type === 'text_delta') {
              fullText += event.text;
              onContentChunk?.(event.text);
            }

            if (event.type === 'tool_start') {
              onToolEvent?.({
                type: 'tool_start',
                name: event.name,
                id: event.id,
              });
            }

            if (event.type === 'tool_end') {
              const isServerTool = AgentCoordinator.SERVER_TOOLS.has(event.name);

              if (isServerTool) {
                // Collect server tools for parallel execution after stream completes
                pendingServerTools.push(event);
              } else {
                // Client-rendered tool — forward to UI
                onToolEvent?.({
                  type: 'tool_call',
                  name: event.name,
                  id: event.id,
                  input: event.input,
                });

                // ── Accumulate code changes + update in-memory state ──────────
                // After each edit tool, update files array + preloadedMap so
                // subsequent read_file calls return post-edit content (read-after-write freshness).
                let syntheticMsg: string;

                if (event.name === 'propose_code_edit') {
                  const filePath = event.input?.filePath as string;
                  const newContent = event.input?.newContent as string;
                  const reasoning = event.input?.reasoning as string;
                  const matchedFile = files.find(f => f.fileName === filePath || f.path === filePath);
                  const originalContent = matchedFile?.content ?? '';
                  if ((newContent ?? '') !== originalContent) {
                    accumulatedChanges.push({
                      fileId: matchedFile?.fileId ?? '',
                      fileName: filePath ?? '',
                      originalContent,
                      proposedContent: newContent ?? '',
                      reasoning: reasoning ?? '',
                      agentType: 'project_manager',
                    });
                    iterationEditCalls++;
                    contextVersion += 1;
                    invalidateProjectGraphs();
                  }
                  // Read-after-write: update in-memory state for subsequent iterations
                  if (matchedFile) {
                    matchedFile.content = newContent ?? '';
                    preloadedMap.set(filePath, matchedFile);
                    if (matchedFile.fileId) preloadedMap.set(matchedFile.fileId, matchedFile);
                    if (matchedFile.path && matchedFile.path !== filePath) preloadedMap.set(matchedFile.path, matchedFile);
                  }
                  const lineCount = (newContent ?? '').split('\n').length;
                  syntheticMsg = `Full rewrite applied to ${filePath} (${lineCount} lines). The file is updated in your context.`;

                } else if (event.name === 'search_replace') {
                  const filePath = event.input?.filePath as string;
                  const oldText = event.input?.old_text as string;
                  const newText = event.input?.new_text as string;
                  const reasoning = event.input?.reasoning as string;
                  const matchedFile = files.find(f => f.fileName === filePath || f.path === filePath);
                  const currentContent = matchedFile?.content ?? '';
                  const replaceIdx = currentContent.indexOf(oldText);
                  const proposedContent = replaceIdx !== -1
                    ? currentContent.slice(0, replaceIdx) + newText + currentContent.slice(replaceIdx + oldText.length)
                    : currentContent;
                  if (replaceIdx !== -1 && proposedContent !== currentContent) {
                    accumulatedChanges.push({
                      fileId: matchedFile?.fileId ?? '',
                      fileName: filePath ?? '',
                      originalContent: currentContent,
                      proposedContent,
                      reasoning: reasoning ?? '',
                      agentType: 'project_manager',
                    });
                    iterationEditCalls++;
                    contextVersion += 1;
                    invalidateProjectGraphs();
                  }
                  // Read-after-write: update in-memory state for subsequent iterations
                  if (matchedFile && replaceIdx !== -1) {
                    matchedFile.content = proposedContent;
                    preloadedMap.set(filePath, matchedFile);
                    if (matchedFile.fileId) preloadedMap.set(matchedFile.fileId, matchedFile);
                    if (matchedFile.path && matchedFile.path !== filePath) preloadedMap.set(matchedFile.path, matchedFile);
                  }
                  const oldLines = (oldText ?? '').split('\n').length;
                  const newLines = (newText ?? '').split('\n').length;
                  if (replaceIdx !== -1) {
                    syntheticMsg = `Edit applied to ${filePath}: replaced ${oldLines} line(s) with ${newLines} line(s). The file is updated in your context.`;
                  } else {
                    syntheticMsg = `Edit failed for ${filePath}: old_text not found in the current file content. Re-read the file with read_file to see its current content before retrying.`;
                  }

                } else if (event.name === 'create_file') {
                  const newFileName = (event.input?.fileName as string) ?? '';
                  const newFileContent = (event.input?.content as string) ?? '';
                  accumulatedChanges.push({
                    fileId: '',
                    fileName: newFileName,
                    originalContent: '',
                    proposedContent: newFileContent,
                    reasoning: (event.input?.reasoning as string) ?? '',
                    agentType: 'project_manager',
                  });
                  iterationEditCalls++;
                  contextVersion += 1;
                  invalidateProjectGraphs();
                  // Read-after-write: add new file so read_file can find it
                  const newFileCtx: FileContext = {
                    fileId: `new_${newFileName}`,
                    fileName: newFileName,
                    fileType: newFileName.endsWith('.liquid') ? 'liquid'
                      : newFileName.endsWith('.js') ? 'javascript'
                      : newFileName.endsWith('.css') ? 'css'
                      : 'other',
                    content: newFileContent,
                    path: newFileName,
                  };
                  files.push(newFileCtx);
                  preloadedMap.set(newFileName, newFileCtx);
                  preloadedMap.set(newFileCtx.fileId, newFileCtx);
                  const createLines = newFileContent.split('\n').length;
                  syntheticMsg = `File ${newFileName} created (${createLines} lines). Available via read_file.`;

                } else if (event.name === 'write_file') {
                  const filePath = (event.input?.filePath as string) ?? (event.input?.fileName as string) ?? '';
                  const newContent = (event.input?.content as string) ?? (event.input?.newContent as string) ?? '';
                  const matchedFile = files.find(f => f.fileName === filePath || f.path === filePath);
                  const previous = matchedFile?.content ?? '';
                  if (newContent !== previous) {
                    accumulatedChanges.push({
                      fileId: matchedFile?.fileId ?? '',
                      fileName: filePath,
                      originalContent: previous,
                      proposedContent: newContent,
                      reasoning: (event.input?.reasoning as string) ?? '',
                      agentType: 'project_manager',
                    });
                    iterationEditCalls++;
                    contextVersion += 1;
                    invalidateProjectGraphs();
                  }
                  if (matchedFile) {
                    matchedFile.content = newContent;
                    preloadedMap.set(filePath, matchedFile);
                    if (matchedFile.fileId) preloadedMap.set(matchedFile.fileId, matchedFile);
                    if (matchedFile.path && matchedFile.path !== filePath) preloadedMap.set(matchedFile.path, matchedFile);
                  }
                  const writeLines = newContent.split('\n').length;
                  syntheticMsg = `File ${filePath} written (${writeLines} lines). The file is updated in your context.`;

                } else if (event.name === 'delete_file') {
                  const filePath = (event.input?.filePath as string) ?? (event.input?.fileName as string) ?? '';
                  const matchedFile = files.find(f => f.fileName === filePath || f.path === filePath);
                  // Remove from preloadedMap so read_file won't find it
                  if (matchedFile) {
                    preloadedMap.delete(filePath);
                    if (matchedFile.fileId) preloadedMap.delete(matchedFile.fileId);
                    if (matchedFile.fileName) preloadedMap.delete(matchedFile.fileName);
                    if (matchedFile.path) preloadedMap.delete(matchedFile.path);
                    const idx = files.indexOf(matchedFile);
                    if (idx !== -1) files.splice(idx, 1);
                  }
                  syntheticMsg = `File ${filePath} deleted.`;
                  contextVersion += 1;
                  invalidateProjectGraphs();

                } else if (event.name === 'rename_file') {
                  const oldPath = (event.input?.oldPath as string) ?? (event.input?.filePath as string) ?? '';
                  const newPath = (event.input?.newPath as string) ?? (event.input?.newName as string) ?? '';
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
                  syntheticMsg = `File renamed from ${oldPath} to ${newPath}.`;
                  contextVersion += 1;
                  invalidateProjectGraphs();

                } else if (event.name === 'propose_plan') {
                  if (intentMode === 'plan') {
                    planProposalCount++;
                    syntheticMsg = 'Plan proposed. Waiting for user review.';
                  } else {
                    syntheticMsg = '[SYSTEM ENFORCEMENT] propose_plan is disabled outside plan mode. Implement directly with propose_code_edit/search_replace/create_file or ask_clarification.';
                  }

                } else if (event.name === 'ask_clarification') {
                  needsClarification = true;
                  syntheticMsg = 'Clarification question sent. Waiting for user response.';

                } else {
                  syntheticMsg = `Tool ${event.name} call forwarded to client.`;
                }

                iterToolResults.set(event.id, { content: syntheticMsg });
              }
            }
          }
        } finally {
          reader.releaseLock();
        }

        // ── Execute pending server tools in parallel ──────────────────────
        if (pendingServerTools.length > 0) {
          const executeServerTool = async (evt: Extract<ToolStreamEvent, { type: 'tool_end' }>): Promise<void> => {
            const toolCall: AIToolCall = { id: evt.id, name: evt.name, input: evt.input };
            let toolResult: ToolResult;
            const isLookupTool = LOOKUP_TOOL_NAMES.has(evt.name);
            const lookupCacheKey = isLookupTool ? buildLookupCacheKey(evt.name, evt.input) : null;

            // In code mode, cap read/search churn before any edits are enacted.
            if (intentMode === 'code' && isLookupTool && accumulatedChanges.length === 0) {
              if (lookupCallsInCodeMode >= CODE_MODE_MAX_LOOKUPS) {
                blockedLookupStreak++;
                const enforcementMsg = '[SYSTEM ENFORCEMENT] Lookup budget reached in code mode. Do not call more lookup tools this turn. Use propose_code_edit/search_replace/create_file to enact changes, or ask_clarification if required details are missing.';
                iterToolResults.set(evt.id, {
                  content: enforcementMsg,
                  is_error: true,
                });
                onToolEvent?.({
                  type: 'tool_call',
                  name: evt.name,
                  id: evt.id,
                  input: evt.input,
                  result: enforcementMsg,
                  isError: true,
                });
                return;
              }
              lookupCallsInCodeMode++;
            }
            if (intentMode === 'code' && isLookupTool) {
              iterationLookupCalls++;
            }

            // Reuse lookup results while context has not changed.
            if (lookupCacheKey) {
              const cached = lookupResultCache.get(lookupCacheKey);
              if (cached && cached.version === contextVersion) {
                iterToolResults.set(evt.id, { content: cached.content, is_error: cached.is_error });
                onToolEvent?.({
                  type: 'tool_call',
                  name: evt.name,
                  id: evt.id,
                  input: evt.input,
                  result: cached.content,
                  isError: cached.is_error,
                });
                return;
              }
            }

            const readFileId = evt.name === 'read_file' ? (evt.input?.fileId as string) : null;
            const preloadedFile = readFileId ? preloadedMap.get(readFileId) : null;

            if (preloadedFile) {
              toolResult = {
                tool_use_id: evt.id,
                content: preloadedFile.content,
              };
              console.log(`[AgentLoop] read_file short-circuited: ${preloadedFile.fileName} (already pre-loaded)`);
            } else {
              try {
                const result = executeToolCall(toolCall, toolCtx);
                toolResult = result instanceof Promise ? await result : result;
              } catch (err) {
                toolResult = {
                  tool_use_id: evt.id,
                  content: `Tool execution failed: ${String(err)}`,
                  is_error: true,
                };
              }
            }

            // Track read files for context rule expansion
            if (evt.name === 'read_file' && !toolResult.is_error) {
              const fileId = evt.input?.fileId as string;
              if (fileId) readFiles.add(fileId);
              const matchedFile = files.find(f => f.fileId === fileId || f.fileName === fileId);
              if (matchedFile) readFiles.add(matchedFile.fileName);
            }

            // Truncate large results (8000 chars balances context vs token budget)
            const MAX_TOOL_RESULT_CHARS = 8000;
            const truncatedContent = toolResult.content.length > MAX_TOOL_RESULT_CHARS
              ? toolResult.content.slice(0, MAX_TOOL_RESULT_CHARS)
                + `\n\n... [truncated — showing ${MAX_TOOL_RESULT_CHARS} of ${toolResult.content.length} chars]`
              : toolResult.content;

            iterToolResults.set(evt.id, { content: truncatedContent, is_error: toolResult.is_error });
            if (lookupCacheKey) {
              lookupResultCache.set(lookupCacheKey, {
                version: contextVersion,
                content: truncatedContent,
                is_error: toolResult.is_error,
              });
            }
            if (!toolResult.is_error && intentMode === 'code' && isLookupTool) {
              blockedLookupStreak = 0;
            }

            onToolEvent?.({
              type: 'tool_call',
              name: evt.name,
              id: evt.id,
              input: evt.input,
              result: truncatedContent,
              isError: toolResult.is_error,
            });
          };

          if (pendingServerTools.length > 1) {
            console.log(`[AgentLoop] Executing ${pendingServerTools.length} server tools in parallel`);
          }
          await Promise.all(pendingServerTools.map(executeServerTool));
        }

        // Check stop reason
        const sr = await streamResult.getStopReason();
        const rawBlocks = await streamResult.getRawContentBlocks();

        if (sr !== 'tool_use' || iteration >= MAX_ITERATIONS - 1 || planProposalCount >= 2) {
          break;
        }

        // In code mode, once edits exist, don't allow endless lookup-only cycles.
        if (intentMode === 'code' && accumulatedChanges.length > 0) {
          const addedChangesThisIteration = accumulatedChanges.length > changesAtIterationStart;
          if (!addedChangesThisIteration && iterationEditCalls === 0 && iterationLookupCalls > 0) {
            postEditLookupOnlyIterations++;
          } else if (addedChangesThisIteration || iterationEditCalls > 0) {
            postEditLookupOnlyIterations = 0;
          }

          if (postEditLookupOnlyIterations >= 2) {
            fullText += '\n\nStopping extra lookup passes and finalizing with the enacted code changes.';
            break;
          }
        }

        // Hard fail-fast: if code mode keeps issuing blocked lookups, stop the loop.
        if (intentMode === 'code' && blockedLookupStreak >= 5 && accumulatedChanges.length === 0) {
          fullText += '\n\nI have enough context to proceed, but I need one explicit target to avoid guessing. Confirm the exact file/selector to edit, or tell me to apply the change directly now.';
          needsClarification = true;
          break;
        }

        // Multi-turn: append assistant message (raw content blocks) + tool results
        const assistantMsg = {
          role: 'assistant',
          content: '',
          __toolCalls: rawBlocks,
        } as unknown as AIMessage;
        messages.push(assistantMsg);

        // Build tool result blocks from cached results (no re-execution)
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
        }

        if (toolResultBlocks.length > 0) {
          const toolResultMsg = {
            role: 'user',
            content: '',
            __toolResults: toolResultBlocks,
          } as unknown as AIMessage;
          messages.push(toolResultMsg);
        }

        // Compress old tool results to save tokens in later iterations
        compressOldToolResults(messages);

        iteration++;
      }

      // Track usage
      const usage = await Promise.resolve().then(() => ({
        inputTokens: 0,
        outputTokens: 0,
      }));
      this.pm['_lastUsage'] = {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        model,
      };

      console.log(`[AgentLoop] Complete after ${iteration + 1} iterations, ${fullText.length} chars, ${accumulatedChanges.length} changes`);

      // ── Hard validation/dependency gates for code mode ─────────────────
      if (intentMode === 'code' && accumulatedChanges.length > 0) {
        const verification = verifyChanges(accumulatedChanges, files);
        if (!verification.passed) {
          onProgress?.({
            type: 'thinking',
            phase: 'validating',
            label: `Validation failed (${verification.errorCount} error(s))`,
          });
          onProgress?.({
            type: 'diagnostics',
            detail: verification.formatted,
          });
          needsClarification = true;
          accumulatedChanges.length = 0;
          fullText += `\n\nValidation gate blocked completion:\n${verification.formatted}`;
        }
      }

      if (intentMode === 'code' && accumulatedChanges.length > 0) {
        const crossFile = validateChangeSet(accumulatedChanges, files);
        if (!crossFile.valid) {
          const errors = crossFile.issues.filter((i) => i.severity === 'error');
          const warnings = crossFile.issues.filter((i) => i.severity === 'warning');
          onProgress?.({
            type: 'thinking',
            phase: 'validating',
            label: `Cross-file contracts: ${errors.length} error(s), ${warnings.length} warning(s)`,
          });
          for (const issue of crossFile.issues) {
            onProgress?.({
              type: 'diagnostics',
              file: issue.file,
              severity: issue.severity,
              message: issue.description,
              category: issue.category,
            });
          }
          needsClarification = true;
          accumulatedChanges.length = 0;
          fullText += '\n\nCross-file contract gate blocked completion due to validation errors.';
        }
      }

      if (intentMode === 'code' && accumulatedChanges.length > 0 && hasThemeLayoutContext) {
        const artifact = buildThemePlanArtifact(
          accumulatedChanges,
          files,
          readFiles,
          readFiles
        );
        onProgress?.({
          type: 'diagnostics',
          detail: artifact.markdown,
        });
        if (artifact.policyIssues.length > 0) {
          needsClarification = true;
          accumulatedChanges.length = 0;
          fullText += `\n\nTheme dependency/policy gate blocked completion:\n${artifact.policyIssues.map((i) => `- ${i}`).join('\n')}`;
        }
      }

      if (intentMode === 'code' && accumulatedChanges.length > 0 && hasThemeLayoutContext) {
        const projectedFiles = files.map((f) => {
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

      const hasChanges = accumulatedChanges.length > 0;

      if (hasChanges) {
        storeChanges(executionId, 'project_manager', accumulatedChanges);
        updateExecutionStatus(executionId, 'awaiting_approval');
      } else {
        updateExecutionStatus(executionId, 'completed');
        await persistExecution(executionId);
      }

      const finalAnalysis = ensureCompletionResponseSections({
        analysis: fullText,
        intentMode,
        needsClarification,
        changes: accumulatedChanges,
      });

      return {
        agentType: 'project_manager',
        success: true,
        analysis: finalAnalysis,
        changes: hasChanges ? accumulatedChanges : undefined,
        needsClarification,
        directStreamed: true,
      };
    } catch (error) {
      console.error('[AgentLoop] Error, falling back to standard pipeline:', error);

      // Fall back to standard executeSolo (without the fast path flag)
      const fallbackOptions = { ...options, onContentChunk: undefined, onToolEvent: undefined };
      return this.executeSolo(executionId + '-fb', projectId, userId, userRequest, files, userPreferences, fallbackOptions);
    }
  }

  /**
   * Ask mode fast path: single conversational LLM call with direct token streaming.
   * Bypasses exploration, JSON decision, and summary — tokens go straight to the client.
   * @deprecated Use streamAgentLoop instead. Kept for backward compatibility.
   */
  private async executeAskFastPath(
    executionId: string,
    projectId: string,
    userId: string,
    userRequest: string,
    files: FileContext[],
    userPreferences: UserPreference[],
    options: CoordinatorExecuteOptions,
  ): Promise<AgentResult> {
    createExecution(executionId, projectId, userId, userRequest, options?.sessionId);
    updateExecutionStatus(executionId, 'in_progress');

    const onProgress = options.onProgress;
    const onContentChunk = options.onContentChunk!;

    console.log(`[Ask-FastPath] Starting for execution ${executionId}`);

    // Send a brief thinking event so the UI shows activity
    onProgress?.({
      type: 'thinking',
      phase: 'analyzing',
      subPhase: 'building_context',
      label: 'Answering...',
    });

    try {
      // Build PM-scoped context (same file selection as regular solo)
      const pmFiles = await selectPMFiles(files, userRequest, projectId, { ...options, tier: 'SIMPLE' });

      // Format selected files for context
      const selectedFiles = pmFiles.filter(f => !f.content.startsWith('['));
      const stubCount = pmFiles.length - selectedFiles.length;
      const fileList = [
        `Selected files (${selectedFiles.length}):`,
        ...selectedFiles.map(f => `- ${f.fileName} (${f.fileType}, ${f.content.length} chars)`),
        '',
        stubCount > 0
          ? `${stubCount} other theme files available (not loaded).`
          : '',
      ].filter(Boolean).join('\n');

      const fileContents = selectedFiles
        .map(f => `### ${f.fileName}\n\`\`\`${f.fileType}\n${f.content}\n\`\`\``)
        .join('\n\n');

      // Build user message with file context
      const userMessage = [
        `User Question: ${userRequest}`,
        '',
        '## Project Files:',
        fileList,
        '',
        ...(options.memoryContext ? [options.memoryContext, ''] : []),
        ...(options.domContext ? [options.domContext, ''] : []),
        '## Full File Contents (selected files):',
        fileContents,
      ].join('\n');

      // Build conversation messages
      const messages: AIMessage[] = [
        { role: 'system' as const, content: ASK_DIRECT_PROMPT },
      ];

      // Include conversation history for multi-turn context
      if (options.recentMessages?.length) {
        for (let i = 0; i < options.recentMessages.length; i++) {
          const role = i % 2 === 0 ? 'user' : 'assistant';
          messages.push({ role: role as 'user' | 'assistant', content: options.recentMessages[i] });
        }
      }

      messages.push({ role: 'user', content: userMessage });

      // Apply token budget
      const budgeted = enforceRequestBudget(messages);

      // Resolve model (respects user override)
      const model = resolveModel({
        action: 'generate' as AIAction,
        userOverride: options.model,
        agentRole: 'project_manager',
        tier: 'SIMPLE',
      });
      const providerName = getProviderForModel(model);
      const provider = getAIProvider(providerName as Parameters<typeof getAIProvider>[0]);

      console.log(`[Ask-FastPath] Using model: ${model}, provider: ${providerName}, messages: ${budgeted.messages.length}, truncated: ${budgeted.truncated}`);

      // Stream directly — each token goes to the client
      const streamResult = await provider.stream(budgeted.messages, {
        model,
        maxTokens: 4096,
      });

      let fullText = '';
      const reader = streamResult.stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fullText += value;
          onContentChunk(value);
        }
      } finally {
        reader.releaseLock();
      }

      // Track usage
      const usage = await streamResult.getUsage();
      console.log(`[Ask-FastPath] Complete. ${fullText.length} chars, ${usage.inputTokens}in/${usage.outputTokens}out tokens`);

      // Store usage on PM agent for accumulation
      this.pm['_lastUsage'] = {
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        model,
      };

      updateExecutionStatus(executionId, 'completed');
      await persistExecution(executionId);

      return {
        agentType: 'project_manager',
        success: true,
        analysis: fullText,
        directStreamed: true,
      };
    } catch (error) {
      console.error('[Ask-FastPath] Error, falling back to standard pipeline:', error);

      // Fall back to standard executeSolo (without the fast path flag)
      const fallbackOptions = { ...options, onContentChunk: undefined };
      return this.executeSolo(executionId + '-fb', projectId, userId, userRequest, files, userPreferences, fallbackOptions);
    }
  }

  /**
   * C1: Build a summary of all specialist proposals for cross-agent coordination.
   */
  private buildProposalSummary(results: AgentResult[]): string {
    const sections: string[] = [];
    for (const result of results) {
      if (!result.changes?.length) continue;
      sections.push(`### ${result.agentType} agent proposals:`);
      for (const change of result.changes) {
        // Include patch summaries if available for richer cross-agent context
        const patchSummary = change.patches?.length
          ? ` (${change.patches.length} patch${change.patches.length > 1 ? 'es' : ''})`
          : '';
        sections.push(`- ${change.fileName}${patchSummary}: ${change.reasoning}`);
      }
    }
    return sections.length > 0
      ? `## Proposal Registry\n\n${sections.join('\n')}`
      : '';
  }

  /**
   * Extract specific clarification questions from PM analysis.
   * Looks for question marks and bullet-pointed queries.
   */
  private extractClarificationQuestions(pmResult: AgentResult): string[] {
    const analysis = pmResult.analysis ?? '';
    const questions: string[] = [];

    // Find lines that end with '?' or start with '- ' and contain '?'
    const lines = analysis.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.endsWith('?')) {
        questions.push(trimmed.replace(/^[-*•]\s*/, ''));
      }
    }

    // If no explicit questions found, use the full analysis as a question
    if (questions.length === 0 && analysis.length > 0) {
      questions.push(analysis.slice(0, 200));
    }

    return questions;
  }

  /**
   * Extract structured clarification options from PM analysis.
   *
   * Parses the PM's response for:
   * 1. JSON `clarificationOptions` array (preferred — structured output from prompt)
   * 2. Numbered list items (fallback — e.g., "1. Focus on product images")
   * 3. Bullet list items (fallback — e.g., "- Check the CSS visibility")
   *
   * Options marked with [RECOMMENDED] get `recommended: true`.
   * If no option is marked recommended, the first option is auto-recommended.
   */
  private extractClarificationOptions(
    pmResult: AgentResult,
  ): Array<{ id: string; label: string; recommended: boolean }> {
    const analysis = pmResult.analysis ?? '';
    const options: Array<{ id: string; label: string; recommended: boolean }> = [];

    // Strategy 1: Try to parse JSON with clarificationOptions
    try {
      const jsonMatch = analysis.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as {
          clarificationOptions?: Array<{ label: string; recommended?: boolean; reason?: string }>;
        };
        if (Array.isArray(parsed.clarificationOptions) && parsed.clarificationOptions.length > 0) {
          for (let i = 0; i < parsed.clarificationOptions.length; i++) {
            const opt = parsed.clarificationOptions[i];
            options.push({
              id: `option-${i + 1}`,
              label: opt.label,
              recommended: opt.recommended === true,
            });
          }
          // Ensure at least one is recommended
          if (!options.some((o) => o.recommended) && options.length > 0) {
            options[0].recommended = true;
          }
          return options;
        }
      }
    } catch {
      // JSON parsing failed — fall through to text parsing
    }

    // Strategy 2: Parse numbered list items (e.g., "1. Focus on product images")
    const lines = analysis.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      // Match: "1." or "1)" at start, with optional [RECOMMENDED] tag
      const numberedMatch = trimmed.match(/^\d+[.)]\s*(\[RECOMMENDED\]\s*)?(.+)/i);
      if (numberedMatch) {
        const isRecommended = !!numberedMatch[1];
        const label = numberedMatch[2].trim();
        // Skip very short labels or meta-text
        if (label.length > 5) {
          options.push({
            id: `option-${options.length + 1}`,
            label,
            recommended: isRecommended,
          });
        }
      }
    }

    // Strategy 3: If no numbered items, try bullet items
    if (options.length === 0) {
      for (const line of lines) {
        const trimmed = line.trim();
        const bulletMatch = trimmed.match(/^[-*•]\s*(\[RECOMMENDED\]\s*)?(.+)/i);
        if (bulletMatch) {
          const isRecommended = !!bulletMatch[1];
          const label = bulletMatch[2].trim();
          if (label.length > 5 && !label.endsWith('?')) {
            options.push({
              id: `option-${options.length + 1}`,
              label,
              recommended: isRecommended,
            });
          }
        }
      }
    }

    // Ensure at least one option is recommended (default to first)
    if (options.length > 0 && !options.some((o) => o.recommended)) {
      options[0].recommended = true;
    }

    return options;
  }

  private logMessage(
    executionId: string,
    from: AgentType | 'coordinator',
    to: AgentType | 'coordinator',
    type: 'task' | 'result' | 'error',
    payload: AgentMessage['payload']
  ): void {
    const message: AgentMessage = {
      id: crypto.randomUUID(),
      executionId,
      fromAgent: from as AgentType,
      toAgent: to,
      messageType: type,
      payload,
      timestamp: new Date(),
    };
    addMessage(executionId, message);
  }
}

// ── Async context helpers ───────────────────────────────────────────────

/** Build design-system context. Gracefully degrades to empty string on failure. */
async function buildDesignContext(projectId: string): Promise<string> {
  try {
    return await designContextProvider.getDesignContext(projectId);
  } catch {
    return '';
  }
}

/** Build file grouping context (related files that form components). */
async function buildFileGroupContext(files: FileContext[]): Promise<string> {
  try {
    const groups = generateFileGroups(files.map((f) => ({
      id: f.fileId,
      name: f.fileName,
      path: f.path ?? f.fileName,
      content: f.content,
    })));
    if (groups.length > 0) {
      const lines = groups
        .filter((g) => g.fileIds.length > 1)
        .slice(0, 20)
        .map((g) => {
          const names = g.fileIds
            .map((id) => files.find((f) => f.fileId === id)?.fileName)
            .filter(Boolean);
          return `  ${g.label}: ${names.join(', ')}`;
        });
      if (lines.length > 0) {
        return `\nRelated file groups (files that form a component):\n${lines.join('\n')}`;
      }
    }
    return '';
  } catch {
    return '';
  }
}
