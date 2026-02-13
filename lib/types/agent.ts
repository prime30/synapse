/** Agent type identifiers for the multi-agent orchestration system */
export type AgentType = 'project_manager' | 'liquid' | 'javascript' | 'css' | 'json' | 'review';

/** Message types exchanged between agents via the coordinator */
export type MessageType = 'task' | 'result' | 'error' | 'question';

/** Severity levels for review issues */
export type IssueSeverity = 'error' | 'warning' | 'info';

/** Execution status for agent runs */
export type ExecutionStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

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

/** A proposed code change from a specialist agent */
export interface CodeChange {
  fileId: string;
  fileName: string;
  originalContent: string;
  proposedContent: string;
  reasoning: string;
  agentType: AgentType;
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
  error?: AgentError;
  /** p0: Scope Assessment Gate — PM signals the request needs clarification */
  needsClarification?: boolean;
  /** p0: Testing Always First — signal to inject "Verify this works" chip */
  suggestVerification?: boolean;
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
  user_request: string;
  status: 'completed' | 'failed';
  execution_log: AgentMessage[];
  proposed_changes: CodeChange[];
  review_result: ReviewResult | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}
