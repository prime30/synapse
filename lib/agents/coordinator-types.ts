/**
 * Shared types for the V2 coordinator.
 *
 * LoopState wraps all mutable state that lives inside the streamV2 main loop
 * and is captured by executeOneServerTool and other inner functions. Bundling
 * them in an object lets those functions be extracted to module-level while
 * still mutating the same state (JS primitives are pass-by-value, but object
 * properties are not).
 *
 * CoordinatorContext bundles read-only dependencies that the extracted
 * functions need but never mutate.
 */

import type {
  CodeChange,
  FileContext,
  ReviewResult,
  OrchestrationActivitySignal,
  ScoutBrief,
  RoutingTier,
  UserPreference,
} from '@/lib/types/agent';
import type {
  AIMessage,
  ToolResult,
  ToolDefinition,
} from '@/lib/ai/types';
import type { MicrocompactionStats } from './microcompaction';
import type { UnifiedToolContext } from './tools/dispatcher';
import type { ContextEngine } from '@/lib/ai/context-engine';
import type { StuckDetector } from './stuck-detector';
import type { SpecialistLifecycleTracker } from './specialist-lifecycle';
import type { FileStore } from './tools/file-store';
import type { LoadContentFn } from '@/lib/supabase/file-loader';

// ── Execution types ──────────────────────────────────────────────────────────

export type ExecutionPhase = 'resolveIntent' | 'buildPatch' | 'applyPatch' | 'verify' | 'complete';

export type ExecutionStrategy = 'SIMPLE' | 'HYBRID' | 'GOD_MODE';

export interface MutationFailure {
  toolName: 'search_replace' | 'write_file' | 'propose_code_edit' | 'create_file';
  filePath: string;
  reason: 'old_text_not_found' | 'file_not_found' | 'validation_error' | 'unknown';
  attemptedOldText?: string;
  attemptCount: number;
  fileLineCount?: number;
}

// ── LoopState ────────────────────────────────────────────────────────────────

/**
 * All mutable state inside the streamV2 main loop.
 *
 * Bundling these in an object lets inner functions be extracted to
 * module-level while still mutating the same state (JS primitives are
 * pass-by-value, but object properties are not).
 */
export interface LoopState {
  // ── Scalar counters & flags ───────────────────────────────────────────────

  /** Current loop iteration (0-indexed) */
  iteration: number;
  /** Accumulated assistant text output */
  fullText: string;
  /** Total tool calls executed this run */
  totalToolCalls: number;
  /** Whether any mutating tool has been attempted */
  hasAttemptedEdit: boolean;
  /** Current execution phase within the loop */
  executionPhase: ExecutionPhase;
  /** Incremented on specialist/context changes to invalidate lookup caches */
  contextVersion: number;
  /** Consecutive failed mutations (search_replace, propose_code_edit) */
  failedMutationCount: number;
  /** Consecutive debug-fix attempts in the current run */
  debugFixAttemptCount: number;
  /** Lookup tools blocked before first edit */
  preEditLookupBlockedCount: number;
  /** Whether a mutating tool was attempted this iteration (reset each iter) */
  mutatingAttemptedThisIteration: boolean;
  /** Force-block lookup tools until an edit succeeds */
  forceNoLookupUntilEdit: boolean;
  /** Count of on-demand file reads (not from preload) */
  filesReadOnDemand: number;
  /** How many times review was rejected without new changes */
  consecutiveReviewRejections: number;
  /** accumulatedChanges.length at the last review rejection */
  changesAtLastReviewRejection: number;
  /** Details of the most recent failed mutation attempt */
  lastMutationFailure: MutationFailure | null;
  /** Parsed result from the latest run_review call */
  latestReviewResult: ReviewResult | undefined;
  /** Whether the agent is requesting user clarification */
  needsClarification: boolean;
  /** Whether clarification includes structured options */
  hasStructuredClarification: boolean;
  /** Cumulative input tokens across all LLM calls */
  totalInputTokens: number;
  /** Cumulative output tokens across all LLM calls */
  totalOutputTokens: number;
  /** Cumulative cache-read tokens (Anthropic prompt caching) */
  totalCacheReadTokens: number;
  /** Cumulative cache-write tokens (Anthropic prompt caching) */
  totalCacheWriteTokens: number;
  /** PTC container ID reused across iterations */
  ptcContainerId: string | undefined;
  /** Escalation message from specialist reaction rules */
  reactionEscalationMessage: string | null;
  /** Timestamp of first streaming token (ms since epoch) */
  firstTokenMs: number;
  /** Consecutive iterations after an edit with no new changes */
  postEditNoChangeIterations: number;
  /** Consecutive iterations with zero tool calls */
  zeroToolIterationStreak: number;
  /** Consecutive read-only iterations (no mutating tool) */
  readOnlyIterationCount: number;
  /** Number of stuck-detection recoveries executed */
  stuckRecoveryCount: number;
  /** Number of premature-stop nudges injected */
  prematureStopNudges: number;
  /** Total edit tool invocations */
  editAttempts: number;
  /** Edits that succeeded on first replacer tier */
  editFirstPassSuccess: number;
  /** Sum of replacer cascade depths (for averaging) */
  cascadeDepthSum: number;
  /** Count of cascade depth measurements */
  cascadeDepthCount: number;
  /** Whether the finalization nudge has been sent */
  finalizationNudgeSent: boolean;
  /** Number of enact-enforcement nudges injected */
  enactEnforcementCount: number;
  /** Number of first-edit SLA nudges injected */
  firstEditSlaNudges: number;
  /** Iteration at which the last verification was injected */
  lastVerificationIteration: number;
  /** Total verification injections this run */
  totalVerificationInjections: number;
  /** Number of rethink cycles after review rejection */
  rethinkCount: number;
  /** Iteration at which the last proactive memory anchor was injected */
  lastProactiveAnchorIteration: number;
  /** Whether the main loop was skipped (e.g. referential short-circuit) */
  skippedLoop: boolean;
  /** Baseline theme-check error count (pre-edit) */
  baselineErrorCount: number;
  /** Maximum iterations for this run (may be adjusted dynamically) */
  MAX_ITERATIONS: number;
  /** Current execution strategy (may upgrade mid-run) */
  currentStrategy: ExecutionStrategy;
  /** Number of referential artifacts replayed */
  replayAppliedCount: number;
  /** Source execution ID for replayed artifacts */
  replaySource: string | undefined;
  /** Lookup tool budget before first edit */
  preEditLookupBudget: number;
  /** Threshold before lookup tools are blocked pre-edit */
  preEditBlockThreshold: number;

  // ── Collections ───────────────────────────────────────────────────────────

  /** Tool results for the current iteration (cleared each iter) */
  iterToolResults: Map<string, { content: string; is_error?: boolean; isPTC?: boolean }>;
  /** Set of file paths/ids that have been read this run */
  readFiles: Set<string>;
  /** Set of search queries already executed */
  searchedFiles: Set<string>;
  /** fileId/path -> FileContext for files loaded into context */
  preloadedMap: Map<string, FileContext>;
  /** The LLM conversation history (mutated in place) */
  messages: AIMessage[];
  /** Ordered list of tool names called */
  toolSequenceLog: string[];
  /** lookup-signature -> contextVersion when last called */
  lookupCallVersion: Map<string, number>;
  /** lookup-signature -> cached result with version */
  lookupResultCache: Map<string, { version: number; content: string; is_error?: boolean }>;
  /** Tool output cache for microcompaction rehydration */
  toolOutputCache: Map<string, string>;
  /** read_lines signature -> call count (for duplicate detection) */
  readLinesRangeCallCount: Map<string, number>;
  /** Aggregated microcompaction statistics */
  microcompactionStats: MicrocompactionStats;
  /** Code changes accumulated this run (persists across checkpoint resume) */
  accumulatedChanges: CodeChange[];
  /** file -> set of "lines N-M" descriptors for memory anchors */
  fileReadLog: Map<string, Set<string>>;
  /** file -> edit count for memory anchors */
  fileEditLog: Map<string, number>;
  /** toolCallId -> summary string for memory anchors */
  toolSummaryLog: Map<string, string>;
  /** Files forced to propose_code_edit after mutation failures */
  proposeOnlyFiles: Set<string>;
  /** Tool name -> count for edit tool usage tracking */
  editToolDistribution: Record<string, number>;
  /** file -> consecutive verify failure count */
  consecutiveVerifyFailures: Map<string, number>;
  /** fileId -> original content for undo_edit */
  revertHistory: Map<string, string>;
  /** Orchestration activity signals for telemetry */
  orchestrationSignals: OrchestrationActivitySignal[];
  /** Queued reaction instructions from specialist lifecycle */
  queuedReactionInstructions: string[];
}

// ── CoordinatorContext ────────────────────────────────────────────────────────

/** Progress event shape emitted during execution */
export interface ProgressEvent {
  type: 'thinking' | 'tool_progress';
  phase?: string;
  label?: string;
  detail?: string;
  [key: string]: unknown;
}

/** Tool event shape emitted for tool SSE events */
export interface ToolEvent {
  type: 'tool_call' | 'tool_result' | 'tool_start' | 'tool_error' | 'tool_progress';
  name: string;
  id?: string;
  toolCallId?: string;
  input?: Record<string, unknown>;
  result?: string;
  data?: Record<string, unknown>;
  isError?: boolean;
  error?: string;
  recoverable?: boolean;
  netZero?: boolean;
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
  [key: string]: unknown;
}

/** Deadline tracker shape returned by createDeadlineTracker */
export interface DeadlineTracker {
  remainingMs: () => number;
  shouldCheckpoint: (safetyMarginMs?: number) => boolean;
}

/**
 * Read-only dependencies needed by extracted coordinator functions.
 *
 * These are set once at the start of streamV2 and never mutated during the
 * loop — safe to pass by reference without LoopState wrapping.
 */
export interface CoordinatorContext {
  // ── Identity & routing ────────────────────────────────────────────────────

  /** The original user request text */
  userRequest: string;
  /** Unique execution ID for this agent run */
  executionId: string;
  /** Project ID */
  projectId: string;
  /** Authenticated user ID */
  userId: string;
  /** Routing tier from classification */
  tier: RoutingTier;
  /** Resolved model identifier */
  model: string;
  /** AI provider name (anthropic, openai, etc.) */
  providerName: string;
  /** Current intent mode (ask, code, plan, debug) */
  intentMode: string;
  /** Whether the prompt references prior artifacts */
  referentialCodePrompt: boolean;
  /** Artifacts from a prior execution for replay */
  referentialArtifacts: ReferentialArtifact[];

  // ── Context data ──────────────────────────────────────────────────────────

  /** Unified tool execution context (store, supabase, project, etc.) */
  unifiedCtx: UnifiedToolContext;
  /** All files in the project (filtered for the pipeline) */
  files: FileContext[];
  /** All files including filtered-out ones */
  allFiles: FileContext[];
  /** Files preloaded into context */
  preloaded: FileContext[];
  /** Structural brief from theme intelligence map */
  currentScoutBrief: ScoutBrief | undefined;
  /** User-set preferences for this project */
  userPreferences: UserPreference[];
  /** Computed design context (style profile) */
  designContext: string | undefined;
  /** Project context engine instance */
  contextEngine: ContextEngine;
  /** FileStore for file reads/writes */
  fileStore: FileStore;
  /** loadContent function for hydrating file stubs */
  loadContent?: LoadContentFn;

  // ── Timing & limits ───────────────────────────────────────────────────────

  /** Timestamp when the run started (ms since epoch) */
  startTime: number;
  /** Deadline tracker for checkpoint timing */
  deadline: DeadlineTracker;

  // ── Agent subsystems ──────────────────────────────────────────────────────

  /** Stuck detection engine */
  stuckDetector: StuckDetector;
  /** Specialist lifecycle tracker */
  specialistLifecycle: SpecialistLifecycleTracker;
  /** Invalidate dependency/symbol graph caches */
  invalidateProjectGraphs: () => void;
  /** Persist review result to execution store */
  setReviewResult: (executionId: string, result: ReviewResult) => void;

  // ── Callbacks ─────────────────────────────────────────────────────────────

  onToolEvent?: (event: ToolEvent) => void;
  onProgress?: (event: ProgressEvent) => void;
  onContentChunk?: (chunk: string) => void;
  onReasoningChunk?: (agent: string, chunk: string) => void;
  /** Abort signal for client disconnect */
  signal?: AbortSignal;
}

/**
 * Referential artifact from a prior execution.
 * Moved here from coordinator-v2.ts for shared access.
 */
export interface ReferentialArtifact {
  filePath: string;
  newContent: string;
  reasoning?: string;
  capturedAt?: string;
  checksum?: string;
  confidence?: number;
  sourceExecutionId?: string;
}

// ── Memory Anchor Context ────────────────────────────────────────────────────

/** Read-only data needed by buildMemoryAnchor */
export interface MemoryAnchorCtx {
  fileReadLog: Map<string, Set<string>>;
  fileEditLog: Map<string, number>;
  toolSequenceLog: string[];
  toolSummaryLog: Map<string, string>;
  accumulatedChanges: CodeChange[];
  userRequest: string;
}
