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
import type { AgentExecuteOptions, AgentUsage } from './base';
import type { AIAction } from './model-router';
import { getProviderForModel } from './model-router';
import {
  classifyRequest,
  escalateTier,
  TIER_ORDER,
  type RoutingTier,
  type ClassificationResult,
} from './classifier';
import { AIProviderError } from '@/lib/ai/errors';
import { DependencyDetector, ContextCache } from '@/lib/context';
import type {
  FileContext as ContextFileContext,
  ProjectContext,
  FileDependency,
} from '@/lib/context/types';
import { DesignSystemContextProvider } from '@/lib/design-tokens/agent-integration';
import { generateFileGroups } from '@/lib/shopify/theme-grouping';
import { ContextEngine } from '@/lib/ai/context-engine';
import { validateChangeSet } from './validation/change-set-validator';
import { checkLiquid, checkCSS, checkJavaScript, type SyntaxError as AgentSyntaxError } from './validation/syntax-checker';
import { runDiagnostics, formatDiagnostics } from './tools/diagnostics-tool';
import { createTwoFilesPatch } from 'diff';
import { estimateTokens } from '@/lib/ai/token-counter';
import { getTieredBudget, getTierAgentBudget } from '@/lib/ai/request-budget';
import { budgetFiles } from './specialists/prompt-budget';
import {
  parseClarificationFromAnalysis,
  formatClarificationForPrompt,
  MAX_CLARIFICATION_ROUNDS,
  type ClarificationRequest,
} from './clarification';
import { verifyChanges, type VerificationResult } from './verification';
import { compareSnapshots, type DOMSnapshot as VerifierDOMSnapshot, type PreviewVerificationResult } from './preview-verifier';
import type { LoadContentFn } from '@/lib/supabase/file-loader';

// ── Cross-file context helpers (REQ-5) ────────────────────────────────

/** Module-level singletons so cache persists across requests within the same process. */
const contextCache = new ContextCache();
const dependencyDetector = new DependencyDetector();
const designContextProvider = new DesignSystemContextProvider();
const contextEngine = new ContextEngine(60_000);
const DOM_CONTEXT_BUDGET = 10_000; // tokens

/**
 * Detect cross-file dependencies and format a human-readable summary.
 * Uses TTL-based caching to avoid recomputing on every request.
 * Fails gracefully — returns empty string on error so agent execution is never blocked.
 */
function buildDependencyContext(
  files: FileContext[],
  projectId: string,
): string {
  try {
    // Check cache first
    const cached = contextCache.get(projectId);
    if (cached) {
      return formatDependencies(cached.dependencies, cached.files);
    }

    // Convert agent FileContext → context FileContext (adds required fields)
    const contextFiles: ContextFileContext[] = files.map((f) => ({
      fileId: f.fileId,
      fileName: f.fileName,
      fileType: f.fileType,
      content: f.content,
      sizeBytes: f.content.length,
      lastModified: new Date(),
      dependencies: { imports: [], exports: [], usedBy: [] },
    }));

    const dependencies = dependencyDetector.detectDependencies(contextFiles);

    // Cache the full ProjectContext for the TTL window
    const projectContext: ProjectContext = {
      projectId,
      files: contextFiles,
      dependencies,
      loadedAt: new Date(),
      totalSizeBytes: contextFiles.reduce((sum, f) => sum + f.sizeBytes, 0),
    };
    contextCache.set(projectId, projectContext);

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
function selectPMFiles(
  files: FileContext[],
  userRequest: string,
  options?: CoordinatorExecuteOptions,
): FileContext[] {
  contextEngine.indexFiles(files);

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
    ...pmSelection.files.map((f: FileContext) => f.fileId),
  ]);

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

  console.log(`[selectPMFiles] tier=${tier}, selected=${pmSelectedIds.size}, excluded=${files.length - pmSelectedIds.size}, total=${files.length}, budget=${fileBudget}`);

  // Hydrate selected files via loadContent (if available)
  if (loadContent && pmSelectedIds.size > 0) {
    const hydratedFiles = loadContent([...pmSelectedIds]);
    const hydratedMap = new Map(hydratedFiles.map(f => [f.fileId, f]));

    const result = files.map(f => hydratedMap.get(f.fileId) ?? f);
    const hydratedTokens = hydratedFiles.reduce((s, f) => s + estimateTokens(f.content), 0);
    console.log(`[selectPMFiles] hydrated ${hydratedFiles.length} files, ~${hydratedTokens} tokens`);
    return result;
  }

  // Fallback without loadContent: keep existing content for selected, stub others
  return files.map(f =>
    pmSelectedIds.has(f.fileId)
      ? f
      : { ...f, content: `[${f.content.length} chars — content excluded, see manifest]` }
  );
}

// ── p0 Architectural Principles ──────────────────────────────────────────

/**
 * File Context Rule: Reject code changes to files that aren't loaded in context.
 * This prevents agents from hallucinating changes to files they haven't seen.
 */
function enforceFileContextRule(
  changes: CodeChange[],
  contextFiles: FileContext[],
): { allowed: CodeChange[]; rejected: CodeChange[] } {
  const contextFileNames = new Set(contextFiles.map((f) => f.fileName));
  const contextFileIds = new Set(contextFiles.map((f) => f.fileId));

  const allowed: CodeChange[] = [];
  const rejected: CodeChange[] = [];

  for (const change of changes) {
    if (contextFileNames.has(change.fileName) || contextFileIds.has(change.fileId)) {
      allowed.push(change);
    } else {
      rejected.push(change);
    }
  }

  return { allowed, rejected };
}

/** Route syntax validation to the correct checker based on file type. */
function validateSyntaxByType(fileName: string, content: string): AgentSyntaxError[] {
  if (fileName.endsWith('.liquid')) return checkLiquid(content);
  if (fileName.endsWith('.css')) return checkCSS(content);
  if (fileName.endsWith('.js')) return checkJavaScript(content);
  return [];
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
  metadata?: Record<string, unknown>;
  /** Diagnostics event fields (type: 'diagnostics') */
  file?: string;
  errorCount?: number;
  warningCount?: number;
  /** Worker progress event fields (type: 'worker_progress') */
  workerId?: string;
  status?: 'running' | 'complete' | 'error';
}

export type ProgressCallback = (event: ThinkingEvent) => void;

// ── Coordinator Options ─────────────────────────────────────────────────

export interface CoordinatorExecuteOptions {
  /** The primary AI action being performed. */
  action?: AIAction;
  /** User's preferred model override (from useAgentSettings). */
  model?: string;
  /** Execution mode: orchestrated (multi-agent) or solo (PM only). */
  mode?: 'orchestrated' | 'solo';
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

  constructor() {
    this.pm = new ProjectManagerAgent();
    this.specialists = {
      liquid: new LiquidAgent(),
      javascript: new JavaScriptAgent(),
      css: new CSSAgent(),
      json: new JSONAgent(),
    };
    this.reviewer = new ReviewAgent();
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
    // Top-level coordinator timeout (180s) -- ensures we never hang
    const COORDINATOR_TIMEOUT_MS = 180_000;
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
    createExecution(executionId, projectId, userId, userRequest);
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

    const agentOptions: AgentExecuteOptions = {
      action: 'analyze' as AIAction,
      model: options?.model,
      tier: currentTier,
    };

    // ── Parallel context building (p0: Parallel over Sequential) ──────
    // Build all context layers simultaneously instead of sequentially.
    // NOTE: buildDependencyContext and buildFileGroupContext need files with real content
    // for accurate reference detection. We hydrate PM-selected files first.
    const pmFiles = selectPMFiles(files, userRequest, { ...options, tier: currentTier });
    const hydratedForDeps = pmFiles.filter(f => !f.content.startsWith('['));
    const [dependencyContext, designContext, fileGroupContext] = await Promise.all([
      Promise.resolve(buildDependencyContext(hydratedForDeps, projectId)),
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
      // Step 1: Project Manager analyzes and delegates
      onProgress?.({
        type: 'thinking',
        phase: 'analyzing',
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
        label: 'Planning changes',
        analysis: pmResult.analysis,
        detail: pmResult.delegations?.length
          ? `Delegating to ${pmResult.delegations.length} specialist(s)`
          : 'Analyzing results',
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
          label: 'Analysis complete',
          summary: pmResult.analysis,
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
          label: 'Changes ready',
          summary: pmResult.analysis,
          metadata: { routingTier: currentTier, directChanges: allChanges.length },
        });
        updateExecutionStatus(executionId, 'completed');
        await persistExecution(executionId);
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

      // Collect all affected file names from delegations for specialist context
      const affectedFileNames = (pmResult.delegations ?? []).flatMap(d => d.affectedFiles);
      const affectedFileIds = files
        .filter(f => affectedFileNames.includes(f.fileName))
        .map(f => f.fileId);

      // Expand with dependencies (using stub index — reference detection skipped for stubs)
      const expandedIds = contextEngine.resolveWithDependencies(affectedFileIds);

      // Hydrate specialist files via loadContent (bounded to expanded set only)
      const loadContent = options?.loadContent;
      const specialistHydratedFiles = loadContent
        ? loadContent([...new Set([...affectedFileIds, ...expandedIds])])
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

      // Execute wave helper: runs a single delegation
      const executeDelegation = async (delegation: typeof delegations[0]) => {
        const agent = this.specialists[delegation.agent];
        if (!agent) return null;

        onProgress?.({
          type: 'thinking',
          phase: 'executing',
          label: `${delegation.agent} agent`,
          detail: delegation.task.slice(0, 120),
          agent: delegation.agent,
        });

        setAgentActive(executionId, delegation.agent);

        this.logMessage(executionId, 'coordinator', delegation.agent, 'task', {
          instruction: delegation.task,
        });

        // Build specialist-scoped context: hydrate only affected + dependency files
        // EPIC V5: Use tier-scaled budget for specialist context window
        const specialistBudget = getTierAgentBudget(currentTier, 'specialist');
        const specialistContextEngine = new ContextEngine(specialistBudget);
        specialistContextEngine.indexFiles(specialistHydratedFiles);
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
            ? loadContent([...delegationFileIds])
            : specialistHydratedFiles.filter(f => delegationFileIds.has(f.fileId)));

        const specialistTask: AgentTask = {
          executionId,
          instruction: delegation.task,
          context: {
            ...context,
            files: specialistFiles,
            userRequest: delegation.task,
          },
        };

        const result = await agent.execute(specialistTask, {
          ...agentOptions,
          action: 'generate',
        });
        setAgentCompleted(executionId, delegation.agent);
        console.log(`[Coordinator] ${delegation.agent} specialist: ${specialistFiles.length} files, ~${estimateTokens(JSON.stringify(specialistTask.context.files.map(f => f.content)).slice(0, 200_000))} tokens`);

        if (result.changes?.length) {
          storeChanges(executionId, delegation.agent, result.changes);

          // C3: Stream partial results — notify frontend as each specialist completes
          onProgress?.({
            type: 'thinking',
            phase: 'change_ready',
            label: `${result.agentType} completed`,
            detail: `${result.changes.length} change(s) ready for preview`,
            metadata: { agentType: result.agentType, changeCount: result.changes.length },
          });
        }

        this.logMessage(executionId, delegation.agent, 'coordinator', 'result', {
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
        const waveNames = waveIndices.map(i => delegations[i].agent);

        if (waves.length > 1) {
          onProgress?.({
            type: 'thinking',
            phase: 'executing',
            label: `Wave ${waveIdx + 1}/${waves.length}: ${waveNames.join(' + ')} specialist${waveNames.length > 1 ? 's' : ''} in parallel`,
          });
        }

        // Chunk wave indices by maxAgents to enforce concurrency limit
        for (let chunkStart = 0; chunkStart < waveIndices.length; chunkStart += maxConcurrent) {
          const chunk = waveIndices.slice(chunkStart, chunkStart + maxConcurrent);

          // Phase 8a: Emit worker_progress start for each specialist in this chunk
          for (const idx of chunk) {
            onProgress?.({
              type: 'worker_progress',
              workerId: delegations[idx].agent,
              label: delegations[idx].agent + ' specialist',
              status: 'running',
            } as ThinkingEvent);
          }

          const chunkResults = await Promise.all(
            chunk.map(i => executeDelegation(delegations[i]))
          );

          // Phase 8a: Emit worker_progress complete for each specialist
          for (const idx of chunk) {
            onProgress?.({
              type: 'worker_progress',
              workerId: delegations[idx].agent,
              label: delegations[idx].agent + ' specialist',
              status: 'complete',
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
        onProgress?.({
          type: 'thinking',
          phase: 'executing',
          label: 'Coordinating changes',
          detail: 'Cross-checking specialist proposals for consistency',
        });

        // Second-pass: Let specialists see each other's proposals and adjust
        const refinementPromises = specialistResults
          .filter(r => r.changes && r.changes.length > 0)
          .map(async (result) => {
            const agent = this.specialists[result.agentType];
            if (!agent) return null;

            // Build cross-context: what other specialists proposed
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
              const refined = await agent.execute(refinementTask, { ...agentOptions, action: 'fix' });
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
          label: 'Verifying changes (syntax, types, schema, references)...',
        });

        const verification = verifyChanges(allChanges, files);

        if (!verification.passed) {
          onProgress?.({
            type: 'thinking',
            phase: 'validating',
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

          // Re-invoke responsible specialists with verification diagnostics
          const verifyFixPromises: Promise<AgentResult | null>[] = [];
          for (const [fileName, fileIssues] of issuesByFile) {
            const originalChange = allChanges.find(c => c.fileName === fileName);
            if (!originalChange) continue;
            const agent = this.specialists[originalChange.agentType];
            if (!agent) continue;

            const issueReport = fileIssues
              .map(i => `- [${i.category}] Line ${i.line}: ${i.message} (${i.severity})`)
              .join('\n');

            onProgress?.({
              type: 'thinking',
              phase: 'fixing',
              label: `Self-correcting ${fileName}...`,
              agent: originalChange.agentType,
            });

            const fixFileId = files.find(f => f.fileName === fileName)?.fileId;
            const fixContextFiles = fixFileId && loadContent
              ? loadContent([fixFileId])
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
              agent.execute(verifyFixTask, { ...agentOptions, action: 'fix' }).catch(() => null)
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
              label: `Self-corrected ${fixedChanges.length} file(s)`,
            });
          }
        } else {
          onProgress?.({
            type: 'thinking',
            phase: 'validating',
            label: 'Verification passed — no syntax, type, or schema errors',
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
              label: `Found ${errorCount} error(s), ${warningCount} warning(s) in ${change.fileName}`,
              detail: diagnostics
                .filter(d => d.severity === 'error')
                .map(e => `Line ${e.line}: ${e.message}`).join('; '),
            });

            const specialist = this.specialists[change.agentType];
            if (specialist) {
              onProgress?.({
                type: 'thinking',
                phase: 'fixing',
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
                const fixResult = await specialist.execute(fixTask, { ...agentOptions, action: 'fix' });
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

      // ── p0: Verification First-Class ────────────────────────────────
      // Review agent is mandatory in orchestrated mode.
      onProgress?.({
        type: 'thinking',
        phase: 'reviewing',
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
        ? loadContent(changedFileIds)
        : files.filter(f => changedFileIds.includes(f.fileId));

      const reviewTask: AgentTask = {
        executionId,
        instruction: `Review the following ${allChanges.length} proposed changes for: ${userRequest}${validationContext}${proposalSummary ? `\n\n${proposalSummary}` : ''}`,
        context: {
          ...context,
          files: reviewFiles,
          userRequest: allChanges.map(formatChangesForReview).join('\n\n'),
        },
      };

      const reviewResult = await this.reviewer.execute(reviewTask, {
        ...agentOptions,
        action: 'review',
      });
      setAgentCompleted(executionId, 'review');

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
          onProgress?.({
            type: 'thinking',
            phase: 'executing',
            label: 'Fixing critical issues',
            detail: `${criticalIssues.length} critical issue(s) found`,
          });

          // Group issues by file to identify responsible specialists
          const issuesByFile = new Map<string, typeof criticalIssues>();
          for (const issue of criticalIssues) {
            const existing = issuesByFile.get(issue.file) || [];
            existing.push(issue);
            issuesByFile.set(issue.file, existing);
          }

          // Re-invoke specialists for files with critical issues
          const refinementPromises: Promise<AgentResult | null>[] = [];
          for (const [fileName, issues] of issuesByFile) {
            // Find which specialist originally changed this file
            const originalChange = allChanges.find(c => c.fileName === fileName);
            if (!originalChange) continue;
            const agent = this.specialists[originalChange.agentType];
            if (!agent) continue;

            const issueDescriptions = issues.map(i =>
              `- [${i.severity}] ${i.description}${i.suggestion ? ` (Suggestion: ${i.suggestion})` : ''}`
            ).join('\n');

            // Hydrate only the specific file being refined (bounded)
            const refinementFileId = files.find(f => f.fileName === fileName)?.fileId;
            const refinementContextFiles = refinementFileId && loadContent
              ? loadContent([refinementFileId])
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
              agent.execute(refinementTask, { ...agentOptions, action: 'fix' }).catch(() => null)
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
        label: 'Ready',
        summary: reviewResult.reviewResult?.summary ?? 'Changes complete',
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

      updateExecutionStatus(executionId, 'completed');
      await persistExecution(executionId);

      return {
        agentType: 'project_manager',
        success: true,
        changes: allChanges,
        reviewResult: reviewResult.reviewResult,
        analysis: pmResult.analysis,
        // p0: Testing Always First — signal to frontend to inject "Verify this works" chip
        suggestVerification: allChanges.length > 0,
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
    createExecution(executionId, projectId, userId, userRequest);
    updateExecutionStatus(executionId, 'in_progress');

    const onProgress = options?.onProgress;

    // ── Smart Routing: classify if not already classified ─────────────
    const autoRoute = options?.autoRoute !== false;
    let currentTier: RoutingTier = options?.tier ?? 'SIMPLE';

    if (autoRoute && !options?.tier) {
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
    const pmFiles = selectPMFiles(files, userRequest, { ...options, tier: currentTier });

    // Build dependency context using hydrated files only (not stubs)
    const hydratedForDeps = pmFiles.filter(f => !f.content.startsWith('['));
    const dependencyContext = buildDependencyContext(hydratedForDeps, projectId);

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
      onProgress?.({
        type: 'thinking',
        phase: 'analyzing',
        label: currentTier === 'TRIVIAL'
          ? 'Quick edit — generating changes'
          : 'Solo mode — generating changes directly',
        detail: userRequest.slice(0, 120),
      });

      setAgentActive(executionId, 'project_manager');

      const pmTask: AgentTask = {
        executionId,
        instruction: userRequest,
        context,
      };

      this.logMessage(executionId, 'coordinator', 'project_manager', 'task', {
        instruction: userRequest,
      });

      // Select prompt based on tier
      const useLightweight = currentTier === 'TRIVIAL';
      const prompt = useLightweight
        ? this.pm.formatLightweightPrompt(pmTask)
        : this.pm.formatSoloPrompt(pmTask);
      const systemPrompt = useLightweight
        ? this.pm.getLightweightSystemPrompt()
        : this.pm.getSoloSystemPrompt();

      // Solo execution: call PM's executeDirectPrompt which handles model
      // resolution, budget enforcement, usage tracking, and validation.
      const agentOptions = {
        action: soloAction,
        model: options?.model,
        tier: currentTier,
      };

      const raw = await this.pm.executeDirectPrompt(
        prompt,
        systemPrompt,
        agentOptions,
      );

      setAgentCompleted(executionId, 'project_manager');

      // Parse the solo response (contains direct changes, not delegations)
      const result = this.pm.parseResponse(raw, pmTask);

      this.logMessage(executionId, 'project_manager', 'coordinator', 'result', {
        instruction: result.analysis,
      });

      // ── Tier escalation on failure ─────────────────────────────────
      const shouldEscalate = !result.success
        || (!result.changes?.length && !result.delegations?.length && !result.needsClarification);

      if (shouldEscalate && currentTier !== 'COMPLEX') {
        const nextTier = escalateTier(currentTier);
        if (nextTier) {
          onProgress?.({
            type: 'thinking',
            phase: 'analyzing',
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

      updateExecutionStatus(executionId, result.success ? 'completed' : 'failed');
      await persistExecution(executionId);

      return result;
    } catch (error) {
      // ── Error-based tier escalation ────────────────────────────────
      const nextTier = escalateTier(currentTier);
      if (nextTier) {
        onProgress?.({
          type: 'thinking',
          phase: 'analyzing',
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
