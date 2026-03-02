/**
 * V2 Streaming Coordinator — single-stream iterative agent loop.
 *
 * Replaces the two-phase pipeline (PM analysis → Summary) with a single
 * tool-using agent loop: think → tool → observe → repeat.
 *
 * Key differences from the removed v1 coordinator:
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
import { AIProviderError, classifyNetworkError } from '@/lib/ai/errors';
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
import { validateCodeChanges } from './validation/unified-validator';
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
import { getFrameworkInstructions } from './theme-map/framework-instructions';

// ── Imports from extracted coordinator modules ──────────────────────────────
import {
  ITERATION_LIMITS,
  TOTAL_TIMEOUT_MS,
  MAX_TOOL_RESULT_CHARS,
  LOOKUP_TOOL_NAMES,
  MUTATING_TOOL_NAMES,
  PRE_EDIT_LOOKUP_BUDGET,
  PRE_EDIT_BLOCK_THRESHOLD,
  PRE_EDIT_ENFORCEMENT_ABORT_THRESHOLD,
  REFERENTIAL_PRE_EDIT_LOOKUP_BUDGET,
  REFERENTIAL_PRE_EDIT_BLOCK_THRESHOLD,
  GOD_MODE_PRE_EDIT_LOOKUP_BUDGET,
  GOD_MODE_PRE_EDIT_BLOCK_THRESHOLD,
  READ_LINES_DUPLICATE_PRE_EDIT_LIMIT,
  POST_EDIT_STAGNATION_THRESHOLD,
  POST_EDIT_TOOL_BUDGET_SOFT_CAP,
  CODE_ZERO_TOOL_STREAK_LIMIT,
  QUICK_EDIT_MAX_PRELOADED_FILES,
  QUICK_EDIT_MAX_SCOUT_TARGETS_PER_FILE,
  QUICK_EDIT_MAX_LARGE_PREVIEW_CHARS,
  QUICK_EDIT_MAX_INLINE_FILE_CHARS,
  FIRST_EDIT_TOOL_CALL_SLA,
  FIRST_EDIT_TOOL_CALL_ABORT,
  MAX_TOOL_CALLS,
  V2_SERVER_TOOLS,
  MAX_STUCK_RECOVERIES,
  MAX_VERIFICATION_INJECTIONS as MAX_VERIFICATION_INJECTIONS_CONST,
} from './coordinator-constants';
import {
  isV2StreamBroken,
  markV2StreamBroken,
  raceFirstByteV2,
  synthesizeBatchAsStream,
} from './coordinator-stream';
import {
  buildCompletionSummary,
  buildLookupSignature,
  compressOldToolResults,
  appendExecutionTerminalLog,
  buildFileOutline,
  buildToolResultCardData,
  trackFileReadFn,
  trackFileEditFn,
  normalizeToolResultFn,
  normalizeFileRef as normalizeFileRefFn,
  buildReadLinesSignature as buildReadLinesSignatureFn,
  buildMemoryAnchorFn,
} from './coordinator-helpers';
import {
  extractPromptMentionedFiles,
  isFastEditEligible,
  FAST_EDIT_SYSTEM_SUFFIX,
  enforceFileContextRule,
  buildFallbackClarificationOptions,
  applyReferentialArtifactsAsChanges,
  selectReferenceSections,
  flattenFileTree,
  findMainCssFile,
  findSnippetConsumers,
  buildV2Context,
} from './coordinator-context';
import type { ReferentialArtifact, MutationFailure, LoopState, CoordinatorContext } from './coordinator-types';
import { executeServerTools, executePTCTools, groupByFileOwnership, type ToolEndEvent, type ParallelGroup } from './coordinator-tools';
import { StuckDetector } from './stuck-detector';
import type { MicrocompactionStats } from './microcompaction';
import { isRereadOfCompactedFile, microcompactToolResults } from './microcompaction';
import { parseReviewToolContent } from './tools/review-parser';
import { extractTargetRegion } from './tools/region-extractor';

// ITERATION_LIMITS, TOTAL_TIMEOUT_MS, MAX_TOOL_RESULT_CHARS → moved to coordinator-constants.ts
// STREAM_FIRST_BYTE_TIMEOUT_MS, isV2StreamBroken, markV2StreamBroken, raceFirstByteV2 → moved to coordinator-stream.ts
const STREAM_FIRST_BYTE_TIMEOUT_MS = 30_000;

// LOOKUP_TOOL_NAMES, MUTATING_TOOL_NAMES, PRE_EDIT_* constants → moved to coordinator-constants.ts

// MAX_TOOL_CALLS → moved to coordinator-constants.ts
// MutationFailure → moved to coordinator-types.ts

// buildCompletionSummary → moved to coordinator-helpers.ts

// parseReviewToolContent → moved to tools/review-parser.ts

// buildLookupSignature → moved to coordinator-helpers.ts

// resetV2StreamHealth → moved to coordinator-stream.ts (re-exported below)

// V2_SERVER_TOOLS → moved to coordinator-constants.ts

// V2_ONLY_TOOLS removed — routing is handled by dispatcher.ts

// ── Module-level caches ─────────────────────────────────────────────────────

const symbolGraphCache = new SymbolGraphCache();
const dependencyGraphCache = new DependencyGraphCache();



// extractPromptMentionedFiles → moved to coordinator-context.ts

// isFastEditEligible, FAST_EDIT_SYSTEM_SUFFIX → moved to coordinator-context.ts

// enforceFileContextRule → moved to coordinator-context.ts

// ── Options interface ───────────────────────────────────────────────────────

// ReferentialArtifact → moved to coordinator-types.ts (re-exported below)

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
  /** Abort signal for client disconnect. */
  signal?: AbortSignal;
}

// V2Context, buildV2Context → moved to coordinator-context.ts

// --- buildV2Context body (~280 lines) removed — now imported from coordinator-context.ts ---
// @ts-ignore dead code: function shell kept to preserve brace balance, body gutted
function _buildV2Context_DEAD() { if (false as boolean) { void 0; } }
// compressOldToolResults → moved to coordinator-helpers.ts (re-exported below)

// appendExecutionTerminalLog → moved to coordinator-helpers.ts

// buildFallbackClarificationOptions → moved to coordinator-context.ts

// applyReferentialArtifactsAsChanges → moved to coordinator-context.ts

// selectReferenceSections, flattenFileTree, findMainCssFile, findSnippetConsumers → moved to coordinator-context.ts
type ExecutionPhase = 'resolveIntent' | 'buildPatch' | 'applyPatch' | 'verify' | 'complete';

// ToolEndEvent, ParallelGroup, ENABLE_UNISOLATED_PARALLEL_SERVER_TOOLS, groupByFileOwnership → moved to coordinator-tools.ts

// buildFileOutline → moved to coordinator-helpers.ts
// buildToolResultCardData → moved to coordinator-helpers.ts

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
                } catch (err) {
                  console.error(`[V2] Checkpoint resume hydration failed for file ${f.fileId}:`, err);
                }
              }
            }
          }
        }
      }
    } catch (err) {
      console.error(`[V2] Checkpoint retrieval failed for execution ${executionId}, proceeding fresh:`, err);
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
    const v2ctx = await buildV2Context(projectId, files, userRequest, options, tier, initialStrategy, !!isSlimEligible, onProgress);
    let preloaded = v2ctx.preloaded;
    const { allFiles, manifest, graph: depGraph, symbolMatchedFiles } = v2ctx;

    if (!isSlimEligible) {
      onProgress?.({ type: 'thinking', phase: 'analyzing', label: 'Building structural brief...' });
    }

    // ── Theme Intelligence Map (programmatic, instant) ─────────────────
    // Single path: get cached map or build on-demand (<100ms).
    // lookupThemeMap → buildEnrichedScoutBrief → context gate.
    let scoutSection = manifest;
    let detectedFramework: string | undefined;
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
        detectedFramework = themeMap.framework;
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

    // Include learned user coding preferences in the PM context
    try {
      const prefLearner = new PatternLearning();
      const [themePrefs, codingPrefs] = await Promise.all([
        prefLearner.getThemePatterns(userId).catch(() => []),
        prefLearner.getPatterns(userId).catch(() => []),
      ]);
      const allPrefs = [...themePrefs, ...codingPrefs];
      if (allPrefs.length > 0) {
        const prefsBlock = allPrefs
          .map((p) => `- ${p.key}${p.value && p.value !== p.key ? `: ${p.value}` : ''}`)
          .join('\n');
        systemPrompt += `\n\n## User Coding Preferences\n${prefsBlock}`;
      }
    } catch { /* preferences are non-critical */ }

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
      ...(detectedFramework ? [`\nTheme framework: ${detectedFramework}`] : []),
      ...(detectedFramework
        ? (() => {
            const instr = getFrameworkInstructions(detectedFramework);
            return instr ? [`\nFramework instructions: ${instr}`] : [];
          })()
        : []),
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

    // Variables needed by extracted coordinator-tools.ts functions
    let editAttempts = 0;
    let editFirstPassSuccess = 0;
    let cascadeDepthSum = 0;
    let cascadeDepthCount = 0;
    let stuckRecoveryCount = 0;
    const toolSummaryLog = new Map<string, string>();
    const editToolDistribution: Record<string, number> = {};
    const microcompactionStats: MicrocompactionStats = { coldCount: 0, rereadCount: 0, tokensSaved: 0 };
    let truncationSignalSent = false;
    const stuckDetector = new StuckDetector();

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
      } catch (err) {
        console.error('[V2] Supabase service client init failed — PM file writes will be unavailable:', err);
      }
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
        if (isBackgroundResumeEnabled() && fileStore) {
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
        } catch (err) {
          console.error(`[V2] Batch content hydration failed for ${allHydrationIds.size} files:`, err);
        }
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

    // ── Full theme preload: hydrate ALL files into preloadedMap for ~0ms reads ──
    // Themes are typically ≤200 files / ≤5MB. Preloading eliminates Supabase
    // round-trips during the agent loop. Gate: only for themes ≤300 files.
    if (options.loadContent && files.length > 0 && files.length <= 300) {
      const notPreloaded = files.filter(f =>
        f.fileId && !preloadedMap.has(f.fileId) && !preloadedMap.has(f.fileName),
      );
      if (notPreloaded.length > 0) {
        try {
          const ids = notPreloaded.map(f => f.fileId).filter((id) => Boolean(id));
          if (ids.length > 0) {
            const hydrated = await options.loadContent(ids);
            const byId = new Map(hydrated.map((h) => [h.fileId, h]));
            let preloadCount = 0;
            for (const f of notPreloaded) {
              const h = byId.get(f.fileId) ?? f;
              if (h.content && !String(h.content).startsWith('[')) {
                preloadedMap.set(h.fileId, h);
                preloadedMap.set(h.fileName, h);
                if (h.path) preloadedMap.set(h.path, h);
                readFiles.add(h.fileName);
                if (h.path) readFiles.add(h.path);
                preloadCount++;
              }
            }
            console.log('[V2] Full theme preload: ' + preloadCount + '/' + notPreloaded.length + ' files hydrated into preloadedMap (' + preloadedMap.size + ' total keys)');
          }
        } catch (err) {
          console.warn('[V2] Full theme preload failed (non-fatal, reads will use cache waterfall):', err);
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

    // Hoisted from inside the loop so they can be captured by the loopState bridge
    let mutatingAttemptedThisIteration = false;
    let iterToolResults = new Map<string, { content: string; is_error?: boolean; isPTC?: boolean }>();

    // ── Bridge LoopState: proxy over raw mutable variables for extracted functions ──
    const loopState = {
      get iteration() { return iteration; }, set iteration(v: number) { iteration = v; },
      get fullText() { return fullText; }, set fullText(v: string) { fullText = v; },
      get totalToolCalls() { return totalToolCalls; }, set totalToolCalls(v: number) { totalToolCalls = v; },
      get hasAttemptedEdit() { return hasAttemptedEdit; }, set hasAttemptedEdit(v: boolean) { hasAttemptedEdit = v; },
      get executionPhase() { return executionPhase; }, set executionPhase(v: ExecutionPhase) { executionPhase = v; },
      get contextVersion() { return contextVersion; }, set contextVersion(v: number) { contextVersion = v; },
      get failedMutationCount() { return failedMutationCount; }, set failedMutationCount(v: number) { failedMutationCount = v; },
      get debugFixAttemptCount() { return debugFixAttemptCount; }, set debugFixAttemptCount(v: number) { debugFixAttemptCount = v; },
      get preEditLookupBlockedCount() { return preEditLookupBlockedCount; }, set preEditLookupBlockedCount(v: number) { preEditLookupBlockedCount = v; },
      get mutatingAttemptedThisIteration() { return mutatingAttemptedThisIteration; }, set mutatingAttemptedThisIteration(v: boolean) { mutatingAttemptedThisIteration = v; },
      get forceNoLookupUntilEdit() { return forceNoLookupUntilEdit; }, set forceNoLookupUntilEdit(v: boolean) { forceNoLookupUntilEdit = v; },
      get filesReadOnDemand() { return filesReadOnDemand; }, set filesReadOnDemand(v: number) { filesReadOnDemand = v; },
      get consecutiveReviewRejections() { return consecutiveReviewRejections; }, set consecutiveReviewRejections(v: number) { consecutiveReviewRejections = v; },
      get changesAtLastReviewRejection() { return changesAtLastReviewRejection; }, set changesAtLastReviewRejection(v: number) { changesAtLastReviewRejection = v; },
      get lastMutationFailure() { return lastMutationFailure; }, set lastMutationFailure(v: MutationFailure | null) { lastMutationFailure = v; },
      get latestReviewResult() { return latestReviewResult; }, set latestReviewResult(v: ReviewResult | undefined) { latestReviewResult = v; },
      get needsClarification() { return needsClarification; }, set needsClarification(v: boolean) { needsClarification = v; },
      get hasStructuredClarification() { return hasStructuredClarification; }, set hasStructuredClarification(v: boolean) { hasStructuredClarification = v; },
      get totalInputTokens() { return totalInputTokens; }, set totalInputTokens(v: number) { totalInputTokens = v; },
      get totalOutputTokens() { return totalOutputTokens; }, set totalOutputTokens(v: number) { totalOutputTokens = v; },
      get totalCacheReadTokens() { return totalCacheReadTokens; }, set totalCacheReadTokens(v: number) { totalCacheReadTokens = v; },
      get totalCacheWriteTokens() { return totalCacheWriteTokens; }, set totalCacheWriteTokens(v: number) { totalCacheWriteTokens = v; },
      get ptcContainerId() { return ptcContainerId; }, set ptcContainerId(v: string | undefined) { ptcContainerId = v; },
      get reactionEscalationMessage() { return reactionEscalationMessage; }, set reactionEscalationMessage(v: string | null) { reactionEscalationMessage = v; },
      get firstTokenMs() { return firstTokenMs; }, set firstTokenMs(v: number) { firstTokenMs = v; },
      get postEditNoChangeIterations() { return postEditNoChangeIterations; }, set postEditNoChangeIterations(v: number) { postEditNoChangeIterations = v; },
      get zeroToolIterationStreak() { return zeroToolIterationStreak; }, set zeroToolIterationStreak(v: number) { zeroToolIterationStreak = v; },
      get readOnlyIterationCount() { return readOnlyIterationCount; }, set readOnlyIterationCount(v: number) { readOnlyIterationCount = v; },
      get stuckRecoveryCount() { return stuckRecoveryCount; }, set stuckRecoveryCount(v: number) { stuckRecoveryCount = v; },
      get prematureStopNudges() { return prematureStopNudges; }, set prematureStopNudges(v: number) { prematureStopNudges = v; },
      get editAttempts() { return editAttempts; }, set editAttempts(v: number) { editAttempts = v; },
      get editFirstPassSuccess() { return editFirstPassSuccess; }, set editFirstPassSuccess(v: number) { editFirstPassSuccess = v; },
      get cascadeDepthSum() { return cascadeDepthSum; }, set cascadeDepthSum(v: number) { cascadeDepthSum = v; },
      get cascadeDepthCount() { return cascadeDepthCount; }, set cascadeDepthCount(v: number) { cascadeDepthCount = v; },
      get finalizationNudgeSent() { return finalizationNudgeSent; }, set finalizationNudgeSent(v: boolean) { finalizationNudgeSent = v; },
      get enactEnforcementCount() { return enactEnforcementCount; }, set enactEnforcementCount(v: number) { enactEnforcementCount = v; },
      get firstEditSlaNudges() { return firstEditSlaNudges; }, set firstEditSlaNudges(v: number) { firstEditSlaNudges = v; },
      get lastVerificationIteration() { return lastVerificationIteration; }, set lastVerificationIteration(v: number) { lastVerificationIteration = v; },
      get totalVerificationInjections() { return totalVerificationInjections; }, set totalVerificationInjections(v: number) { totalVerificationInjections = v; },
      get rethinkCount() { return rethinkCount; }, set rethinkCount(v: number) { rethinkCount = v; },
      get lastProactiveAnchorIteration() { return lastProactiveAnchorIteration; }, set lastProactiveAnchorIteration(v: number) { lastProactiveAnchorIteration = v; },
      get skippedLoop() { return skippedLoop; }, set skippedLoop(v: boolean) { skippedLoop = v; },
      get baselineErrorCount() { return baselineErrorCount; }, set baselineErrorCount(v: number) { baselineErrorCount = v; },
      get MAX_ITERATIONS() { return MAX_ITERATIONS; }, set MAX_ITERATIONS(v: number) { MAX_ITERATIONS = v; },
      get currentStrategy() { return currentStrategy; }, set currentStrategy(v: ExecutionStrategy) { currentStrategy = v; },
      get replayAppliedCount() { return replayAppliedCount; }, set replayAppliedCount(v: number) { replayAppliedCount = v; },
      get replaySource() { return replaySource; }, set replaySource(v: string | undefined) { replaySource = v; },
      get preEditLookupBudget() { return preEditLookupBudget; }, set preEditLookupBudget(v: number) { preEditLookupBudget = v; },
      get preEditBlockThreshold() { return preEditBlockThreshold; }, set preEditBlockThreshold(v: number) { preEditBlockThreshold = v; },
      // Collections (reference types)
      get iterToolResults() { return iterToolResults; },
      readFiles,
      searchedFiles,
      preloadedMap,
      messages,
      toolSequenceLog,
      lookupCallVersion,
      lookupResultCache,
      toolOutputCache,
      readLinesRangeCallCount,
      microcompactionStats,
      accumulatedChanges,
      fileReadLog,
      fileEditLog,
      toolSummaryLog,
      proposeOnlyFiles,
      editToolDistribution,
      consecutiveVerifyFailures,
      revertHistory,
      orchestrationSignals,
      queuedReactionInstructions,
    } as unknown as LoopState;

    // ── Bridge CoordinatorContext: read-only dependencies for extracted functions ──
    const coordCtx: CoordinatorContext = {
      userRequest,
      executionId,
      projectId,
      userId,
      tier,
      model,
      providerName: providerName!,
      intentMode,
      referentialCodePrompt,
      referentialArtifacts,
      unifiedCtx,
      files,
      allFiles,
      preloaded,
      currentScoutBrief: currentScoutBrief ?? undefined,
      userPreferences,
      designContext: designContext ?? undefined,
      contextEngine,
      fileStore: fileStore!,
      loadContent: options.loadContent,
      startTime,
      deadline,
      stuckDetector,
      specialistLifecycle,
      invalidateProjectGraphs,
      setReviewResult: (eid: string, result: ReviewResult) => setReviewResult(eid, result),
      onToolEvent: onToolEvent as CoordinatorContext['onToolEvent'],
      onProgress: onProgress as CoordinatorContext['onProgress'],
      onContentChunk,
      onReasoningChunk: options.onReasoningChunk,
      signal: options.signal,
    };

    // ── Agent loop ────────────────────────────────────────────────────
    while (!skippedLoop && iteration < MAX_ITERATIONS) {
      const toolCallsAtIterationStart = totalToolCalls;
      const changesAtIterationStart = accumulatedChanges.length;
      mutatingAttemptedThisIteration = false;
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

      // ── Microcompaction: structured hot-tail / cold-storage compression ──
      // Replaces ad-hoc head/tail truncation with tool-aware summaries.
      // Full content is stored in toolOutputCache for retrieval on re-read.
      if (AI_FEATURES.microcompaction && iteration >= 2) {
        const HOT_TAIL_COUNT = 4;
        microcompactToolResults(messages, HOT_TAIL_COUNT, toolOutputCache, toolSummaryLog, microcompactionStats);
        if (microcompactionStats.coldCount > 0) {
          console.log(`[V2] Microcompaction: ${microcompactionStats.coldCount} cold, ~${microcompactionStats.tokensSaved} tokens saved`);
        }
      } else if (!AI_FEATURES.microcompaction) {
        // Legacy fallback: ad-hoc compression when microcompaction is disabled
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

      // Signal truncation to the model so it knows context was lost
      if (budgeted.budgetTruncated && !truncationSignalSent) {
        budgeted.messages.push({
          role: 'user',
          content: '[SYSTEM] Context was truncated to fit the token budget. Some earlier messages were removed. If you need file content from earlier, re-read with read_lines or use refresh_memory_anchor.',
        } as AIMessage);
        truncationSignalSent = true;
      } else if (!budgeted.budgetTruncated) {
        truncationSignalSent = false;
      }

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
      iterToolResults = new Map<string, { content: string; is_error?: boolean; isPTC?: boolean }>();
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
            // In God Mode certain tools are hard-blocked.
            if (currentStrategy === 'GOD_MODE') {
              const GOD_MODE_HARD_BLOCKED = new Set([
                'propose_code_edit',
                'grep_content',
                'search_files',
                'run_specialist',
                'parallel_batch_read',
              ]);

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
            }

            // ── search_replace → edit_lines auto-conversion (ALL modes) ───
            // Line-number edits are more reliable than text matching.
            // When old_text can be found in the file, convert to edit_lines
            // with exact line numbers. Falls back to search_replace gracefully.
            if (event.name === 'search_replace') {
              const srFilePath = String(event.input?.filePath ?? event.input?.file_path ?? '');
              const oldText = String(event.input?.old_text ?? '');
              const newText = String(event.input?.new_text ?? '');

              const matchedFile = allFiles.find(f =>
                f.fileName === srFilePath || f.path === srFilePath
                || f.fileName.endsWith('/' + srFilePath) || f.path?.endsWith('/' + srFilePath),
              );

              let fileContent = matchedFile?.content ?? '';
              if (fileStore && matchedFile && (!fileContent || fileContent.startsWith('['))) {
                try {
                  const hydrated = await fileStore.read(matchedFile.fileId);
                  if (hydrated?.content) fileContent = hydrated.content;
                } catch (err) {
                  console.error(`[V2] FileStore read failed for file ${matchedFile.fileId} during search_replace conversion:`, err);
                }
              }
              const lineCount = fileContent ? fileContent.split('\n').length : 0;

              let converted = false;
              if (fileContent && oldText && lineCount > 0) {
                const idx = fileContent.indexOf(oldText);
                if (idx !== -1) {
                  const startLine = fileContent.slice(0, idx).split('\n').length;
                  const endLine = startLine + oldText.split('\n').length - 1;
                  console.log(`[V2] Auto-converting search_replace → edit_lines (${srFilePath} L${startLine}-${endLine})`);

                  (event as Record<string, unknown>).name = 'edit_lines';
                  event.input = {
                    filePath: srFilePath,
                    startLine,
                    endLine,
                    newContent: newText,
                    mode: 'replace',
                    reasoning: `Auto-converted from search_replace`,
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
                console.log(`[V2] search_replace fallback (${srFilePath}) — ${detail}`);
                onProgress?.({
                  type: 'thinking',
                  phase: 'tool_execution',
                  label: `Using search_replace fallback (${detail})`,
                });
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
        const { parallel, sequential } = groupByFileOwnership(pendingServerTools, files);

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

        // executeServerTools → coordinator-tools.ts
        await executeServerTools(parallel, sequential, loopState, coordCtx, worktreeIds, maxParallel);
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

      // executePTCTools → coordinator-tools.ts
      if (pendingPTCTools.length > 0) {
        await executePTCTools(pendingPTCTools, loopState, coordCtx);
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
      } catch { /* getUsage may fail if stream errored */ }

      onProgress?.({
        type: 'token_budget_update',
        used: totalInputTokens + totalOutputTokens,
        remaining: Math.max(0, MAX_ITERATIONS * 4096 - (totalInputTokens + totalOutputTokens)),
        iteration,
      });

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
            if (budgeted.budgetTruncated && !truncationSignalSent) {
              budgeted.messages.push({
                role: 'user',
                content: '[SYSTEM] Context was truncated to fit the token budget. Some earlier messages were removed. Re-read files with read_lines if needed.',
              } as AIMessage);
              truncationSignalSent = true;
            }
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
      const validation = await validateCodeChanges(accumulatedChanges, allFiles, {
        designTokens: { projectId },
        timeoutMs: 2000,
      });

      // Fire-and-forget: record drift events for design_token issues (Phase 8c)
      if (projectId) {
        const designTokenIssues = validation.issues.filter((i) => i.category === 'design_token');
        if (designTokenIssues.length > 0) {
          import('@/lib/design-tokens/drift-events').then(({ upsertDriftEvent }) => {
            const varMatch = /var\(--([\w-]+)\)/;
            for (const issue of designTokenIssues) {
              const expectedToken = issue.description?.match(varMatch)?.[1];
              const hardcodedMatch = issue.description?.match(/hardcoded "([^"]+)"/);
              const hardcodedValue = hardcodedMatch?.[1] ?? 'unknown';
              upsertDriftEvent(projectId, issue.file, hardcodedValue, expectedToken);
            }
          }).catch(() => {});
        }
      }

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

      // Fire-and-forget: track token usages in changed files (Phase 8a)
      if (intentMode === 'code' && projectId) {
        import('@/lib/design-tokens/post-edit-tracking').then(({ trackTokenUsagesAfterEdit }) => {
          trackTokenUsagesAfterEdit(projectId, accumulatedChanges, allFiles).catch((err) =>
            console.warn('[V2] Token usage tracking failed:', err),
          );
        });
        // Fire-and-forget: mark tokens stale if token source files changed (Phase 8b)
        import('@/lib/design-tokens/stale-detection').then(({ checkAndMarkStale }) => {
          const changedPaths = accumulatedChanges.map((c) => c.fileName);
          checkAndMarkStale(projectId, changedPaths);
        });
      }
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

    // Fire-and-forget: record tier-level telemetry (including edit metrics)
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
      editAttempts,
      editFirstPassSuccess,
      avgCascadeDepth: cascadeDepthCount > 0 ? cascadeDepthSum / cascadeDepthCount : undefined,
      editToolDistribution: Object.keys(editToolDistribution).length > 0 ? editToolDistribution : undefined,
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
      byPhase: (['pm', 'specialist', 'review'] as const).reduce<Record<string, { totalCostCents: number; calls: number; models: string[] }>>((acc, phase) => {
        const phaseEvents = costEvents.filter(e => e.phase === phase);
        if (phaseEvents.length > 0) {
          acc[phase] = {
            totalCostCents: phaseEvents.reduce((sum, e) => sum + (e.costCents ?? 0), 0),
            calls: phaseEvents.length,
            models: [...new Set(phaseEvents.map(e => e.modelId).filter(Boolean) as string[])],
          };
        }
        return acc;
      }, {}),
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
    const v2FlushResult = await fileStore?.flush().catch(() => ({ failedFileIds: [] as string[] }));
    if (v2FlushResult && v2FlushResult.failedFileIds.length > 0) {
      console.error(`[V2] ${v2FlushResult.failedFileIds.length} file(s) failed to save during error flush`);
    }

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
              analysis: `Interrupted: ${classifiedError.message}`,
            },
            dirtyIds,
            [],
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
          analysis: 'Execution interrupted and resumed in background.',
          needsClarification: false,
          directStreamed: true,
          checkpointed: true,
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

// synthesizeBatchAsStream → moved to coordinator-stream.ts

// ── Re-exports for backward compatibility ───────────────────────────────────
export { resetV2StreamHealth } from './coordinator-stream';
export { compressOldToolResults } from './coordinator-helpers';
export type { ReferentialArtifact } from './coordinator-types';
export { extractTargetRegion } from './tools/region-extractor';
export { parseReviewToolContent } from './tools/review-parser';
export type { ToolEndEvent } from './coordinator-tools';
