/** Agent type identifiers for the multi-agent orchestration system */
export type AgentType = 'project_manager' | 'liquid' | 'javascript' | 'css' | 'json' | 'schema' | 'review' | 'general' | 'general_1' | 'general_2' | 'general_3' | 'general_4';

/** Routing tier for smart request classification */
export type RoutingTier = 'TRIVIAL' | 'SIMPLE' | 'COMPLEX' | 'ARCHITECTURAL';

/** Message types exchanged between agents via the coordinator */
export type MessageType = 'task' | 'result' | 'error' | 'question';

/** Severity levels for review issues */
export type IssueSeverity = 'error' | 'warning' | 'info';

/** Execution status for agent runs */
export type ExecutionStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'awaiting_approval';

/** Structured orchestration signal types emitted during PM/specialist execution. */
export type OrchestrationSignalType =
  | 'specialist_dispatched'
  | 'specialist_started'
  | 'specialist_completed'
  | 'specialist_failed'
  | 'specialist_reaction'
  | 'specialist_escalated'
  | 'review_started'
  | 'review_completed';

/** Typed activity signal used for PM decisions and UI telemetry. */
export interface OrchestrationActivitySignal {
  type: OrchestrationSignalType;
  agent: AgentType | 'review';
  timestampMs: number;
  details?: Record<string, unknown>;
}

/** A message exchanged between agents through the coordinator */
export interface AgentMessage {
  id: string;
  executionId: string;
  fromAgent: AgentType;
  toAgent: AgentType | 'coordinator';
  messageType: MessageType;
  payload: {
    instruction?: string;
    changes?: CodeChange[];
    context?: FileContext[];
    error?: AgentError;
    question?: string;
  };
  timestamp: Date;
}

/** A targeted search/replace patch for a code change */
export interface CodePatch {
  /** The exact text to find in the original file */
  search: string;
  /** The replacement text */
  replace: string;
}

/** A proposed code change from a specialist agent */
export interface CodeChange {
  fileId: string;
  fileName: string;
  originalContent: string;
  proposedContent: string;
  /** Targeted search/replace patches (optional; proposedContent is reconstructed from these) */
  patches?: CodePatch[];
  reasoning: string;
  agentType: AgentType;
  /** Agent's confidence in this change (0-1). Below 0.7 shown as "Suggestion". */
  confidence?: number;
  /** Optional line range for scoped apply — only lines startLine–endLine are replaced. */
  range?: { startLine: number; endLine: number };
}

/**
 * Apply search/replace patches to original content using exact literal matching (indexOf + slice).
 * Skips patches whose search string is not found (logs a warning instead of failing).
 * Always returns the result — even if some patches fail.
 */
export function applyPatches(original: string, patches: CodePatch[]): string {
  let result = original;
  for (const patch of patches) {
    const idx = result.indexOf(patch.search);
    if (idx === -1) {
      console.warn(`[applyPatches] Search string not found, skipping patch (first 80 chars): ${patch.search.slice(0, 80)}`);
      continue;
    }
    result = result.slice(0, idx) + patch.replace + result.slice(idx + patch.search.length);
  }
  return result;
}

/** File context provided to agents for awareness */
export interface FileContext {
  fileId: string;
  fileName: string;
  fileType: 'liquid' | 'javascript' | 'css' | 'other';
  content: string;
  /** Theme-relative path (e.g. sections/header.liquid) for theme structure awareness */
  path?: string;
}

/** Element metadata extracted from Shopify preview selection for smart file auto-selection */
export interface ElementHint {
  /** Normalized section ID (e.g., "featured-collection") */
  sectionId?: string;
  /** Raw data-section-type value */
  sectionType?: string;
  /** Block ID if applicable */
  blockId?: string;
  /** Element ID attribute */
  elementId?: string;
  /** Filtered CSS classes (excluding shopify-/js-/no- prefixes) */
  cssClasses?: string[];
  /** CSS selector path */
  selector?: string;
}

/** Error reported by an agent */
export interface AgentError {
  code: string;
  message: string;
  agentType: AgentType;
  recoverable: boolean;
}

/** Full context passed to an agent for execution */
export interface AgentContext {
  executionId: string;
  projectId: string;
  userId: string;
  userRequest: string;
  files: FileContext[];
  userPreferences: UserPreference[];
  conversationHistory?: AgentMessage[];
  /** Cross-file dependency summary from the context system (REQ-5) */
  dependencyContext?: string;
  /** Design system token context for design-aware code generation (REQ-52) */
  designContext?: string;
  /** Live DOM context from the Shopify preview bridge (app elements, selectors, styles) */
  domContext?: string;
  /** Developer memory context (conventions, decisions, preferences) from EPIC 14 */
  memoryContext?: string;
  /** Liquid diagnostic context (errors/warnings from TypeChecker + AST parser) for agent awareness */
  diagnosticContext?: string;
}

/** A task delegated from the PM to a specialist */
export interface DelegationTask {
  agent: AgentType;
  task: string;
  affectedFiles: string[];
  preferences?: string[];
}

/** Task input for an agent */
export interface AgentTask {
  executionId: string;
  instruction: string;
  context: AgentContext;
  delegations?: DelegationTask[];
}

/** Result output from an agent */
export interface AgentResult {
  agentType: AgentType;
  success: boolean;
  changes?: CodeChange[];
  delegations?: DelegationTask[];
  reviewResult?: ReviewResult;
  analysis?: string;
  /** Overall confidence in the result (0-1). Low confidence triggers review prompt. */
  confidence?: number;
  error?: AgentError;
  /** p0: Scope Assessment Gate — PM signals the request needs clarification */
  needsClarification?: boolean;
  /** p0: Testing Always First — signal to inject "Verify this works" chip */
  suggestVerification?: boolean;
  /** PM's self-assessed routing tier (may trigger tier escalation). */
  selfAssessedTier?: string;
  /** Whether the PM used exploration tools before producing its JSON decision. */
  pmUsedTools?: boolean;
  /** True when content was streamed directly to the client (no summary needed). */
  directStreamed?: boolean;
  /** Token usage breakdown for the request (v2 coordinator). */
  usage?: {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCacheReadTokens?: number;
    totalCacheWriteTokens?: number;
    model: string;
    provider: string;
    tier: string;
    phaseDiagnostics?: {
      finalPhase: string;
      referentialMode?: boolean;
      applyAttempted?: boolean;
      replayArtifactsResolved?: number;
      replayAppliedCount?: number;
      replaySource?: string;
      sessionId?: string;
    };
  };
}

/** In-memory state for an active execution */
export interface ExecutionState {
  executionId: string;
  projectId: string;
  userId: string;
  userRequest: string;
  status: ExecutionStatus;
  activeAgents: Set<AgentType>;
  completedAgents: Set<AgentType>;
  messages: AgentMessage[];
  proposedChanges: Map<AgentType, CodeChange[]>;
  reviewResult?: ReviewResult;
  startedAt: Date;
  completedAt?: Date;
}

/** Result of the review agent's analysis */
export interface ReviewResult {
  approved: boolean;
  issues: ReviewIssue[];
  summary: string;
}

/** A specific issue found by the review agent */
export interface ReviewIssue {
  severity: IssueSeverity;
  file: string;
  line?: number;
  description: string;
  suggestion?: string;
  category: 'syntax' | 'truncation' | 'breaking_change' | 'consistency' | 'security';
}

/** A learned coding pattern from user approvals */
export interface LearnedPattern {
  pattern: string;
  fileType?: string;
  example?: string;
  reasoning?: string;
}

/** A user preference stored in the database */
export interface UserPreference {
  id: string;
  user_id: string;
  category: string;
  key: string;
  value: string;
  file_type: string | null;
  confidence: number;
  first_observed: string;
  last_reinforced: string;
  observation_count: number;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

/** An opportunity to standardize patterns across files */
export interface StandardizationOpportunity {
  pattern: string;
  currentVariations: string[];
  suggestedStandard: string;
  affectedFiles: string[];
  reasoning: string;
}

/** Persisted execution record in the database */
export interface AgentExecution {
  id: string;
  project_id: string;
  user_id: string;
  session_id: string | null;
  user_request: string;
  status: 'completed' | 'failed';
  execution_log: AgentMessage[];
  proposed_changes: CodeChange[];
  review_result: ReviewResult | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}
