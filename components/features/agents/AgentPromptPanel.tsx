'use client';

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChatInterface } from '@/components/ai-sidebar/ChatInterface';
import type { ContentBlock } from '@/components/ai-sidebar/ChatInterface';
import type { ThinkingStep } from '@/components/ai-sidebar/ThinkingBlock';
import { ContextPanel } from '@/components/ai-sidebar/ContextPanel';
import { SessionSidebar } from '@/components/ai-sidebar/SessionSidebar';
import { TrainingReviewPanel } from '@/components/ai-sidebar/TrainingReviewPanel';
import { PromptTemplateLibrary } from '@/components/ai-sidebar/PromptTemplateLibrary';
import type { AISidebarContextValue } from '@/hooks/useAISidebar';
import { emitPreviewSyncComplete } from '@/lib/preview/sync-listener';
import { useAgentChat } from '@/hooks/useAgentChat';
import { useAgentSettings, type IntentMode } from '@/hooks/useAgentSettings';
import { usePinnedPreferences } from '@/hooks/usePinnedPreferences';
import { useStyleProfile } from '@/hooks/useStyleProfile';
import { mapCoordinatorPhase } from '@/lib/agents/phase-mapping';
import type { SelectedElement } from '@/components/preview/PreviewPanel';
import type { ElementHint } from '@/lib/types/agent';
import { extractDecisionsFromChat, type ChatMessage as DecisionChatMessage } from '@/lib/ai/decision-extractor';
import {
  getContextualSuggestions,
  getResponseSuggestions,
  getArcSuggestion,
  type SuggestionContext,
  type Suggestion,
} from '@/lib/ai/prompt-suggestions';
import {
  recordAction,
  recordSuggestionUsed,
  detectActionType,
  getRecentActionTypes,
  getRecentlyShownIds,
  markSuggestionsShown,
  recordSuggestionsShown,
} from '@/lib/ai/action-history';
import { detectSignals, inferOutputMode, type OutputMode } from '@/lib/ai/signal-detector';
import { trimHistory } from '@/lib/ai/history-window';
import { detectFilePaths } from '@/lib/ai/file-path-detector';
import { getFirstChangedLineRange } from '@/lib/ai/diff-utils';
import { ConversationArc } from '@/lib/ai/conversation-arc';
import type { AIErrorCode } from '@/lib/ai/errors';
import { useFileTabs } from '@/hooks/useFileTabs';
import { useThemeHealth } from '@/hooks/useThemeHealth';
import { HealthFindingBar } from '@/components/ai-sidebar/HealthFindingBar';
import { BugReportModal } from '@/components/ai-sidebar/BugReportModal';
import { useAgentEdits } from '@/hooks/useAgentEdits';
import { LambdaDots } from '@/components/ui/LambdaDots';

// ── SSE event types ────────────────────────────────────────────────────────────

interface SSEErrorEvent {
  type: 'error';
  code: AIErrorCode;
  message: string;
  provider?: string;
  retryable?: boolean;
}

interface SSEDoneEvent {
  type: 'done';
}

interface SSETokenBudgetUpdateEvent {
  type: 'token_budget_update';
  used: number;
  remaining: number;
  iteration: number;
}

interface SSEContextFileLoadedEvent {
  type: 'context_file_loaded';
  path?: string;
  tokenCount?: number;
  loadedFiles?: number;
  loadedTokens?: number;
  totalFiles?: number;
}

interface SSEContentChunkEvent {
  type: 'content_chunk';
  chunk: string;
}

interface SSEThinkingEvent {
  type: 'thinking';
  phase: 'analyzing' | 'planning' | 'executing' | 'reviewing' | 'validating' | 'fixing' | 'change_ready' | 'clarification' | 'budget_warning' | 'reasoning' | 'complete';
  label: string;
  detail?: string;
  agent?: string;
  analysis?: string;
  summary?: string;
  subPhase?: string;
  metadata?: Record<string, unknown>;
}

interface SSEToolStartEvent {
  type: 'tool_start';
  name: string;
  id: string;
  reasoning?: string;
}

interface SSEToolCallEvent {
  type: 'tool_call';
  name: string;
  input: Record<string, unknown>;
}

interface SSEToolErrorEvent {
  type: 'tool_error';
  name: string;
  id: string;
  error: string;
  recoverable?: boolean;
}

interface SSEToolResultEvent {
  type: 'tool_result';
  name: string;
  id: string;
  netZero?: boolean;
  data?: Record<string, unknown>;
}

interface SSEToolProgressEvent {
  type: 'tool_progress';
  name: string;
  id: string;
  toolCallId: string;
  progress: {
    phase: string;
    detail: string;
    bytesProcessed?: number;
    totalBytes?: number;
    matchCount?: number;
    lineNumber?: number;
    percentage?: number;
  };
}

interface SSEDiagnosticsEvent {
  type: 'diagnostics';
  file?: string;
  errorCount?: number;
  warningCount?: number;
  detail?: string;
}

interface SSEWorkerProgressEvent {
  type: 'worker_progress';
  workerId: string;
  label: string;
  status: 'running' | 'complete' | 'dispatched' | 'started' | 'completed' | 'failed';
  files?: string[];
  metadata?: Record<string, unknown>;
}

interface SSEReasoningEvent {
  type: 'reasoning';
  agent: string;
  text: string;
}

interface SSEActiveModelEvent {
  type: 'active_model';
  model: string;
}

interface SSERateLimitedEvent {
  type: 'rate_limited';
  originalModel: string;
  fallbackModel: string;
}

interface SSEChangePreviewEvent {
  type: 'change_preview';
  executionId: string;
  sessionId?: string | null;
  projectId: string;
  checkpointId?: string;
  changes: {
    fileId: string;
    fileName: string;
    originalContent: string;
    proposedContent: string;
    reasoning: string;
  }[];
}

interface SSEExecutionOutcomeEvent {
  type: 'execution_outcome';
  executionId?: string;
  sessionId?: string | null;
  outcome: 'applied' | 'no-change' | 'blocked-policy' | 'needs-input';
  changedFiles?: number;
  needsClarification?: boolean;
  changeSummary?: string;
  rolledBack?: boolean;
}

interface SSEWorktreeStatusEvent {
  type: 'worktree_status';
  worktrees: Array<{ id: string; agentId: string; modifiedCount: number; createdCount: number }>;
  conflicts: Array<{ path: string }>;
}

interface SSEShopifyPushEvent {
  type: 'shopify_push';
  status: string;
}

interface SSECheckpointedEvent {
  type: 'checkpointed';
  metadata?: { executionId?: string; iteration?: number };
}

type SSEEvent = SSEShopifyPushEvent | SSEErrorEvent | SSEDoneEvent | SSEContentChunkEvent | SSEThinkingEvent | SSETokenBudgetUpdateEvent | SSEContextFileLoadedEvent | SSEToolStartEvent | SSEToolCallEvent | SSEToolErrorEvent | SSEToolResultEvent | SSEToolProgressEvent | SSEDiagnosticsEvent | SSEWorkerProgressEvent | SSEReasoningEvent | SSEActiveModelEvent | SSERateLimitedEvent | SSEChangePreviewEvent | SSEExecutionOutcomeEvent | SSEWorktreeStatusEvent | SSECheckpointedEvent;

/** User-friendly error messages mapped from error codes (client-side). */
const ERROR_CODE_MESSAGES: Record<string, string> = {
  RATE_LIMITED: 'The AI is temporarily busy. Retrying in a moment...',
  CONTEXT_TOO_LONG: 'Your files are too large for this model. Try selecting fewer files or switching to a model with a larger context window.',
  CONTENT_FILTERED: 'Your request was filtered by the AI safety system. Try rephrasing your message.',
  AUTH_ERROR: 'AI is not configured. Please ask your admin to add API keys in Settings.',
  MODEL_UNAVAILABLE: 'The selected AI model is currently unavailable. Try switching to a different model.',
  NETWORK_ERROR: 'Connection lost. Check your internet and try again.',
  TIMEOUT: 'The AI took too long to respond. Try a simpler request or try with a single agent (1x).',
  EMPTY_RESPONSE: 'The AI returned an empty response. Try again or rephrase your message.',
  PARSE_ERROR: 'Received an unexpected response from the AI. Please try again.',
  PROVIDER_ERROR: 'The AI service is experiencing issues. Please try again in a moment.',
  QUOTA_EXCEEDED: 'Your AI usage quota has been reached. Please upgrade your plan or wait for the quota to reset.',
  CONTEXT_TOO_LARGE: 'Request was too large. Retrying with reduced context...',
  SOLO_EXECUTION_FAILED: 'The AI agent encountered an error. Please try again or try with more agents.',
  UNKNOWN: 'Something went wrong. Please try again.',
};

/**
 * Parse SSE events from a stream chunk. The backend uses the SSE 'event:' field
 * to distinguish structured events from raw content:
 * - "event: synapse\ndata: {json}\n\n" → structured event
 * - "data: text\n\n" → raw content (no event field)
 *
 * This means NO whitelist is needed — any chunk with 'event: synapse' is an event.
 */
function parseSSEEvent(chunk: string): SSEEvent | null {
  // Check for the event: synapse prefix (proper SSE protocol)
  if (chunk.includes('event: synapse')) {
    const dataMatch = chunk.match(/data:\s*(\{.*\})/);
    if (dataMatch) {
      try {
        return JSON.parse(dataMatch[1]) as SSEEvent;
      } catch { /* malformed JSON */ }
    }
    return null;
  }

  // Legacy fallback: any data: {json} with a type field is an event
  // (for backward compatibility during transition)
  const match = chunk.match(/data:\s*(\{.*\})/);
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed && typeof parsed.type === 'string') {
        return parsed as SSEEvent;
      }
    } catch { /* not JSON */ }
  }

  return null;
}

/**
 * Split mixed stream input into parseable units while preserving chunk order.
 * - Complete SSE JSON frames (`data: {...}\n\n`) are emitted as standalone parts.
 * - Non-SSE text is emitted as raw parts.
 * - Incomplete trailing SSE frames are buffered in `remainder`.
 */
function splitStreamParts(input: string, carry: string): { parts: string[]; remainder: string } {
  const combined = carry + input;
  const parts: string[] = [];
  const eventRegex = /(?:event:\s*\S+\r?\n)?data:\s*\{[^\n]*\}\r?\n\r?\n/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = eventRegex.exec(combined)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (start > lastIndex) {
      parts.push(combined.slice(lastIndex, start));
    }
    parts.push(match[0]);
    lastIndex = end;
  }

  const tail = combined.slice(lastIndex);
  if (!tail) return { parts, remainder: '' };

  // Buffer a likely partial SSE frame at the end for the next read.
  // Look for incomplete frames starting with either "event:" or "data:" lines.
  const lastEventIdx = tail.lastIndexOf('event:');
  const lastDataIdx = tail.lastIndexOf('data:');
  const frameStart = lastEventIdx >= 0 && (lastDataIdx < 0 || lastEventIdx < lastDataIdx)
    ? lastEventIdx
    : lastDataIdx;
  if (frameStart >= 0) {
    const maybeFrame = tail.slice(frameStart);
    const hasJsonStart = maybeFrame.includes('{');
    const hasFrameEnd = /\r?\n\r?\n/.test(maybeFrame);
    if (hasJsonStart && !hasFrameEnd) {
      const prefix = tail.slice(0, frameStart);
      if (prefix) parts.push(prefix);
      return { parts, remainder: maybeFrame };
    }
    if (maybeFrame.startsWith('event:') && !maybeFrame.includes('data:')) {
      const prefix = tail.slice(0, frameStart);
      if (prefix) parts.push(prefix);
      return { parts, remainder: maybeFrame };
    }
  }

  parts.push(tail);
  return { parts, remainder: '' };
}

/** Auto-retryable codes (frontend will automatically retry once). */
const AUTO_RETRY_CODES = new Set<string>(['EMPTY_RESPONSE', 'RATE_LIMITED', 'CONTEXT_TOO_LARGE', 'TIMEOUT']);

// ── Token count tracking ──────────────────────────────────────────────────────

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/** Rough token estimation (~4 chars per token). */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ── Retry-with-context prefix ─────────────────────────────────────────────────

const RETRY_PREFIX = '[RETRY_WITH_FULL_CONTEXT]';

// ── Detect action from user prompt (for progress bar estimates) ───────────────

function detectPromptAction(prompt: string): string {
  const lower = prompt.toLowerCase();
  if (/\b(fix|debug|repair|resolve|patch|check|inspect)\b/.test(lower)) return 'fix';
  if (/\b(review|audit|scan)\b/.test(lower) && !/\b(fix|debug|repair|check)\b/.test(lower)) return 'review';
  if (/\b(refactor|clean|simplif|reorganiz)\b/.test(lower)) return 'refactor';
  if (/\b(explain|what|how|why|describe)\b/.test(lower)) return 'explain';
  if (/\b(plan|outline|design|architect)\b/.test(lower)) return 'plan';
  if (/\b(document|docs|comment|jsdoc)\b/.test(lower)) return 'document';
  if (/\b(summar)\b/.test(lower)) return 'summary';
  if (/\b(generate|create|build|add|make|write|implement)\b/.test(lower)) return 'generate';
  if (/\b(analyz)\b/.test(lower)) return 'analyze';
  return 'generate'; // default to generate for most prompts
}

/**
 * Decide whether preview/DOM context should be fetched before send.
 * This keeps normal code generation fast while still enabling preview-aware debugging.
 */
function shouldFetchPreviewContext(params: {
  intentMode: IntentMode;
  prompt: string;
  selectedElement: SelectedElement | null | undefined;
  hasAnnotation: boolean;
}): boolean {
  const { intentMode, prompt, selectedElement, hasAnnotation } = params;

  // Explicit UI context always opts in.
  if (selectedElement || hasAnnotation) return true;

  // Debug mode often needs runtime DOM state.
  if (intentMode === 'debug') return true;

  // Heuristic for preview/runtime-oriented asks in other modes.
  const lower = prompt.toLowerCase();
  return /\b(preview|dom|selector|css|console|layout|render|visible|browser|screenshot)\b/.test(lower);
}

// ── Element hint extraction ───────────────────────────────────────────────────

/**
 * Normalize a raw Shopify section ID by stripping common prefixes.
 * e.g. "shopify-section-header" → "header"
 * e.g. "template--17338826694973__featured_collection" → "featured_collection"
 */
function normalizeSectionId(raw: string): string {
  let id = raw.replace(/^shopify-section-/, '');
  const tplMatch = id.match(/^template--\d+__(.+)$/);
  if (tplMatch) id = tplMatch[1];
  return id;
}

/**
 * Extract Shopify-specific element metadata from a preview selection.
 * Returns undefined if no section/block context is found.
 */
function extractElementHint(el: SelectedElement | null | undefined): ElementHint | undefined {
  if (!el?.dataAttributes) return undefined;
  const attrs = el.dataAttributes;
  const rawSectionId = attrs['data-section-id'] || attrs['data-section-type'];

  // Fallback: parse parent section ID from the CSS selector
  const fallbackMatch = !rawSectionId ? el.selector?.match(/#shopify-section-([^\s>.]+)/) : null;
  const rawId = rawSectionId || fallbackMatch?.[1];
  if (!rawId) return undefined;

  return {
    sectionId: normalizeSectionId(rawId),
    sectionType: attrs['data-section-type'] || undefined,
    blockId: attrs['data-block-id'] || undefined,
    elementId: el.id || undefined,
    cssClasses: (el.classes || []).filter((c: string) => !/^shopify-|^js-|^no-/.test(c)).slice(0, 8),
    selector: el.selector || undefined,
  };
}

/**
 * Format a rich element context string for the AI prompt.
 * Includes section ID, classes, and file path hints.
 */
function formatElementContext(el: SelectedElement): string {
  const parts: string[] = [];
  parts.push(`Selector: ${el.selector}`);
  if (el.id) parts.push(`ID: ${el.id}`);

  const attrs = el.dataAttributes || {};
  const sectionId = attrs['data-section-id'];
  const sectionType = attrs['data-section-type'];
  const blockId = attrs['data-block-id'];
  if (sectionId) parts.push(`Section ID: ${sectionId}`);
  if (sectionType) parts.push(`Section type: ${sectionType}`);
  if (blockId) parts.push(`Block ID: ${blockId}`);

  if (!sectionId) {
    const m = el.selector?.match(/#shopify-section-([^\s>.]+)/);
    if (m) parts.push(`Parent section: ${m[1]}`);
  }

  const meaningful = (el.classes || []).filter((c: string) => !/^shopify-|^js-|^no-/.test(c));
  if (meaningful.length > 0) {
    parts.push(`Classes: ${meaningful.slice(0, 5).join(', ')}`);
  }

  const sid = sectionId ?? sectionType;
  if (sid) {
    const name = normalizeSectionId(sid).replace(/_/g, '-');
    parts.push(`Look in: sections/${name}.liquid, assets/section-${name}.css`);
  }

  return parts.join(' | ');
}

type ReferentialEditArtifact = {
  filePath: string;
  newContent: string;
  reasoning?: string;
  capturedAt: string;
};

function editArtifactStorageKey(projectId: string, sessionId: string): string {
  return `agent:referential-edits:${projectId}:${sessionId}`;
}

function persistReferentialEditArtifact(
  projectId: string,
  sessionId: string,
  edits: Array<{ filePath: string; newContent: string; reasoning?: string }>,
): void {
  if (typeof window === 'undefined' || !sessionId || edits.length === 0) return;
  const payload: ReferentialEditArtifact[] = edits
    .filter((e) => e.filePath?.trim() && e.newContent?.trim())
    .slice(0, 12)
    .map((e) => ({
      filePath: e.filePath.trim(),
      newContent: e.newContent,
      reasoning: e.reasoning,
      capturedAt: new Date().toISOString(),
    }));
  if (payload.length === 0) return;
  try {
    window.localStorage.setItem(
      editArtifactStorageKey(projectId, sessionId),
      JSON.stringify(payload),
    );
  } catch {
    // Best-effort client cache only.
  }
}

function loadReferentialEditArtifact(
  projectId: string,
  sessionId: string | null,
): ReferentialEditArtifact[] {
  if (typeof window === 'undefined' || !sessionId) return [];
  try {
    const raw = window.localStorage.getItem(editArtifactStorageKey(projectId, sessionId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ReferentialEditArtifact[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((e) => e.filePath && e.newContent);
  } catch {
    return [];
  }
}

interface AgentPromptPanelProps {
  projectId: string;
  context?: AISidebarContextValue;
  className?: string;
  selectedElement?: SelectedElement | null;
  onDismissElement?: () => void;
  /** Whether a Shopify store is connected */
  hasShopifyConnection?: boolean;
  /** Number of files in the project */
  fileCount?: number;
  /**
   * EPIC 1a: Callback to get DOM context from the preview panel.
   * Called with a 3s timeout before every agent send.
   * Returns an LLM-friendly formatted string, or empty string if unavailable.
   */
  getPreviewSnapshot?: () => Promise<string>;
  /** Called when user wants to apply a code block (from AI response) to a file */
  onApplyCode?: (code: string, fileId: string, fileName: string) => void;
  /** Called when user wants to save a code block as new file */
  onSaveCode?: (code: string, fileName: string) => void;
  /**
   * EPIC 2: Returns the full content of the active editor file.
   * Used by [RETRY_WITH_FULL_CONTEXT] to include file content in the request.
   */
  getActiveFileContent?: () => string | null;
  /** EPIC 2: Called with token usage stats after each response */
  onTokenUsage?: (usage: TokenUsage) => void;
  /** Returns current IDE context string for passive injection. Empty string = disabled. */
  getPassiveContext?: () => string;
  /** Called when user clicks a file path in an AI response to open it */
  onOpenFile?: (filePath: string) => void;
  /** Resolve a file path to a fileId for code block Apply. Returns null if not found. */
  resolveFileId?: (path: string) => string | null;
  /** Resolve a file path to its current content for diff views. Returns null if not found. */
  resolveFileContent?: (path: string) => string | null;
  /** EPIC 5: Ref to expose send function for QuickActions/Fix with AI. Parent can call sendMessageRef.current?.(prompt) */
  sendMessageRef?: React.MutableRefObject<((content: string) => void) | null>;
  /** Ref for parent to call when code is applied, so we can record diff stats on the active session. */
  onApplyStatsRef?: React.MutableRefObject<((stats: { linesAdded: number; linesDeleted: number; filesAffected: number }) => void) | null>;

  // ── Tool card handlers (wired from page.tsx) ──────────────────────────
  /** Called when user clicks "View Plan" — opens the plan file in an editor tab. */
  onOpenPlanFile?: (filePath: string) => void;
  /** Called when user clicks "Build" on a plan card. */
  onBuildPlan?: (checkedSteps: Set<number>) => void;
  /** Called when navigate_preview auto-navigates — sets preview path. */
  onNavigatePreview?: (path: string) => void;
  /** Called when user confirms a new file creation from create_file tool. */
  onConfirmFileCreate?: (fileName: string, content: string) => void;

  // ── EPIC V3: Preview verification ─────────────────────────────────────
  /** Capture a "before" DOM snapshot. Call before agent request. */
  captureBeforeSnapshot?: () => Promise<boolean>;
  /** Run preview verification after changes are applied. Returns regression result. */
  verifyPreview?: (projectId: string) => Promise<import('@/lib/agents/preview-verifier').PreviewVerificationResult | null>;

  // ── Quality gates: batch diff callback ──────────────────────────────
  /** Called with change data when agent completes with file changes, for BatchDiffModal. */
  onBatchDiff?: (data: { title: string; entries: Array<{ fileId: string; fileName: string; originalContent: string; newContent: string; description?: string }>; checkpointId?: string }) => void;
  /** Called when user clicks "Undo all changes" — restores from auto-checkpoint. */
  onUndoCheckpoint?: (checkpointId: string) => void;

  // ── Phase 3a: Preview annotation ────────────────────────────────────
  /** Pending annotation from the preview panel (region + note) */
  pendingAnnotation?: import('@/components/preview/PreviewAnnotator').AnnotationData | null;
  /** Clear the pending annotation after it's been consumed */
  onClearAnnotation?: () => void;

  // ── Phase 4a: Live preview hot-reload ──────────────────────────────
  /** Push a live change to the preview during streaming */
  onLiveChange?: (change: { filePath: string; newContent: string }) => void;
  /** Signal start of a new live preview session */
  onLiveSessionStart?: () => void;
  /** Signal end of a live preview session */
  onLiveSessionEnd?: () => void;

  // ── Agent Live Breakout: auto-open + auto-scroll ──────────────────
  /** Batch open files by path when agents identify affected files. */
  onOpenFiles?: (filePaths: string[]) => void;
  /** Scroll the main editor to a specific line in a file (after propose_code_edit). */
  onScrollToEdit?: (filePath: string, lineNumber: number) => void;
  /** Report active agent info for the breakout viewer. agentType=null means idle. */
  onAgentActivity?: (info: {
    agentType: string | null;
    agentLabel?: string;
    filePath: string | null;
    liveContent: string | null;
  }) => void;
  /** Push a file edit to the multi-pane code viewer below the preview. */
  onCodePaneUpdate?: (update: { filePath: string; content: string; originalContent: string }) => void;
  /** Reset the multi-pane code viewer (called at stream start). */
  onCodePaneReset?: () => void;
  /** Open Developer Memory panel (rendered by page shell). */
  onOpenMemory?: () => void;
  /** Whether Developer Memory panel is currently open. */
  isMemoryOpen?: boolean;
  /** External request to add a file as an attached chat context tag. */
  pendingAttachedFile?: { id: string; name: string; path: string; nonce: number } | null;
  /** Portal target for the session sidebar — rendered outside the chat column on the far right edge. */
  sessionSidebarPortalRef?: React.RefObject<HTMLDivElement | null>;
  /** Theme intelligence indexing status for non-blocking banner in ChatInterface. */
  intelligenceStatus?: 'pending' | 'indexing' | 'ready' | 'enriching' | 'stale';
}

export function AgentPromptPanel({
  projectId,
  context = { filePath: null, fileLanguage: null, selection: null },
  className = '',
  selectedElement,
  onDismissElement,
  hasShopifyConnection = false,
  fileCount = 0,
  getPreviewSnapshot,
  onApplyCode,
  onSaveCode,
  getActiveFileContent,
  onTokenUsage,
  getPassiveContext,
  onOpenFile,
  resolveFileId: resolveFileIdProp,
  resolveFileContent,
  sendMessageRef,
  onApplyStatsRef,
  onOpenPlanFile,
  onBuildPlan,
  onNavigatePreview,
  onConfirmFileCreate,
  captureBeforeSnapshot,
  verifyPreview,
  onBatchDiff,
  onUndoCheckpoint,
  pendingAnnotation,
  onClearAnnotation,
  onLiveChange,
  onLiveSessionStart,
  onLiveSessionEnd,
  onOpenFiles,
  onScrollToEdit,
  onAgentActivity,
  onCodePaneUpdate,
  onCodePaneReset,
  onOpenMemory,
  isMemoryOpen = false,
  pendingAttachedFile = null,
  sessionSidebarPortalRef,
  intelligenceStatus,
}: AgentPromptPanelProps) {
  const {
    messages,
    isLoadingHistory,
    historyLoadError,
    appendMessage,
    addLocalMessage,
    updateMessage,
    finalizeMessage,
    sessions,
    archivedSessions,
    activeSessionId,
    createNewSession,
    switchSession,
    deleteSession,
    renameSession,
    archiveSession,
    archiveAllSessions,
    unarchiveSession,
    loadMore,
    hasMore,
    isLoadingMore,
    loadAllHistory,
    isLoadingAllHistory,
    recordApplyStats,
    clearMessages,
    removeLastTurn,
    truncateAt,
    forkSession,
    reviewSessionTranscript,
    continueInNewChat,
  } = useAgentChat(projectId);

  const { specialistMode, model, intentMode, maxAgents, verbose, maxQuality, useFlatPipeline, setSpecialistMode, setModel, setIntentMode, setMaxAgents, setVerbose, setMaxQuality } = useAgentSettings();
  const pinnedPrefs = usePinnedPreferences(projectId);
  const { styleGuide } = useStyleProfile(projectId);

  const { openTabs: openTabIds } = useFileTabs({ projectId });

  const [isLoading, setIsLoading] = useState(false);
  const [isStopped, setIsStopped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const [lastResponseContent, setLastResponseContent] = useState<string | null>(null);
  const [showRetryChip, setShowRetryChip] = useState(false);
  const [outputMode, setOutputMode] = useState<OutputMode>('chat');
  const arcRef = useRef(new ConversationArc());
  const explicitSelectionRef = useRef(false);
  const [currentAction, setCurrentAction] = useState<string | undefined>();
  const [currentPhase, setCurrentPhase] = useState<string | undefined>();
  const [lastTrimmedCount, setLastTrimmedCount] = useState(0);
  const [lastHistorySummary, setLastHistorySummary] = useState<string | undefined>();
  const [templateLibraryOpen, setTemplateLibraryOpen] = useState(false);
  const [trainingPanelOpen, setTrainingPanelOpen] = useState(false);
  const [isReviewingTranscript, setIsReviewingTranscript] = useState(false);
  const [pushLog, setPushLog] = useState<Array<{
    id: string;
    pushedAt: string;
    trigger: string;
    note: string | null;
    fileCount: number;
  }>>([]);
  const [healthBarDismissed, setHealthBarDismissed] = useState(false);
  const [bugReportOpen, setBugReportOpen] = useState(false);
  const { scanResult, isScanning } = useThemeHealth({ projectId, enabled: true });
  const agentEdits = useAgentEdits();
  useEffect(() => {
    if (scanResult?.findings?.length) setHealthBarDismissed(false);
  }, [scanResult?.findings?.length]);
  const lastPromptRef = useRef<string>('');
  const autoRetryCountRef = useRef(0);

  // Image attachment: stores base64 + mimeType for the next stream request
  const pendingImageRef = useRef<{ base64: string; mimeType: string } | null>(null);

  const handleImageUpload = useCallback(async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ''),
    );
    pendingImageRef.current = { base64, mimeType: file.type };

    // Also get a text analysis via the upload endpoint for the message history
    const formData = new FormData();
    formData.append('image', file);
    formData.append('prompt', 'Describe this image concisely for a Shopify theme developer. Focus on visual elements, layout, colors, and UI components.');
    const res = await fetch('/api/agents/upload', { method: 'POST', body: formData });
    if (!res.ok) throw new Error('Image analysis failed');
    const json = await res.json();
    return json.data?.analysis ?? 'Image attached';
  }, []);

  useEffect(() => {
    if (!activeSessionId) return;
    const latestEdits =
      [...messages]
        .reverse()
        .find(
          (m) =>
            m.role === 'assistant' &&
            Array.isArray(m.codeEdits) &&
            m.codeEdits.length > 0,
        )?.codeEdits ?? [];
    if (latestEdits.length > 0) {
      persistReferentialEditArtifact(projectId, activeSessionId, latestEdits);
    }
  }, [messages, activeSessionId, projectId]);
  // When a timeout happens in multi-agent mode, retry once with 1x.
  const retrySubagentOverrideRef = useRef<number | null>(null);

  // Phase 3b: Attached files from chat drag-and-drop
  const attachedFilesRef = useRef<Array<{ id: string; name: string; path: string }>>([]);
  const handleAttachedFilesChange = useCallback((files: Array<{ id: string; name: string; path: string }>) => {
    attachedFilesRef.current = files;
  }, []);
  const thinkingStepsRef = useRef<import('@/components/ai-sidebar/ThinkingBlock').ThinkingStep[]>([]);
  const lastDecisionScanRef = useRef(0);
  const memoryWriteUnavailableRef = useRef(false);
  const workersRef = useRef<Array<{ workerId: string; label: string; status: string }>>([]);
  const [contextPressure, setContextPressure] = useState<{
    percentage: number;
    level: 'warning' | 'critical';
    usedTokens: number;
    maxTokens: number;
  } | null>(null);

  const [activeSpecialists, setActiveSpecialists] = useState<
    Map<
      string,
      {
        id: string;
        type: string;
        label: string;
        status: 'running' | 'complete' | 'failed';
        files: string[];
        startedAt: number;
      }
    >
  >(new Map());

  useEffect(() => {
    memoryWriteUnavailableRef.current = false;
  }, [projectId]);

  // Stall detection refs
  const lastSSEEventTimeRef = useRef<number>(Date.now());
  const stallTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stallWarningEmittedRef = useRef(false);
  const stallAlertEmittedRef = useRef(false);

  // Content debounce refs
  const contentBufferRef = useRef<string>('');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warmupDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warmupAbortRef = useRef<AbortController | null>(null);

  // Mode-switch auto-submit: when the user clicks "Switch to Code mode" button,
  // the intent mode changes. This ref stores the pending auto-submit message so a
  // useEffect can fire onSend after the mode state has propagated.
  const pendingModeSwitchSend = useRef<string | null>(null);

  const handleDraftWarmup = useCallback((draft: string) => {
    const trimmed = draft.trim();
    if (warmupDebounceRef.current) {
      clearTimeout(warmupDebounceRef.current);
      warmupDebounceRef.current = null;
    }
    if (trimmed.length < 12 || isLoading) {
      warmupAbortRef.current?.abort();
      return;
    }

    warmupDebounceRef.current = setTimeout(async () => {
      try {
        warmupAbortRef.current?.abort();
        const controller = new AbortController();
        warmupAbortRef.current = controller;
        const elementHint = extractElementHint(selectedElement);
        await fetch('/api/agents/warmup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            projectId,
            draft: trimmed,
            intentMode,
            activeFilePath: context.filePath ?? undefined,
            openTabs: openTabIds ?? undefined,
            explicitFiles: attachedFilesRef.current.length > 0
              ? attachedFilesRef.current.map((f) => f.path)
              : undefined,
            elementHint: elementHint || undefined,
            model,
            maxAgents,
            specialistMode,
          }),
        });
      } catch {
        // Warmup is best-effort only.
      }
    }, 700);
  }, [projectId, intentMode, context.filePath, openTabIds, model, maxAgents, specialistMode, selectedElement, isLoading]);

  useEffect(() => () => {
    if (warmupDebounceRef.current) clearTimeout(warmupDebounceRef.current);
    warmupAbortRef.current?.abort();
  }, []);

  // ── Cursor-style content blocks ──────────────────────────────────────
  const blocksRef = useRef<ContentBlock[]>([]);
  const thinkingStartedAtRef = useRef<number>(0);
  const reasoningDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Suggestion generation ───────────────────────────────────────────────

  const suggestionCtx: SuggestionContext = useMemo(() => ({
    filePath: context.filePath,
    fileLanguage: context.fileLanguage,
    selection: context.selection,
    hasShopifyConnection,
    fileCount,
    lastAction: getRecentActionTypes(projectId, 1)[0] ?? null,
    turnCount: messages.length,
  }), [context.filePath, context.fileLanguage, context.selection, hasShopifyConnection, fileCount, projectId, messages.length]);

  const recentlyShown = useMemo(() => getRecentlyShownIds(projectId), [projectId]);

  // Pre-prompt contextual suggestions
  const contextSuggestions = useMemo(() => {
    const suggestions = getContextualSuggestions(suggestionCtx, recentlyShown, projectId);
    // Inject arc suggestion at the top if applicable
    const arc = getArcSuggestion(getRecentActionTypes(projectId));
    if (arc) suggestions.unshift(arc);
    return suggestions.slice(0, 4);
  }, [suggestionCtx, recentlyShown, projectId]);

  // Post-response suggestions
  const responseSuggestions = useMemo(() => {
    if (!lastResponseContent) return [];
    const suggestions = getResponseSuggestions(lastResponseContent, suggestionCtx, recentlyShown, projectId);
    // Inject arc suggestion
    const arc = getArcSuggestion(getRecentActionTypes(projectId));
    if (arc && !suggestions.some((s) => s.id === arc.id)) {
      suggestions.unshift(arc);
    }
    return suggestions.slice(0, 3);
  }, [lastResponseContent, suggestionCtx, recentlyShown, projectId]);

  // Track shown suggestions for frequency dampening
  useMemo(() => {
    const allIds = [...contextSuggestions, ...responseSuggestions].map((s) => s.id);
    if (allIds.length > 0) {
      markSuggestionsShown(projectId, allIds);
      recordSuggestionsShown(projectId, allIds);
    }
  }, [contextSuggestions, responseSuggestions, projectId]);

  // EPIC 2: Filter out retry-context suggestion (handled via showRetryChip on SuggestionChips)
  const responseSuggestionsWithRetry = useMemo(() => {
    return responseSuggestions.filter((s) => s.id !== 'post-retry-context');
  }, [responseSuggestions]);

  // ── Cursor-style block helpers ─────────────────────────────────────────

  function getToolLoadingLabel(toolName: string, input: Record<string, unknown>): string {
    switch (toolName) {
      case 'propose_plan': return 'Proposing plan...';
      case 'propose_code_edit': return `Editing ${(input.filePath as string) ?? 'file'}...`;
      case 'search_replace': return `Editing ${(input.filePath as string) ?? 'file'}...`;
      case 'ask_clarification': return 'Asking for clarification...';
      case 'create_file': return `Creating ${(input.fileName as string) ?? 'file'}...`;
      case 'navigate_preview': return `Navigating to ${(input.path as string) ?? '/'}...`;
      case 'write_file': return `Writing ${(input.fileName as string) ?? 'file'}...`;
      case 'delete_file': return `Deleting ${(input.fileName as string) ?? 'file'}...`;
      case 'rename_file': return `Renaming ${(input.fileName as string) ?? 'file'}...`;
      case 'push_to_shopify': return 'Pushing to Shopify...';
      case 'pull_from_shopify': return 'Pulling from Shopify...';
      case 'list_themes': return 'Listing themes...';
      case 'list_store_resources': case 'list_resources': return 'Listing resources...';
      case 'get_shopify_asset': case 'get_asset': return 'Getting asset...';
      case 'screenshot_preview': return 'Taking screenshot...';
      case 'compare_screenshots': return 'Comparing screenshots...';
      // PM exploration tools
      case 'read_file': return `Reading ${(input.fileId as string) ?? 'file'}...`;
      case 'search_files': return `Searching for "${(input.query as string) ?? ''}"...`;
      case 'grep_content': return `Searching for "${(input.pattern as string) ?? ''}"...`;
      case 'check_lint': return `Checking ${(input.fileName as string) ?? 'file'}...`;
      case 'list_files': return 'Listing files...';
      case 'get_dependency_graph': return `Getting deps for ${(input.fileId as string) ?? 'file'}...`;
      default: return `Running ${toolName}...`;
    }
  }

  function getToolDoneLabel(toolName: string, input: Record<string, unknown>): string {
    switch (toolName) {
      case 'propose_plan': return 'Proposed plan';
      case 'propose_code_edit': return `Edited ${(input.filePath as string) ?? 'file'}`;
      case 'search_replace': return `Edited ${(input.filePath as string) ?? 'file'}`;
      case 'ask_clarification': return 'Asked for clarification';
      case 'create_file': return `Created ${(input.fileName as string) ?? 'file'}`;
      case 'navigate_preview': return `Navigated to ${(input.path as string) ?? '/'}`;
      case 'write_file': return `Wrote ${(input.fileName as string) ?? 'file'}`;
      case 'delete_file': return `Deleted ${(input.fileName as string) ?? 'file'}`;
      case 'rename_file': return `Renamed ${(input.fileName as string) ?? 'file'}`;
      case 'push_to_shopify': return 'Pushed to Shopify';
      case 'pull_from_shopify': return 'Pulled from Shopify';
      case 'list_themes': return 'Listed themes';
      case 'list_store_resources': case 'list_resources': return 'Listed resources';
      case 'get_shopify_asset': case 'get_asset': return 'Got asset';
      case 'screenshot_preview': return 'Took screenshot';
      case 'compare_screenshots': return 'Compared screenshots';
      // PM exploration tools
      case 'read_file': return `Read ${(input.fileId as string) ?? 'file'}`;
      case 'search_files': return `Found results for "${(input.query as string) ?? ''}"`;
      case 'grep_content': return `Found matches for "${(input.pattern as string) ?? ''}"`;
      case 'check_lint': {
        const name = (input.fileName as string) ?? 'file';
        return `Checked ${name}`;
      }
      case 'list_files': return 'Listed files';
      case 'get_dependency_graph': return `Got deps for ${(input.fileId as string) ?? 'file'}`;
      default: return `Ran ${toolName}`;
    }
  }

  function getToolSubtitle(toolName: string, input: Record<string, unknown>): string | undefined {
    switch (toolName) {
      case 'propose_plan': return (input.title as string) ?? undefined;
      case 'propose_code_edit': return (input.reasoning as string)?.slice(0, 80) ?? undefined;
      case 'search_replace': return (input.reasoning as string)?.slice(0, 80) ?? undefined;
      case 'ask_clarification': return (input.question as string)?.slice(0, 80) ?? undefined;
      case 'rename_file': return (input.newFileName as string) ?? undefined;
      case 'push_to_shopify': case 'pull_from_shopify': return (input.reason as string) ?? undefined;
      // PM exploration tools
      case 'read_file': return (input.fileId as string) ?? undefined;
      case 'search_files': return (input.query as string) ?? undefined;
      case 'grep_content': return (input.pattern as string) ?? undefined;
      case 'check_lint': return (input.fileName as string) ?? undefined;
      case 'get_dependency_graph': return (input.fileId as string) ?? undefined;
      default: return undefined;
    }
  }

  function buildPlanRoute(
    title: string,
    description: string,
    steps: Array<{ number: number; text: string; complexity?: 'simple' | 'moderate' | 'complex'; files?: string[] }>
  ): string {
    const params = new URLSearchParams();
    params.set('title', title);
    params.set('description', description);
    params.set('steps', JSON.stringify(steps));
    return `/plan?${params.toString()}`;
  }

  type ToolCardType = Extract<ContentBlock, { type: 'tool_action' }>['cardType'];

  function getToolCardType(toolName: string): ToolCardType {
    const map: Record<string, ToolCardType> = {
      propose_plan: 'plan',
      propose_code_edit: 'code_edit',
      search_replace: 'code_edit',
      ask_clarification: 'clarification',
      create_file: 'file_create',
      write_file: 'file_op',
      delete_file: 'file_op',
      rename_file: 'file_op',
      push_to_shopify: 'shopify_op',
      pull_from_shopify: 'shopify_op',
      list_themes: 'shopify_op',
      list_store_resources: 'shopify_op',
      get_shopify_asset: 'shopify_op',
      screenshot_preview: 'screenshot',
      compare_screenshots: 'screenshot_comparison',
      grep_content: 'grep_results',
      check_lint: 'lint_results',
      run_command: 'terminal',
      read_file: 'file_read',
      search_files: 'grep_results',
    };
    return map[toolName] ?? undefined;
  }

  function flushContentBuffer() {
    const text = contentBufferRef.current;
    if (text.length === 0) return;
    const blocks = blocksRef.current;
    const lastBlock = blocks[blocks.length - 1];
    if (lastBlock?.type === 'text') {
      lastBlock.text += text;
    } else {
      blocks.push({ type: 'text', id: crypto.randomUUID(), text });
    }
    contentBufferRef.current = '';
  }

  function finalizeBlocks() {
    const blocks = blocksRef.current;
    // Mark thinking done
    const thinkingBlock = blocks.find(b => b.type === 'thinking' && !b.done);
    if (thinkingBlock && thinkingBlock.type === 'thinking') {
      thinkingBlock.done = true;
      thinkingBlock.elapsedMs = thinkingBlock.startedAt ? Date.now() - thinkingBlock.startedAt : 0;
    }
    // Mark orphaned loading tools as done
    for (const b of blocks) {
      if (b.type === 'tool_action' && b.status === 'loading') {
        b.status = 'done';
      }
    }
    // Flush any remaining content
    flushContentBuffer();
  }

  // ── Send handler ────────────────────────────────────────────────────────

  const onSend = useCallback(
    async (content: string, sendOptions?: { imageUrls?: string[] }) => {
      setError(null);
      setErrorCode(null);

      // Track suggestion usage for frequency dampening
      const allSugs = [...contextSuggestions, ...responseSuggestionsWithRetry];
      const matchedSug = allSugs.find((s) => s.prompt === content);
      if (matchedSug) {
        recordSuggestionUsed(projectId, matchedSug.id);
      }

      setLastResponseContent(null);
      setIsStopped(false);
      setShowRetryChip(false);
      setCurrentAction('preparing');
      lastPromptRef.current = content;
      thinkingStepsRef.current = [];
      workersRef.current = [];
      setActiveSpecialists(new Map());
      blocksRef.current = [];
      thinkingStartedAtRef.current = 0;
      // Reset stall detection
      lastSSEEventTimeRef.current = Date.now();
      stallWarningEmittedRef.current = false;
      stallAlertEmittedRef.current = false;
      contentBufferRef.current = '';

      const trimmedContent = content.trim();
      const isBlueprintCommand = /^\/blueprint\b/i.test(trimmedContent);
      if (isBlueprintCommand) {
        appendMessage('user', content);
        setIsLoading(true);
        try {
          const blueprintPrompt = trimmedContent.replace(/^\/blueprint\b/i, '').trim()
            || 'Build a complete Shopify theme blueprint with schema-first customizer UX.';
          const resp = await fetch('/api/themes/blueprint', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectId,
              prompt: blueprintPrompt,
              mode: 'liquid',
              audience: 'stakeholder',
            }),
          });
          if (!resp.ok) {
            const data = await resp.json().catch(() => ({}));
            const err = data?.error ?? 'Blueprint generation failed';
            setError(err);
            appendMessage('assistant', `Error: ${err}`);
            return;
          }
          const data = await resp.json();
          const markdown = (data?.blueprint?.markdown as string | undefined)
            ?? 'Blueprint generated, but no markdown payload returned.';
          appendMessage('assistant', markdown);
          setLastResponseContent(markdown);
        } catch {
          const err = 'Blueprint generation failed. Please try again.';
          setError(err);
          appendMessage('assistant', `Error: ${err}`);
        } finally {
          setIsLoading(false);
        }
        return;
      }

      // EPIC 5: Track user turn in conversation arc
      arcRef.current.addTurn('user');

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // Phase 4a: Start live preview session
      onLiveSessionStart?.();

      const subagentCountForRequest = retrySubagentOverrideRef.current ?? maxAgents;
      retrySubagentOverrideRef.current = null;

      // Scale client timeout with subagent count to reduce false timeouts on 3x/4x runs.
      const timeoutMinutes =
        subagentCountForRequest >= 4 ? 7 :
        subagentCountForRequest === 3 ? 6 :
        subagentCountForRequest === 2 ? 5 : 4;
      const clientTimeout = setTimeout(() => {
        controller.abort();
      }, timeoutMinutes * 60_000);

      // EPIC 2: Detect [RETRY_WITH_FULL_CONTEXT] prefix
      let actualContent = content;
      let includeFullFile = false;
      if (content.startsWith(RETRY_PREFIX)) {
        actualContent = content.slice(RETRY_PREFIX.length).trim() || 'Please try again with more detail.';
        includeFullFile = true;
      }

      // Build enrichedContent for the API (includes all context metadata)
      // The displayed user message uses actualContent (raw user input only)
      let enrichedContent = actualContent;

      // Inject rich element context (section ID, classes, file hints) for the AI
      if (selectedElement?.selector) {
        const ctx = formatElementContext(selectedElement);
        enrichedContent = `[IDE Context] Element: ${ctx}\n\n${enrichedContent}`;
      }

      // Passive IDE context injection (gated by getPassiveContext)
      const passiveCtx = getPassiveContext?.() ?? '';
      if (passiveCtx) {
        enrichedContent = `${passiveCtx}\n\n${enrichedContent}`;
      }

      // EPIC 1c: Selection injection — only include if user explicitly dragged
      // a file into the chat or used QuickActions. Do NOT auto-inject editor
      // selections (Find highlights, cursor moves) into every message.
      if (context.selection && explicitSelectionRef.current) {
        const start = context.selectionStartLine;
        const end = context.selectionEndLine;
        const lineTag =
          typeof start === 'number' && typeof end === 'number'
            ? ` — lines ${start}-${end}`
            : '';
        enrichedContent = `[Selected code in editor${lineTag}]:\n\`\`\`\n${context.selection}\n\`\`\`\n\n${enrichedContent}`;
        explicitSelectionRef.current = false;
      }

      // Phase 3b: Inject explicit file context for dragged files
      if (attachedFilesRef.current.length > 0) {
        const filePaths = attachedFilesRef.current.map((f) => f.path).join(', ');
        enrichedContent = '[Explicit file context \u2014 ' + filePaths + ']\n\n' + enrichedContent;
      }

      // Phase 3a: Inject annotation context from preview panel
      if (pendingAnnotation) {
        const r = pendingAnnotation.region;
        const annotCtx = '[Preview annotation \u2014 ' + (pendingAnnotation.previewPath || '/') + ']\n' +
          'Region: x=' + Math.round(r.x * 100) + '%, y=' + Math.round(r.y * 100) + '%, ' +
          'width=' + Math.round(r.width * 100) + '%, height=' + Math.round(r.height * 100) + '%\n' +
          (pendingAnnotation.note ? 'Note: ' + pendingAnnotation.note + '\n' : '');
        enrichedContent = annotCtx + '\n' + enrichedContent;
        onClearAnnotation?.();
      }

      // Phase 6a: Inject pinned preferences as system context
      const prefInjection = pinnedPrefs.getPromptInjection();
      if (prefInjection) {
        enrichedContent = prefInjection + '\n\n' + enrichedContent;
      }

      // Phase 6b: Inject detected code style guide
      if (styleGuide) {
        enrichedContent = styleGuide + '\n\n' + enrichedContent;
      }

      // EPIC 2: If retry-with-full-context, prepend the active file content
      if (includeFullFile && getActiveFileContent) {
        const fileContent = getActiveFileContent();
        if (fileContent) {
          const fileName = context.filePath ?? 'active file';
          enrichedContent = `[Full file context — ${fileName}]:\n\`\`\`\n${fileContent}\n\`\`\`\n\n${enrichedContent}`;
        }
      }

      const rawHistory = messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));
      const referentialPrompt = /^(yes|ok|do it|go ahead|apply|implement|implement the code changes you just suggested|make those changes now|make those code changes now)[\s.!]*$/i.test(enrichedContent.trim())
        || /\b(apply|implement|create|make|write|use|do)\b.*\b(that|the|those|this|previous|earlier|before|above|suggested|from before)\b/i.test(enrichedContent.trim())
        || /\b(that|the|those|this|previous|earlier|before|above)\b.*\b(code|changes?|suggestions?|edits?|snippet)\b/i.test(enrichedContent.trim());
      const trimBudget = intentMode === 'code' && referentialPrompt ? 60_000 : 30_000;
      const keepRecent = intentMode === 'code' && referentialPrompt ? 24 : 10;
      const { messages: trimmedHistory, summary: historySummary, trimmedCount } = trimHistory(rawHistory, {
        budget: trimBudget,
        keepRecent,
      });
      const history = trimmedHistory;

      // Store trim info for ChatInterface UI (D2 summary block + D3 context meter)
      setLastTrimmedCount(trimmedCount);
      setLastHistorySummary(historySummary || undefined);

      let requestWithContext = historySummary
        ? `[Context from earlier conversation]:\n${historySummary}\n\n${enrichedContent}`
        : enrichedContent;
      let isReferentialCodePrompt = false;
      let referentialArtifactsForRequest: ReferentialEditArtifact[] | undefined;

      // ── Vague reference hint ─────────────────────────────────────────────
      // When the user says something like "apply that code" or "do it", and
      // there's code from earlier in the conversation, surface it explicitly
      // so the coordinator doesn't have to search through history itself.
      // (All modes now run through the same coordinator pipeline with full
      // history, so this is just a convenience hint, not a recovery mechanism.)
      if (messages.length >= 2) {
        const userMsg = enrichedContent.trim();
        const isVagueReference = referentialPrompt;

        if (isVagueReference) {
          isReferentialCodePrompt = true;
          let referenceFound = false;
          // Find most recent assistant message with code blocks
          for (const msg of [...messages].reverse()) {
            if (msg.role !== 'assistant') continue;
            const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
            const blocks: string[] = [];
            let match;
            while ((match = codeBlockRegex.exec(msg.content)) !== null) {
              const code = match[2].trim();
              if (code.length > 0) blocks.push(`[${match[1] || 'code'}]\n${code}`);
            }
            if (blocks.length > 0) {
              requestWithContext = `[The user is referencing code from earlier in this conversation. Apply it directly.]\n\nCode:\n${blocks.join('\n\n')}\n\nUser: "${userMsg}"`;
              referenceFound = true;
              break;
            }
            if (msg.codeEdits && msg.codeEdits.length > 0) {
              const edits = msg.codeEdits.map((e) => `[${e.filePath}]\n${e.newContent}`).join('\n\n');
              referentialArtifactsForRequest = msg.codeEdits
                .filter((e) => e.filePath?.trim() && e.newContent?.trim())
                .map((e) => ({
                  filePath: e.filePath,
                  newContent: e.newContent,
                  reasoning: e.reasoning,
                  capturedAt: new Date().toISOString(),
                }));
              requestWithContext = `[The user is referencing code edits from earlier. Apply them directly.]\n\nEdits:\n${edits}\n\nUser: "${userMsg}"`;
              referenceFound = true;
              break;
            }
          }
          if (!referenceFound) {
            const replayEdits = loadReferentialEditArtifact(projectId, activeSessionId);
            if (replayEdits.length > 0) {
              referentialArtifactsForRequest = replayEdits;
              const serializedEdits = replayEdits
                .slice(0, 8)
                .map((e) => `[${e.filePath}]\n${e.newContent}`)
                .join('\n\n');
              requestWithContext =
                `[The user is referencing earlier code edits from this same chat session. ` +
                `Replay these structured edits directly before any extra lookup.]\n\n` +
                `Edits:\n${serializedEdits}\n\nUser: "${userMsg}"`;
              referenceFound = true;
            }
          }
          if (!referenceFound) {
            const recentAssistantContext = [...messages]
              .reverse()
              .filter((m) => m.role === 'assistant')
              .slice(0, 3)
              .map((m, idx) => `Assistant context ${idx + 1}:\n${m.content.slice(0, 2400)}`)
              .join('\n\n');
            requestWithContext =
              `[Referential follow-up detected. Use prior assistant implementation context from this chat and enact directly in code mode. ` +
              `Do not re-plan. If edits are unclear, ask one specific clarification question.]\n\n` +
              `${recentAssistantContext}\n\nUser: "${userMsg}"`;
          }
        }
      }

      const displayContent = actualContent;
      appendMessage('user', displayContent, sendOptions?.imageUrls?.length ? { imageUrls: sendOptions.imageUrls } : undefined);
      setIsLoading(true);

      const assistantMsgId = crypto.randomUUID();
      let streamedContent = '';

      try {
        const previewContextEnabled = shouldFetchPreviewContext({
          intentMode,
          prompt: actualContent,
          selectedElement,
          hasAnnotation: Boolean(pendingAnnotation),
        });

        // EPIC V3: Capture "before" DOM snapshot for preview verification
        if (captureBeforeSnapshot && previewContextEnabled) {
          try { await captureBeforeSnapshot(); } catch { /* best-effort */ }
        }

        // EPIC 1a: Fetch DOM context only when preview context is relevant.
        let domContext: string | undefined;
        if (getPreviewSnapshot && previewContextEnabled) {
          try {
            domContext = await getPreviewSnapshot();
          } catch {
            // Preview not available — proceed without DOM context
          }
        }

        // Extract element hint for smart file auto-selection on the server
        const elementHint = extractElementHint(selectedElement);

        const streamEndpoint = '/api/agents/stream/v2';

        // Capture and clear pending image for this request
        const imageForRequest = pendingImageRef.current;
        pendingImageRef.current = null;

        const res = await fetch(streamEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            sessionId: activeSessionId ?? undefined,
            request: requestWithContext,
            history,
            images: imageForRequest ? [imageForRequest] : undefined,
            isReferentialCodePrompt:
              intentMode === 'code' && isReferentialCodePrompt ? true : undefined,
            referentialArtifacts:
              intentMode === 'code' &&
              referentialArtifactsForRequest &&
              referentialArtifactsForRequest.length > 0
                ? referentialArtifactsForRequest.map((artifact) => ({
                    filePath: artifact.filePath,
                    newContent: artifact.newContent,
                    reasoning: artifact.reasoning,
                    capturedAt: artifact.capturedAt,
                  }))
                : undefined,
            activeFilePath: context.filePath ?? undefined,
            openTabs: openTabIds ?? undefined,
            domContext: domContext || undefined,
            elementHint: elementHint || undefined,
            subagentCount: subagentCountForRequest,
            specialistMode,
            model,
            intentMode,
            maxQuality,
            useFlatPipeline: useFlatPipeline || undefined,
            cleanStart: isCleanStartSession.current || undefined,
            explicitFiles: attachedFilesRef.current.length > 0
              ? attachedFilesRef.current.map((f) => f.path)
              : undefined,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const errMsg = data?.error ?? `Request failed (${res.status})`;
          setError(errMsg);
          appendMessage('assistant', `Error: ${errMsg}`);
          return;
        }

        addLocalMessage({
          id: assistantMsgId,
          role: 'assistant',
          content: '',
          timestamp: new Date(),
        });

        const reader = res.body?.getReader();
        if (!reader) throw new Error('Response body is not readable');

        const decoder = new TextDecoder();
        let done = false;
        let receivedDone = false;
        let receivedError: SSEErrorEvent | null = null;
        let thinkingComplete = false;
        let streamCarry = '';

        // Local accumulators for tool card data (avoids reading message state mid-stream)
        let accumulatedCodeEdits: Array<{ filePath: string; reasoning?: string; newContent: string; originalContent?: string; status: 'pending' | 'applied' | 'rejected'; confidence?: number }> = [];
        let accumulatedFileCreates: Array<{ fileName: string; content: string; reasoning?: string; status: 'pending' | 'confirmed' | 'cancelled'; confidence?: number }> = [];
        // Agent Power Tools accumulators (Phase 7)
        let accumulatedFileOps: Array<{ type: 'write' | 'delete' | 'rename'; fileName: string; success: boolean; error?: string; newFileName?: string }> = [];
        let accumulatedShopifyOps: Array<{ type: 'push' | 'pull' | 'list_themes' | 'list_resources' | 'get_asset'; status: 'pending' | 'success' | 'error'; summary: string; detail?: string; error?: string }> = [];
        let hasClarificationCardForRun = false;

        onCodePaneReset?.();

        // Start stall detection timer (checks every 10s)
        stallTimerRef.current = setInterval(() => {
          const elapsed = (Date.now() - lastSSEEventTimeRef.current) / 1000;
          if (elapsed >= 120 && !stallAlertEmittedRef.current) {
            stallAlertEmittedRef.current = true;
            const stallMsg = 'This is taking unusually long. You can Stop and retry.';
            const steps = thinkingStepsRef.current.map(s => ({ ...s, done: true }));
            steps.push({
              phase: 'budget_warning' as const,
              label: stallMsg,
              done: false,
              startedAt: Date.now(),
            });
            thinkingStepsRef.current = steps;
            // Block building: append stall to thinking
            const tb = blocksRef.current.find(b => b.type === 'thinking');
            if (tb && tb.type === 'thinking') tb.reasoningText += `\n${stallMsg}`;
            updateMessage(assistantMsgId, streamedContent, {
              thinkingSteps: [...steps],
              thinkingComplete: false,
              blocks: blocksRef.current.length > 0 ? [...blocksRef.current] : undefined,
            });
          } else if (elapsed >= 90 && !stallWarningEmittedRef.current) {
            stallWarningEmittedRef.current = true;
            const stallMsg = 'Taking longer than expected...';
            const steps = thinkingStepsRef.current.map(s => ({ ...s, done: true }));
            steps.push({
              phase: 'analyzing' as const,
              label: stallMsg,
              done: false,
              startedAt: Date.now(),
            });
            thinkingStepsRef.current = steps;
            // Block building: append stall to thinking
            const tb = blocksRef.current.find(b => b.type === 'thinking');
            if (tb && tb.type === 'thinking') tb.reasoningText += `\n${stallMsg}`;
            updateMessage(assistantMsgId, streamedContent, {
              thinkingSteps: [...steps],
              thinkingComplete: false,
              blocks: blocksRef.current.length > 0 ? [...blocksRef.current] : undefined,
            });
          }
        }, 10_000);

        while (!done) {
          const result = await reader.read();
          done = result.done;
          if (result.value) {
            const decoded = decoder.decode(result.value, { stream: true });
            const split = splitStreamParts(decoded, streamCarry);
            streamCarry = split.remainder;

            for (const chunk of split.parts) {
              // Check for SSE events (error, done, thinking) in this stream part
              const sseEvent = parseSSEEvent(chunk);
              if (sseEvent) {
              // Reset stall detection on any SSE event
              lastSSEEventTimeRef.current = Date.now();
              stallWarningEmittedRef.current = false;
              stallAlertEmittedRef.current = false;

              // Handle change_preview: batch code changes awaiting approval
              if (sseEvent.type === 'change_preview') {
                if (debounceTimerRef.current) { clearTimeout(debounceTimerRef.current); debounceTimerRef.current = null; }
                flushContentBuffer();
                blocksRef.current.push({
                  type: 'tool_action',
                  id: crypto.randomUUID(),
                  toolId: 'change_preview',
                  toolName: 'change_preview',
                  label: `${sseEvent.changes.length} file${sseEvent.changes.length !== 1 ? 's' : ''} ready for review`,
                  status: 'done',
                  cardType: 'change_preview',
                  cardData: {
                    executionId: sseEvent.executionId,
                    sessionId: sseEvent.sessionId ?? activeSessionId ?? null,
                    projectId: sseEvent.projectId,
                    changes: sseEvent.changes,
                  },
                });

                // Surface change_preview to BatchDiffModal for unified review
                if (onBatchDiff && sseEvent.changes.length > 0) {
                  onBatchDiff({
                    title: `${sseEvent.changes.length} file${sseEvent.changes.length !== 1 ? 's' : ''} changed`,
                    entries: sseEvent.changes.map(c => ({
                      fileId: c.fileId,
                      fileName: c.fileName,
                      originalContent: c.originalContent,
                      newContent: c.proposedContent,
                      description: c.reasoning,
                    })),
                    checkpointId: sseEvent.checkpointId,
                  });
                }

                updateMessage(assistantMsgId, streamedContent, {
                  blocks: [...blocksRef.current],
                });
                continue;
              }
              if (sseEvent.type === 'done') {
                receivedDone = true;
                setActiveSpecialists(new Map());
                // Mark thinking complete and enable input immediately so UX updates without waiting for stream close
                thinkingComplete = true;
                const steps = thinkingStepsRef.current.map(s => ({ ...s, done: true }));
                thinkingStepsRef.current = steps;
                // Finalize blocks
                finalizeBlocks();
                updateMessage(assistantMsgId, streamedContent, {
                  thinkingSteps: steps.length > 0 ? [...steps] : undefined,
                  thinkingComplete: true,
                  blocks: [...blocksRef.current],
                });
                setIsLoading(false);
                continue;
              }
              if (sseEvent.type === 'error') {
                receivedError = sseEvent;
                // Mark any loading tool action as error in blocks
                const loadingBlock = blocksRef.current.findLast(
                  (b: ContentBlock) => b.type === 'tool_action' && b.status === 'loading'
                );
                if (loadingBlock && loadingBlock.type === 'tool_action') {
                  loadingBlock.status = 'error';
                  loadingBlock.error = sseEvent.message;
                } else {
                  // Append error as text block
                  flushContentBuffer();
                  blocksRef.current.push({
                    type: 'text', id: crypto.randomUUID(),
                    text: `\n\n---\n**Error:** ${sseEvent.message}`,
                  });
                }
                continue;
              }
              if (sseEvent.type === 'content_chunk') {
                const textChunk = sseEvent.chunk ?? '';
                if (!textChunk) continue;
                lastSSEEventTimeRef.current = Date.now();

                if (!thinkingComplete && thinkingStepsRef.current.length > 0) {
                  thinkingComplete = true;
                  const steps = thinkingStepsRef.current.map(s => ({ ...s, done: true }));
                  thinkingStepsRef.current = steps;
                  const tb = blocksRef.current.find(b => b.type === 'thinking' && !b.done);
                  if (tb && tb.type === 'thinking') {
                    tb.done = true;
                    tb.elapsedMs = Date.now() - tb.startedAt;
                  }
                }

                streamedContent += textChunk;
                contentBufferRef.current += textChunk;
                if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
                debounceTimerRef.current = setTimeout(() => {
                  flushContentBuffer();
                  updateMessage(assistantMsgId, streamedContent, {
                    thinkingSteps: thinkingStepsRef.current.length > 0 ? [...thinkingStepsRef.current] : undefined,
                    thinkingComplete: thinkingComplete || undefined,
                    blocks: [...blocksRef.current],
                  });
                }, 100);
                continue;
              }
              // Handle active_model SSE event — show which model is being used
              if (sseEvent.type === 'active_model') {
                updateMessage(assistantMsgId, streamedContent, {
                  activeModel: sseEvent.model,
                });
                continue;
              }
              // Handle rate_limited SSE event — flag rate limit + update active model
              if (sseEvent.type === 'rate_limited') {
                updateMessage(assistantMsgId, streamedContent, {
                  rateLimitHit: true,
                  activeModel: sseEvent.fallbackModel,
                });
                continue;
              }
              if (sseEvent.type === 'shopify_push') {
                // Auto-push completed — refresh preview
                setTimeout(() => emitPreviewSyncComplete(projectId), 1500);
                continue;
              }
              if (sseEvent.type === 'execution_outcome') {
                const rawOutcome = sseEvent.outcome;
                const reasonStr = (sseEvent as { failureReason?: string }).failureReason ?? '';
                const referentialReplayFailed =
                  /referential|artifact/i.test(reasonStr) || undefined;
                const sseValidationIssues = (sseEvent as { validationIssues?: { gate: string; errors: string[]; changesKept: boolean }[] }).validationIssues;

                // Distinguish "applied cleanly" from "applied with validation warnings"
                const outcome: typeof rawOutcome | 'applied-with-warnings' =
                  rawOutcome === 'applied' && sseValidationIssues && sseValidationIssues.length > 0
                    ? 'applied-with-warnings'
                    : rawOutcome;

                // Append change summary to the streamed content if present
                const changeSummary = (sseEvent as { changeSummary?: string }).changeSummary;
                if (changeSummary && (outcome === 'applied' || outcome === 'applied-with-warnings')) {
                  const summaryBlock = `\n\n---\n**Changes applied:**\n${changeSummary}`;
                  streamedContent += summaryBlock;
                }

                const sseCheckpointId = (sseEvent as { checkpointId?: string }).checkpointId;
                const sseRolledBack = (sseEvent as { rolledBack?: boolean }).rolledBack;
                const failureMeta = {
                  failureReason: (sseEvent as { failureReason?: string }).failureReason ?? undefined,
                  suggestedAction: (sseEvent as { suggestedAction?: string }).suggestedAction ?? undefined,
                  failedTool: (sseEvent as { failedTool?: string }).failedTool ?? undefined,
                  failedFilePath: (sseEvent as { failedFilePath?: string }).failedFilePath ?? undefined,
                  reviewFailedSection: (sseEvent as { reviewFailedSection?: 'spec' | 'code_quality' | 'both' }).reviewFailedSection ?? undefined,
                  referentialReplayFailed,
                  verificationEvidence: ((sseEvent as unknown as Record<string, unknown>).verificationEvidence) as { syntaxCheck: { passed: boolean; errorCount: number; warningCount: number }; themeCheck?: { passed: boolean; errorCount: number; warningCount: number; infoCount: number }; checkedFiles: string[]; totalCheckTimeMs: number } | undefined,
                  validationIssues: sseValidationIssues,
                  checkpointId: sseCheckpointId,
                  rolledBack: sseRolledBack || undefined,
                };

                // Only show clarification card when the agent explicitly asked
                // (needsClarification from ask_clarification tool, not synthetic).
                if (outcome === 'needs-input' && sseEvent.needsClarification && !hasClarificationCardForRun) {
                  hasClarificationCardForRun = true;
                  const fr = failureMeta.failureReason;
                  const fp = failureMeta.failedFilePath;
                  const clarQuestion =
                    fr === 'search_replace_failed' && fp
                      ? `I couldn't match the text in \`${fp}\`. How would you like to proceed?`
                      : fr === 'file_not_found' && fp
                        ? `I couldn't find \`${fp}\`. Can you confirm the correct path?`
                        : fr === 'validation_failed'
                          ? 'The edit didn\'t pass validation. How should I adjust?'
                          : 'I wasn\'t able to complete this change. What would help me proceed?';
                  const clarOptions =
                    fr === 'search_replace_failed'
                      ? [
                          { id: 'paste-content', label: 'I\'ll paste the current file content.' },
                          { id: 'full-rewrite', label: 'Do a full file rewrite instead.' },
                          { id: 'different-approach', label: 'Try a different approach.' },
                        ]
                      : fr === 'file_not_found'
                        ? [
                            { id: 'correct-path', label: 'I\'ll provide the correct path.' },
                            { id: 'create-file', label: 'Create this file from scratch.' },
                          ]
                        : [
                            { id: 'target-file', label: 'I\'ll specify the exact target file.' },
                            { id: 'before-after', label: 'I\'ll paste exact before/after code.' },
                            { id: 'replay-last-edits', label: 'Replay the suggested edits as-is.' },
                          ];
                  updateMessage(assistantMsgId, streamedContent, {
                    executionOutcome: outcome,
                    ...failureMeta,
                    clarification: {
                      question: clarQuestion,
                      options: clarOptions,
                      allowFreeform: true,
                    },
                  });
                } else {
                  updateMessage(assistantMsgId, streamedContent, {
                    executionOutcome: outcome,
                    ...failureMeta,
                  });
                }
                continue;
              }
              if (sseEvent.type === 'token_budget_update') {
                const total = sseEvent.used + sseEvent.remaining;
                const ratio = total > 0 ? sseEvent.used / total : 0;
                if (ratio > 0.7) {
                  setContextPressure({
                    usedTokens: sseEvent.used,
                    maxTokens: total,
                    percentage: Math.round(ratio * 100),
                    level: ratio > 0.9 ? 'critical' : 'warning',
                  });
                }
                continue;
              }
              if (sseEvent.type === 'context_file_loaded') {
                if (sseEvent.loadedFiles != null) {
                  updateMessage(assistantMsgId, streamedContent, {
                    contextStats: {
                      loadedFiles: sseEvent.loadedFiles,
                      loadedTokens: sseEvent.loadedTokens ?? 0,
                      totalFiles: sseEvent.totalFiles ?? 0,
                    },
                  });
                } else {
                  const currentMsg = messages.find(m => m.id === assistantMsgId);
                  updateMessage(assistantMsgId, streamedContent, {
                    contextStats: {
                      totalFiles: currentMsg?.contextStats?.totalFiles ?? 0,
                      ...currentMsg?.contextStats,
                      loadedFiles: (currentMsg?.contextStats?.loadedFiles ?? 0) + 1,
                      loadedTokens: (currentMsg?.contextStats?.loadedTokens ?? 0) + (sseEvent.tokenCount ?? 0),
                    },
                  });
                }
                continue;
              }
              // Handle tool_start: show loading skeleton
              if (sseEvent.type === 'tool_start') {
                updateMessage(assistantMsgId, streamedContent, {
                  activeToolCall: { name: sseEvent.name, id: sseEvent.id },
                });
                // Block building: flush content, add loading tool_action
                if (debounceTimerRef.current) { clearTimeout(debounceTimerRef.current); debounceTimerRef.current = null; }
                flushContentBuffer();
                blocksRef.current.push({
                  type: 'tool_action',
                  id: sseEvent.id,
                  toolId: sseEvent.id,
                  toolName: sseEvent.name,
                  label: getToolLoadingLabel(sseEvent.name, {}),
                  status: 'loading',
                  reasoning: (sseEvent as SSEToolStartEvent).reasoning,
                });
                updateMessage(assistantMsgId, streamedContent, {
                  activeToolCall: { name: sseEvent.name, id: sseEvent.id },
                  blocks: [...blocksRef.current],
                });
                continue;
              }
              // Handle tool_error: update block status to failed
              if (sseEvent.type === 'tool_error') {
                const errorBlock = blocksRef.current.find(
                  (b) => b.type === 'tool_action' && b.toolId === sseEvent.id,
                );
                if (errorBlock && errorBlock.type === 'tool_action') {
                  errorBlock.status = 'error';
                  errorBlock.label = `${sseEvent.name} failed${sseEvent.recoverable ? ' (retrying)' : ''}`;
                }
                updateMessage(assistantMsgId, streamedContent, {
                  activeToolCall: undefined,
                  blocks: [...blocksRef.current],
                });
                continue;
              }
              // Handle tool_progress: update loading tool block with progress data
              if (sseEvent.type === 'tool_progress') {
                const progressToolId = sseEvent.toolCallId || sseEvent.id;
                const matchIdx = blocksRef.current.findLastIndex(
                  (b: ContentBlock) =>
                    b.type === 'tool_action' &&
                    b.status === 'loading' &&
                    (b.toolId === progressToolId || b.toolName === sseEvent.name),
                );
                if (matchIdx >= 0) {
                  const b = blocksRef.current[matchIdx];
                  if (b.type === 'tool_action') {
                    b.progress = {
                      phase: sseEvent.progress.phase,
                      detail: sseEvent.progress.detail,
                      percentage: sseEvent.progress.percentage,
                    };
                    if (sseEvent.progress.detail) {
                      b.label = sseEvent.progress.detail;
                    }
                  }
                }
                updateMessage(assistantMsgId, streamedContent, {
                  blocks: [...blocksRef.current],
                });
                continue;
              }
              // Handle tool_call: route completed tool calls to card data
              if (sseEvent.type === 'tool_call') {
                const input = sseEvent.input;
                const toolName = sseEvent.name;

                // Clear active tool call loading state
                const clearActive = { activeToolCall: undefined };

                if (toolName === 'propose_plan') {
                  const title = (input.title as string) ?? 'Plan';
                  const description = (input.description as string) ?? '';
                  const steps =
                    (input.steps as Array<{ number: number; text: string; complexity?: 'simple' | 'moderate' | 'complex'; files?: string[] }>) ??
                    [];
                  const confidence = typeof input.confidence === 'number' ? Math.max(0, Math.min(1, input.confidence)) : undefined;
                  updateMessage(assistantMsgId, streamedContent, {
                    ...clearActive,
                    planData: {
                      title,
                      description,
                      steps,
                      filePath: buildPlanRoute(title, description, steps),
                      ...(confidence != null && { confidence }),
                    },
                  });
                } else if (toolName === 'propose_code_edit' || toolName === 'search_replace') {
                  const editFilePath = (input.filePath as string) ?? '';
                  const originalFileContent = resolveFileContent?.(editFilePath) ?? undefined;
                  // Compute full new content: propose_code_edit provides it directly,
                  // search_replace computes it by applying old_text -> new_text replacement.
                  let editNewContent: string;
                  if (toolName === 'search_replace') {
                    const oldText = (input.old_text as string) ?? '';
                    const newText = (input.new_text as string) ?? '';
                    const base = originalFileContent ?? '';
                    const idx = base.indexOf(oldText);
                    editNewContent = idx !== -1
                      ? base.slice(0, idx) + newText + base.slice(idx + oldText.length)
                      : base;
                  } else {
                    editNewContent = (input.newContent as string) ?? '';
                  }
                  const editConfidence = typeof input.confidence === 'number' ? Math.max(0, Math.min(1, input.confidence)) : undefined;
                  accumulatedCodeEdits = [
                    ...accumulatedCodeEdits,
                    {
                      filePath: editFilePath,
                      reasoning: input.reasoning as string | undefined,
                      newContent: editNewContent,
                      originalContent: originalFileContent,
                      status: 'pending' as const,
                      ...(editConfidence != null && { confidence: editConfidence }),
                    },
                  ];
                  // Phase 4a: Push live change to preview
                  onLiveChange?.({ filePath: editFilePath, newContent: editNewContent });

                  // Auto-open the file being edited so the user sees the change
                  if (editFilePath) {
                    onOpenFiles?.([editFilePath]);
                  }

                  // Agent Live Breakout: auto-scroll to first changed line
                  if (originalFileContent && editFilePath) {
                    const range = getFirstChangedLineRange(originalFileContent, editNewContent);
                    if (range) {
                      onScrollToEdit?.(editFilePath, range.startLine);
                      agentEdits.addEdits(editFilePath, [{
                        startLine: range.startLine,
                        endLine: range.endLine,
                        reasoning: (input.reasoning as string) ?? toolName,
                        agentType: 'project_manager',
                        timestamp: Date.now(),
                      }]);
                    }
                  }

                  // Agent Live Breakout: push live content update to the breakout viewer
                  if (onAgentActivity && editFilePath) {
                    onAgentActivity({
                      agentType: null,
                      filePath: editFilePath,
                      liveContent: editNewContent,
                    });
                  }

                  // Multi-pane code viewer: push edit to categorized panes
                  if (onCodePaneUpdate && editFilePath) {
                    onCodePaneUpdate({
                      filePath: editFilePath,
                      content: editNewContent,
                      originalContent: originalFileContent ?? '',
                    });
                  }

                  updateMessage(assistantMsgId, streamedContent, {
                    ...clearActive,
                    codeEdits: [...accumulatedCodeEdits],
                  });
                } else if (toolName === 'ask_clarification') {
                  updateMessage(assistantMsgId, streamedContent, {
                    ...clearActive,
                    clarification: {
                      question: (input.question as string) ?? '',
                      options: (input.options as Array<{ id: string; label: string }>) ?? [],
                      allowMultiple: input.allowMultiple as boolean | undefined,
                    },
                  });
                } else if (toolName === 'navigate_preview') {
                  updateMessage(assistantMsgId, streamedContent, {
                    ...clearActive,
                    previewNav: {
                      path: (input.path as string) ?? '/',
                      description: input.description as string | undefined,
                    },
                  });
                } else if (toolName === 'create_file') {
                  const createFileName = (input.fileName as string) ?? '';
                  const fcConfidence = typeof input.confidence === 'number' ? Math.max(0, Math.min(1, input.confidence)) : undefined;
                  accumulatedFileCreates = [
                    ...accumulatedFileCreates,
                    {
                      fileName: createFileName,
                      content: (input.content as string) ?? '',
                      reasoning: input.reasoning as string | undefined,
                      status: 'pending' as const,
                      ...(fcConfidence != null && { confidence: fcConfidence }),
                    },
                  ];
                  if (createFileName) onOpenFiles?.([createFileName]);
                  updateMessage(assistantMsgId, streamedContent, {
                    ...clearActive,
                    fileCreates: [...accumulatedFileCreates],
                  });
                // ── Agent Power Tools card routing (Phase 7) ────────────
                } else if (toolName === 'write_file' || toolName === 'delete_file' || toolName === 'rename_file') {
                  const opType = toolName.replace('_file', '') as 'write' | 'delete' | 'rename';
                  accumulatedFileOps = [
                    ...accumulatedFileOps,
                    {
                      type: opType,
                      fileName: (input.fileName as string) ?? '',
                      success: true,
                      newFileName: toolName === 'rename_file' ? (input.newFileName as string) : undefined,
                    },
                  ];
                  updateMessage(assistantMsgId, streamedContent, {
                    ...clearActive,
                    fileOps: [...accumulatedFileOps],
                  });
                } else if (toolName === 'push_to_shopify' || toolName === 'pull_from_shopify' || toolName === 'list_themes' || toolName === 'list_store_resources' || toolName === 'get_shopify_asset') {
                  const shopifyType = ({
                    push_to_shopify: 'push',
                    pull_from_shopify: 'pull',
                    list_themes: 'list_themes',
                    list_store_resources: 'list_resources',
                    get_shopify_asset: 'get_asset',
                  } as const)[toolName];
                  accumulatedShopifyOps = [
                    ...accumulatedShopifyOps,
                    {
                      type: shopifyType,
                      status: 'success' as const,
                      summary: (input.reason as string) ?? `${shopifyType} completed`,
                    },
                  ];
                  updateMessage(assistantMsgId, streamedContent, {
                    ...clearActive,
                    shopifyOps: [...accumulatedShopifyOps],
                  });
                } else if (toolName === 'screenshot_preview') {
                  updateMessage(assistantMsgId, streamedContent, {
                    ...clearActive,
                    screenshots: [
                      {
                        url: (input.path as string) ?? '/',
                        path: (input.path as string) ?? '/',
                      },
                    ],
                  });
                } else if (toolName === 'compare_screenshots') {
                  updateMessage(assistantMsgId, streamedContent, {
                    ...clearActive,
                    screenshotComparison: {
                      beforeUrl: (input.beforeUrl as string) ?? '',
                      afterUrl: (input.afterUrl as string) ?? '',
                      threshold: (input.threshold as number) ?? 2.0,
                    },
                  });
                } else {
                  // Unknown tool — just clear the loading state
                  updateMessage(assistantMsgId, streamedContent, clearActive);
                }

                // ── Block building: update matching tool_action block ──
                {
                  const matchIdx = blocksRef.current.findLastIndex(
                    (b: ContentBlock) => b.type === 'tool_action' && b.toolName === toolName && b.status === 'loading'
                  );
                  const cardType = getToolCardType(toolName);
                  const doneLabel = getToolDoneLabel(toolName, input as Record<string, unknown>);
                  const subtitle = getToolSubtitle(toolName, input as Record<string, unknown>);
                  // Build card data from the existing accumulated data
                  let cardData: unknown = undefined;
                  if (toolName === 'propose_plan') {
                    const title = (input.title as string) ?? 'Plan';
                    const description = (input.description as string) ?? '';
                    const steps =
                      (input.steps as Array<{ number: number; text: string; complexity?: 'simple' | 'moderate' | 'complex'; files?: string[] }>) ??
                      [];
                    const planConfidence = typeof input.confidence === 'number' ? Math.max(0, Math.min(1, input.confidence)) : undefined;
                    cardData = {
                      title,
                      description,
                      steps,
                      filePath: buildPlanRoute(title, description, steps),
                      ...(planConfidence != null && { confidence: planConfidence }),
                    };
                  } else if (toolName === 'propose_code_edit' || toolName === 'search_replace') {
                    const editFilePath_ = (input.filePath as string) ?? '';
                    const origContent_ = resolveFileContent?.(editFilePath_) ?? undefined;
                    let newContent_: string;
                    if (toolName === 'search_replace') {
                      const oldT = (input.old_text as string) ?? '';
                      const newT = (input.new_text as string) ?? '';
                      const base_ = origContent_ ?? '';
                      const idx_ = base_.indexOf(oldT);
                      newContent_ = idx_ !== -1
                        ? base_.slice(0, idx_) + newT + base_.slice(idx_ + oldT.length)
                        : base_;
                    } else {
                      newContent_ = (input.newContent as string) ?? '';
                    }
                    const blockEditConfidence = typeof input.confidence === 'number' ? Math.max(0, Math.min(1, input.confidence)) : undefined;
                    cardData = {
                      filePath: editFilePath_,
                      reasoning: input.reasoning as string | undefined,
                      newContent: newContent_,
                      originalContent: origContent_,
                      status: 'pending' as const,
                      ...(blockEditConfidence != null && { confidence: blockEditConfidence }),
                    };
                  } else if (toolName === 'ask_clarification') {
                    cardData = {
                      question: (input.question as string) ?? '',
                      options: (input.options as unknown[]) ?? [],
                      allowMultiple: input.allowMultiple as boolean | undefined,
                    };
                  } else if (toolName === 'create_file') {
                    const blockFcConfidence = typeof input.confidence === 'number' ? Math.max(0, Math.min(1, input.confidence)) : undefined;
                    cardData = {
                      fileName: (input.fileName as string) ?? '',
                      content: (input.content as string) ?? '',
                      reasoning: input.reasoning as string | undefined,
                      status: 'pending' as const,
                      ...(blockFcConfidence != null && { confidence: blockFcConfidence }),
                    };
                  } else if (toolName === 'write_file' || toolName === 'delete_file' || toolName === 'rename_file') {
                    const opType = toolName.replace('_file', '') as 'write' | 'delete' | 'rename';
                    cardData = {
                      type: opType,
                      fileName: (input.fileName as string) ?? '',
                      success: true,
                      newFileName: toolName === 'rename_file' ? (input.newFileName as string) : undefined,
                    };
                  } else if (toolName === 'push_to_shopify' || toolName === 'pull_from_shopify' || toolName === 'list_themes' || toolName === 'list_store_resources' || toolName === 'get_shopify_asset') {
                    const shopifyType = ({
                      push_to_shopify: 'push',
                      pull_from_shopify: 'pull',
                      list_themes: 'list_themes',
                      list_store_resources: 'list_resources',
                      get_shopify_asset: 'get_asset',
                    } as const)[toolName];
                    cardData = {
                      type: shopifyType,
                      status: 'success' as const,
                      summary: (input.reason as string) ?? `${shopifyType} completed`,
                    };
                  } else if (toolName === 'screenshot_preview') {
                    cardData = { url: (input.path as string) ?? '/', path: (input.path as string) ?? '/' };
                  } else if (toolName === 'compare_screenshots') {
                    cardData = {
                      beforeUrl: (input.beforeUrl as string) ?? '',
                      afterUrl: (input.afterUrl as string) ?? '',
                      threshold: (input.threshold as number) ?? 2.0,
                    };
                  }

                  if (matchIdx >= 0) {
                    const b = blocksRef.current[matchIdx];
                    if (b.type === 'tool_action') {
                      b.status = 'done';
                      b.label = doneLabel;
                      b.subtitle = subtitle;
                      b.cardType = cardType;
                      b.cardData = cardData;
                    }
                  } else {
                    // Fallback: no matching tool_start, create done block directly
                    blocksRef.current.push({
                      type: 'tool_action',
                      id: crypto.randomUUID(),
                      toolId: toolName,
                      toolName,
                      label: doneLabel,
                      subtitle,
                      status: 'done',
                      cardType,
                      cardData,
                    });
                  }
                  updateMessage(assistantMsgId, streamedContent, {
                    ...clearActive,
                    blocks: [...blocksRef.current],
                  });
                }
                continue;
              }
              // Handle tool_result: carry result data into card + handle net-zero edits
              if (sseEvent.type === 'tool_result') {
                const trEvent = sseEvent as SSEToolResultEvent;

                // Enrich existing tool block with result data for rich cards
                if (trEvent.data) {
                  const matchIdx = blocksRef.current.findLastIndex(
                    (b: ContentBlock) => b.type === 'tool_action' && (b.toolName === trEvent.name || b.toolId === trEvent.id)
                  );
                  if (matchIdx >= 0) {
                    const b = blocksRef.current[matchIdx];
                    if (b.type === 'tool_action') {
                      const cardType = getToolCardType(trEvent.name);
                      if (cardType && trEvent.data) {
                        b.cardType = cardType;
                        b.cardData = trEvent.data;
                        b.status = 'done';
                      }
                    }
                    updateMessage(assistantMsgId, streamedContent, {
                      blocks: [...blocksRef.current],
                    });
                  }
                }

                if (trEvent.netZero) {
                  const matchIdx = blocksRef.current.findIndex(
                    (b) => b.type === 'tool_action' && b.toolId === trEvent.name && b.status === 'done'
                  );
                  if (matchIdx >= 0) {
                    const b = blocksRef.current[matchIdx];
                    if (b.type === 'tool_action') {
                      b.status = 'error';
                      b.label = `${b.label ?? trEvent.name} (no change)`;
                    }
                    updateMessage(assistantMsgId, streamedContent, {
                      blocks: [...blocksRef.current],
                    });
                  }
                }
                continue;
              }
              // F1: Virtual worktree status for parallel agent isolation
              if (sseEvent.type === 'worktree_status') {
                updateMessage(assistantMsgId, streamedContent, {
                  worktreeStatus: {
                    worktrees: sseEvent.worktrees ?? [],
                    conflicts: sseEvent.conflicts ?? [],
                  },
                });
                continue;
              }
              // Handle diagnostics events — attach to most recent thinking step
              if (sseEvent.type === 'diagnostics') {
                const steps = thinkingStepsRef.current;
                const diagEvent = sseEvent as SSEDiagnosticsEvent;
                const isThemeArtifact =
                  typeof diagEvent.detail === 'string' &&
                  diagEvent.detail.includes('## Theme-wide Plan Artifact');
                if (isThemeArtifact) {
                  // Surface artifact as an explicit tool card so users can expand/copy it.
                  blocksRef.current.push({
                    type: 'tool_action',
                    id: crypto.randomUUID(),
                    toolId: `theme-artifact-${Date.now()}`,
                    toolName: 'theme_artifact',
                    label: 'Theme-wide Plan Artifact',
                    subtitle: 'Dependency map, file matrix, batches, and policy checks',
                    status: 'done',
                    cardType: 'theme_artifact',
                    cardData: { markdown: diagEvent.detail },
                  });
                  updateMessage(assistantMsgId, streamedContent, {
                    blocks: [...blocksRef.current],
                  });
                  continue;
                }
                if (steps.length > 0 && diagEvent.file) {
                  steps[steps.length - 1].diagnostics = {
                    file: diagEvent.file,
                    errorCount: diagEvent.errorCount ?? 0,
                    warningCount: diagEvent.warningCount ?? 0,
                  };
                  updateMessage(assistantMsgId, streamedContent, {
                    thinkingSteps: [...steps],
                  });
                }
                continue;
              }
              // Handle worker_progress events — track parallel worker status
              if (sseEvent.type === 'worker_progress') {
                const workerEvent = sseEvent as SSEWorkerProgressEvent;
                const status = workerEvent.status;
                const files = workerEvent.files ?? (workerEvent.metadata?.affectedFiles as string[] | undefined) ?? [];

                setActiveSpecialists((prev) => {
                  const next = new Map(prev);
                  if (status === 'dispatched' || status === 'started' || status === 'running') {
                    next.set(workerEvent.workerId, {
                      id: workerEvent.workerId,
                      type: workerEvent.label?.split(':')[0] ?? 'specialist',
                      label: workerEvent.label || 'Working...',
                      status: 'running',
                      files,
                      startedAt: Date.now(),
                    });
                  } else if (status === 'completed' || status === 'complete') {
                    const existing = next.get(workerEvent.workerId);
                    if (existing) next.set(workerEvent.workerId, { ...existing, status: 'complete' });
                  } else if (status === 'failed') {
                    const existing = next.get(workerEvent.workerId);
                    if (existing) next.set(workerEvent.workerId, { ...existing, status: 'failed' });
                  }
                  return next;
                });

                const workers = (workersRef.current ?? []) as Array<{ workerId: string; label: string; status: 'running' | 'complete' }>;
                const workerStatus = status === 'completed' || status === 'complete' ? 'complete' : 'running';
                const existingIdx = workers.findIndex((w) => w.workerId === workerEvent.workerId);
                if (existingIdx >= 0) {
                  workers[existingIdx] = { workerId: workerEvent.workerId, label: workerEvent.label, status: workerStatus };
                } else {
                  workers.push({ workerId: workerEvent.workerId, label: workerEvent.label, status: workerStatus });
                }
                workersRef.current = workers;

                // Agent Live Breakout: auto-open files from worker_progress metadata
                const wpMeta = workerEvent.metadata;
                const affectedFiles = files.length > 0 ? files : (wpMeta?.affectedFiles as string[] | undefined);
                if (
                  (status === 'running' || status === 'started' || status === 'dispatched') &&
                  affectedFiles &&
                  Array.isArray(affectedFiles) &&
                  affectedFiles.length > 0
                ) {
                  onOpenFiles?.(affectedFiles);
                }

                // Phase 8: Pass workers to ThinkingBlock via message metadata
                updateMessage(assistantMsgId, streamedContent, {
                  thinkingSteps: thinkingStepsRef.current.length > 0 ? [...thinkingStepsRef.current] : undefined,
                  workers: [...workers],
                });
                continue;
              }

              // Handle checkpointed event — agent saved state and is continuing in background
              if (sseEvent.type === 'checkpointed') {
                const meta = sseEvent.metadata as { executionId?: string; iteration?: number } | undefined;
                updateMessage(assistantMsgId, streamedContent, {
                  backgroundTask: {
                    executionId: meta?.executionId || '',
                    iteration: meta?.iteration ?? 0,
                    status: 'running' as const,
                  },
                });
                continue;
              }

              if (sseEvent.type === 'thinking') {
                const metadata = sseEvent.metadata as Record<string, unknown> | undefined;
                const rawTier = metadata?.routingTier as string | undefined;
                const validTier = rawTier && ['TRIVIAL', 'SIMPLE', 'COMPLEX', 'ARCHITECTURAL'].includes(rawTier)
                  ? rawTier as 'TRIVIAL' | 'SIMPLE' | 'COMPLEX' | 'ARCHITECTURAL'
                  : undefined;
                const rawStrategy = metadata?.strategy as string | undefined;
                const validStrategy = rawStrategy && ['SIMPLE', 'HYBRID', 'GOD_MODE'].includes(rawStrategy)
                  ? rawStrategy as 'SIMPLE' | 'HYBRID' | 'GOD_MODE'
                  : undefined;
                const incomingRail = mapCoordinatorPhase(sseEvent.phase);

                // ── Consolidation: reduce noise by merging related events ──
                const steps = [...thinkingStepsRef.current];
                const lastStep = steps.length > 0 ? steps[steps.length - 1] : null;
                const isHeartbeat = sseEvent.label?.startsWith('Still ');
                const samePhase = lastStep && !lastStep.done && incomingRail === lastStep.railPhase;
                const hasTierEscalation = !!validTier;

                if (isHeartbeat && lastStep && !lastStep.done) {
                  // Heartbeat: update detail on current step, don't add a row
                  lastStep.detail = sseEvent.detail ?? lastStep.detail;
                } else if (samePhase && !hasTierEscalation && sseEvent.phase !== 'complete' && sseEvent.phase !== 'clarification') {
                  // Same-phase continuation (retry, context reduction, etc.):
                  // replace the current step's label/detail in-place
                  lastStep!.label = sseEvent.label ?? lastStep!.label;
                  lastStep!.detail = sseEvent.detail;
                  if (sseEvent.agent) lastStep!.agent = sseEvent.agent;
                  if (sseEvent.analysis) lastStep!.analysis = sseEvent.analysis;
                  if (sseEvent.summary) lastStep!.summary = sseEvent.summary;
                  if (sseEvent.subPhase) lastStep!.subPhase = sseEvent.subPhase as ThinkingStep['subPhase'];
                  if (metadata) lastStep!.metadata = metadata as ThinkingStep['metadata'];
                } else {
                  // Phase transition or tier escalation: mark previous done, add new step
                  for (const s of steps) s.done = true;
                  steps.push({
                    phase: sseEvent.phase,
                    label: sseEvent.label,
                    detail: sseEvent.detail,
                    agent: sseEvent.agent,
                    analysis: sseEvent.analysis,
                    summary: sseEvent.summary,
                    done: sseEvent.phase === 'complete',
                    startedAt: Date.now(),
                    routingTier: validTier,
                    strategy: validStrategy,
                    model: metadata?.model as string | undefined,
                    railPhase: incomingRail,
                    subPhase: (sseEvent.subPhase ?? undefined) as ThinkingStep['subPhase'],
                    metadata: metadata as ThinkingStep['metadata'],
                  });
                }

                thinkingStepsRef.current = steps;
                if (sseEvent.label) setCurrentAction(sseEvent.label);
                setCurrentPhase(sseEvent.phase);
                if (sseEvent.phase === 'complete') thinkingComplete = true;

                // B2: Clarification event — append a clarification message to the chat
                // so the user sees the questions and can respond in the same thread.
                // If structured options are available, wire them to ClarificationCard.
                if (sseEvent.phase === 'clarification') {
                  const clarificationText =
                    sseEvent.detail ?? 'I need more information to proceed. Could you clarify your request?';
                  streamedContent += clarificationText;

                  // Extract structured options from metadata (sent by coordinator)
                  const metaOptions = sseEvent.metadata?.options as
                    | Array<{ id: string; label: string; recommended?: boolean }>
                    | undefined;
                  // Extract a short question from the first line or fallback
                  const firstLine = clarificationText.split('\n').find(
                    (l: string) => l.trim().length > 0 && !l.trim().match(/^\d+[.)]/),
                  ) ?? 'Which option would you like?';
                  hasClarificationCardForRun = true;
                  updateMessage(assistantMsgId, streamedContent, {
                    clarification: {
                      question: firstLine.trim().slice(0, 200),
                      options:
                        metaOptions && metaOptions.length > 0
                          ? metaOptions.map((o) => ({
                              id: o.id,
                              label: o.label,
                              recommended: o.recommended,
                            }))
                          : [
                              { id: 'confirm-target', label: 'I will confirm the exact target file(s).' },
                              { id: 'provide-snippet', label: 'I will provide exact snippet to replace.' },
                            ],
                      allowFreeform: true,
                      round:
                        typeof sseEvent.metadata?.clarificationRound === 'number'
                          ? (sseEvent.metadata.clarificationRound as number)
                          : undefined,
                      maxRounds:
                        typeof sseEvent.metadata?.maxRounds === 'number'
                          ? (sseEvent.metadata.maxRounds as number)
                          : undefined,
                    },
                  });
                }

                // Budget warning: track truncation state for ContextMeter
                if (sseEvent.phase === 'budget_warning') {
                  updateMessage(assistantMsgId, streamedContent, {
                    budgetTruncated: true,
                  });
                }

                // Agent Live Breakout: auto-open files when agents identify them
                if (
                  sseEvent.phase === 'executing' &&
                  metadata?.affectedFiles &&
                  Array.isArray(metadata.affectedFiles) &&
                  (metadata.affectedFiles as string[]).length > 0
                ) {
                  onOpenFiles?.(metadata.affectedFiles as string[]);
                }

                // Agent Live Breakout: report active agent for breakout viewer
                if (sseEvent.phase === 'executing' && metadata?.agentType) {
                  const firstFile = Array.isArray(metadata.affectedFiles) && (metadata.affectedFiles as string[]).length > 0
                    ? (metadata.affectedFiles as string[])[0]
                    : null;
                  onAgentActivity?.({
                    agentType: metadata.agentType as string,
                    agentLabel: sseEvent.label ?? undefined,
                    filePath: firstFile,
                    liveContent: null,
                  });
                } else if (sseEvent.phase === 'complete') {
                  onAgentActivity?.({ agentType: null, filePath: null, liveContent: null });
                }

                // ── Block building: create or update thinking block ──
                {
                  const existingThinking = blocksRef.current.find(b => b.type === 'thinking');
                  if (!existingThinking) {
                    thinkingStartedAtRef.current = Date.now();
                    blocksRef.current.unshift({
                      type: 'thinking',
                      id: crypto.randomUUID(),
                      startedAt: thinkingStartedAtRef.current,
                      reasoningText: '',
                      done: sseEvent.phase === 'complete',
                      elapsedMs: 0,
                    });
                  } else if (existingThinking.type === 'thinking' && sseEvent.phase === 'complete') {
                    existingThinking.done = true;
                    existingThinking.elapsedMs = Date.now() - existingThinking.startedAt;
                  }
                  // Heartbeats ("Still generating...", "Still working...") are silently
                  // consumed — the pulsing "Thinking..." label + elapsed counter already
                  // communicate activity. Only the stall detection timer (90s/120s)
                  // appends advisory text.
                }

                // Update message with thinking steps
                updateMessage(assistantMsgId, streamedContent, {
                  thinkingSteps: [...steps],
                  thinkingComplete,
                  blocks: [...blocksRef.current],
                });
                continue;
              }

              // Reasoning chunks: live LLM output streamed token-by-token.
              // Append to the latest thinking step's reasoning field so the UI
              // can show a collapsible live-text view per agent.
              if (sseEvent.type === 'reasoning') {
                const steps = thinkingStepsRef.current;
                if (steps.length > 0) {
                  const last = steps[steps.length - 1];
                  last.reasoning = (last.reasoning ?? '') + sseEvent.text;
                  last.reasoningAgent = sseEvent.agent;
                  thinkingStepsRef.current = [...steps];
                  updateMessage(assistantMsgId, streamedContent, {
                    thinkingSteps: [...thinkingStepsRef.current],
                  });
                }
                // Block building: append reasoning text to thinking block (debounced at 50ms)
                {
                  const tb = blocksRef.current.find(b => b.type === 'thinking');
                  if (tb && tb.type === 'thinking') {
                    tb.reasoningText += sseEvent.text;
                  } else {
                    // No thinking block yet — create one
                    thinkingStartedAtRef.current = Date.now();
                    blocksRef.current.unshift({
                      type: 'thinking',
                      id: crypto.randomUUID(),
                      startedAt: thinkingStartedAtRef.current,
                      reasoningText: sseEvent.text,
                      done: false,
                      elapsedMs: 0,
                    });
                  }
                  if (reasoningDebounceRef.current) clearTimeout(reasoningDebounceRef.current);
                  reasoningDebounceRef.current = setTimeout(() => {
                    updateMessage(assistantMsgId, streamedContent, {
                      blocks: [...blocksRef.current],
                    });
                  }, 50);
                }
                continue;
              }
            }

            // Content chunk — check if it's actually a structured SSE event
            // that wasn't caught by the main parser (e.g., split across chunks)
            if (chunk.trim().startsWith('data: {') || chunk.includes('event: synapse')) {
              const innerEvent = parseSSEEvent(chunk);
              if (innerEvent) {
                lastSSEEventTimeRef.current = Date.now();
                if (innerEvent.type === 'error') receivedError = innerEvent;
                if (innerEvent.type === 'done') receivedDone = true;
                if (innerEvent.type === 'thinking') {
                  const innerMeta = innerEvent.metadata as Record<string, unknown> | undefined;
                  const innerRawTier = innerMeta?.routingTier as string | undefined;
                  const innerValidTier = innerRawTier && ['TRIVIAL', 'SIMPLE', 'COMPLEX', 'ARCHITECTURAL'].includes(innerRawTier)
                    ? innerRawTier as 'TRIVIAL' | 'SIMPLE' | 'COMPLEX' | 'ARCHITECTURAL'
                    : undefined;
                  const steps = thinkingStepsRef.current.map(s => ({ ...s, done: true }));
                  steps.push({
                    phase: innerEvent.phase,
                    label: innerEvent.label,
                    detail: innerEvent.detail,
                    agent: innerEvent.agent,
                    analysis: innerEvent.analysis,
                    summary: innerEvent.summary,
                    done: innerEvent.phase === 'complete',
                    startedAt: Date.now(),
                    routingTier: innerValidTier,
                    model: innerMeta?.model as string | undefined,
                    railPhase: mapCoordinatorPhase(innerEvent.phase),
                    subPhase: ((innerEvent as SSEThinkingEvent).subPhase ?? undefined) as ThinkingStep['subPhase'],
                    metadata: innerMeta as ThinkingStep['metadata'],
                  });
                  thinkingStepsRef.current = steps;
                  if (innerEvent.phase === 'complete') thinkingComplete = true;
                  updateMessage(assistantMsgId, streamedContent, {
                    thinkingSteps: [...steps],
                    thinkingComplete,
                  });
                }
                continue;
              }
            }

            // Reset stall detection on content chunk
            lastSSEEventTimeRef.current = Date.now();

            // First text content arriving means thinking is done
            if (!thinkingComplete && thinkingStepsRef.current.length > 0) {
              thinkingComplete = true;
              const steps = thinkingStepsRef.current.map(s => ({ ...s, done: true }));
              thinkingStepsRef.current = steps;
              // Block building: finalize thinking block on first text
              const tb = blocksRef.current.find(b => b.type === 'thinking' && !b.done);
              if (tb && tb.type === 'thinking') {
                tb.done = true;
                tb.elapsedMs = Date.now() - tb.startedAt;
              }
            }

            streamedContent += chunk;

            // Block building: buffer content for text blocks
            contentBufferRef.current += chunk;

            // Debounced content update (100ms) to reduce react-markdown re-renders
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = setTimeout(() => {
              flushContentBuffer();
              updateMessage(assistantMsgId, streamedContent, {
                thinkingSteps: thinkingStepsRef.current.length > 0 ? [...thinkingStepsRef.current] : undefined,
                thinkingComplete: thinkingComplete || undefined,
                blocks: [...blocksRef.current],
              });
            }, 100);
            }
          }
        }

        // Flush any trailing non-event carry as text.
        if (streamCarry.trim().length > 0 && !parseSSEEvent(streamCarry)) {
          streamedContent += streamCarry;
          contentBufferRef.current += streamCarry;
        }

        // Clean up timers (client timeout, stall detection) and flush debounce
        clearTimeout(clientTimeout);
        if (stallTimerRef.current) { clearInterval(stallTimerRef.current); stallTimerRef.current = null; }
        if (reasoningDebounceRef.current) { clearTimeout(reasoningDebounceRef.current); reasoningDebounceRef.current = null; }
        // Stream ended — ensure we show Complete and final content
        thinkingComplete = true;
        const stepsToFlush = thinkingStepsRef.current.map(s => ({ ...s, done: true }));
        thinkingStepsRef.current = stepsToFlush;
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
        }
        // Finalize blocks (implicit done if stream ends without done event)
        finalizeBlocks();
        const stepsForMessage = stepsToFlush.length > 0 ? [...stepsToFlush] : undefined;
        if (streamedContent || stepsForMessage || blocksRef.current.length > 0) {
          updateMessage(assistantMsgId, streamedContent, {
            thinkingSteps: stepsForMessage,
            thinkingComplete: true,
            blocks: blocksRef.current.length > 0 ? [...blocksRef.current] : undefined,
          });
        }

        // ── Handle SSE error events ─────────────────────────────────────
        if (receivedError) {
          const code = receivedError.code;
          const userMsg =
            (code === 'UNKNOWN' && receivedError.message)
              ? receivedError.message
              : (ERROR_CODE_MESSAGES[code] ?? receivedError.message ?? 'Something went wrong.');
          setErrorCode(code);
          setError(userMsg);

          if (streamedContent) {
            // Partial content was received before the error — append error note
            streamedContent += `\n\n---\n**Error:** ${userMsg}`;
            updateMessage(assistantMsgId, streamedContent);
            finalizeMessage(assistantMsgId);
          } else {
            // No content — show in-thread error message with hints
            const hints: string[] = [];
            if (code === 'CONTEXT_TOO_LONG') hints.push('Try starting a **new chat** to free up context.');
            else if (code === 'QUOTA_EXCEEDED') hints.push('Your usage quota has been reached. **Upgrade your plan** to continue.');
            else if (code === 'AUTH_ERROR') hints.push('Check your API key configuration in **Settings**.');
            else hints.push('You can **retry** or **edit your message** and try again.');
            const inThreadMsg = `**Error:** ${userMsg}\n\n${hints.join(' ')}`;
            updateMessage(assistantMsgId, inThreadMsg);
            finalizeMessage(assistantMsgId);
          }

          // Auto-retry for transient errors (max 1 auto-retry)
          if (AUTO_RETRY_CODES.has(code) && autoRetryCountRef.current < 1) {
            autoRetryCountRef.current += 1;
            const timeoutFallbackToSolo = code === 'TIMEOUT' && maxAgents > 1;
            if (timeoutFallbackToSolo) {
              retrySubagentOverrideRef.current = 1;
              setMaxAgents(1);
            }
            const delay = code === 'RATE_LIMITED' ? 5000 : 1500;
            setIsRetrying(true);
            setError(
              code === 'RATE_LIMITED'
                ? 'Rate limited — retrying...'
                : timeoutFallbackToSolo
                  ? 'Timed out in multi-agent mode — retrying in 1x...'
                  : code === 'TIMEOUT'
                    ? 'Timed out — retrying...'
                    : 'Empty response — retrying...'
            );
            setTimeout(() => {
              setIsRetrying(false);
              setError(null);
              setErrorCode(null);
              onSend(lastPromptRef.current);
            }, delay);
          }

          return;
        }

        // Reset auto-retry counter on success
        autoRetryCountRef.current = 0;

        if (streamedContent) {
          finalizeMessage(assistantMsgId);
          setLastResponseContent(streamedContent);

          // EPIC 5: Detect signals and infer output mode
          const signals = detectSignals(streamedContent);
          const mode_ = inferOutputMode(signals);
          setOutputMode(mode_);

          // EPIC 2: Token estimation and reporting
          const inputTokens = estimateTokens(enrichedContent + (domContext ?? ''));
          const outputTokens = estimateTokens(streamedContent);
          onTokenUsage?.({ inputTokens, outputTokens });

          // EPIC 2: Detect short response → show retry chip
          const trimmed = streamedContent.trim();
          if (trimmed.length < 200 || trimmed.split('\n').length < 3) {
            setShowRetryChip(true);
          }

          // Record the action type for arc detection
          const actionType = detectActionType(streamedContent);
          recordAction(projectId, {
            type: actionType,
            timestamp: Date.now(),
            context: { filePath: context.filePath ?? undefined, fileLanguage: context.fileLanguage ?? undefined },
          });

          // EPIC 5: Track conversation turn
          arcRef.current.addTurn('assistant', actionType);

          // Auto-open files mentioned in code/debug responses
          if (onOpenFile && (intentMode === 'code' || intentMode === 'debug')) {
            const filePaths = detectFilePaths(streamedContent);
            for (const fp of filePaths.slice(0, 5)) {
              onOpenFile(fp.path);
            }
          }

          // EPIC V3: Trigger preview verification if code edits were proposed
          if (verifyPreview && accumulatedCodeEdits.length > 0) {
            // Fire non-blocking — don't await. Results surface as a thinking step
            // and/or an inline note on the assistant message.
            verifyPreview(projectId).then((verifyResult) => {
              if (!verifyResult || verifyResult.regressions.length === 0) return;

              const errorCount = verifyResult.regressions.filter(r => r.severity === 'error').length;
              const warningCount = verifyResult.regressions.filter(r => r.severity === 'warning').length;
              const regressionLabel = verifyResult.passed
                ? `Preview check: ${warningCount} warning(s), no structural errors`
                : `Preview regressions: ${errorCount} error(s), ${warningCount} warning(s) detected`;

              // Add as a thinking step for the progress rail
              const steps = thinkingStepsRef.current.map(s => ({ ...s, done: true }));
              steps.push({
                phase: 'validating' as const,
                label: regressionLabel,
                done: true,
                startedAt: Date.now(),
              });
              thinkingStepsRef.current = steps;

              // Also append a visible note on the message
              if (!verifyResult.passed) {
                const details = verifyResult.regressions
                  .filter(r => r.severity === 'error')
                  .slice(0, 3)
                  .map(r => `- ${r.description}`)
                  .join('\n');
                const regressionNote = `\n\n> **Preview check:** ${errorCount} potential regression(s) detected:\n${details}\n>\n> Please verify the preview visually.`;
                updateMessage(assistantMsgId, streamedContent + regressionNote, {
                  thinkingSteps: [...steps],
                });
              } else {
                updateMessage(assistantMsgId, streamedContent, {
                  thinkingSteps: [...steps],
                });
              }
            }).catch(() => { /* best-effort — never block the UI */ });
          }
        }
      } catch (err) {
        // Clean up timers on error
        clearTimeout(clientTimeout);
        if (stallTimerRef.current) { clearInterval(stallTimerRef.current); stallTimerRef.current = null; }
        if (debounceTimerRef.current) { clearTimeout(debounceTimerRef.current); debounceTimerRef.current = null; }

        if (err instanceof DOMException && err.name === 'AbortError') {
          // EC-1: Stopped mid-stream — flush blocks with current state (loading tools stay loading)
          if (blocksRef.current.length > 0) {
            flushContentBuffer();
            const tb = blocksRef.current.find(b => b.type === 'thinking' && !b.done);
            if (tb && tb.type === 'thinking') {
              tb.done = true;
              tb.elapsedMs = Date.now() - tb.startedAt;
            }
            updateMessage(assistantMsgId, streamedContent, {
              blocks: [...blocksRef.current],
              thinkingComplete: true,
            });
          }
          return;
        }
        const msg = err instanceof Error ? err.message : 'Request failed';
        setError(msg);

        if (streamedContent) {
          streamedContent += '\n\n*Connection interrupted.*';
          // EC-2: Error mid-stream — finalize blocks with error state
          if (blocksRef.current.length > 0) {
            const loadingBlock = blocksRef.current.findLast(
              (b: ContentBlock) => b.type === 'tool_action' && b.status === 'loading'
            );
            if (loadingBlock && loadingBlock.type === 'tool_action') {
              loadingBlock.status = 'error';
              loadingBlock.error = msg;
            }
            flushContentBuffer();
            blocksRef.current.push({
              type: 'text', id: crypto.randomUUID(),
              text: '\n\n*Connection interrupted.*',
            });
          }
          updateMessage(assistantMsgId, streamedContent, {
            blocks: blocksRef.current.length > 0 ? [...blocksRef.current] : undefined,
          });
          finalizeMessage(assistantMsgId);
        } else {
          appendMessage('assistant', `Error: ${msg}`);
        }
      } finally {
        setIsLoading(false);
        if (abortRef.current === controller) abortRef.current = null;
        // Ensure timers are always cleaned up
        if (stallTimerRef.current) { clearInterval(stallTimerRef.current); stallTimerRef.current = null; }
        if (debounceTimerRef.current) { clearTimeout(debounceTimerRef.current); debounceTimerRef.current = null; }
        if (reasoningDebounceRef.current) { clearTimeout(reasoningDebounceRef.current); reasoningDebounceRef.current = null; }
        // Phase 4a: End live preview session
        onLiveSessionEnd?.();
      }
    },
    [projectId, messages, appendMessage, addLocalMessage, updateMessage, finalizeMessage, context.filePath, context.fileLanguage, context.selection, getPreviewSnapshot, getActiveFileContent, onTokenUsage, maxAgents, specialistMode, model, intentMode, useFlatPipeline, getPassiveContext, contextSuggestions, responseSuggestionsWithRetry, onOpenFile, openTabIds, selectedElement, resolveFileContent, captureBeforeSnapshot, verifyPreview, pendingAnnotation, onClearAnnotation, onLiveChange, onLiveSessionStart, onLiveSessionEnd, pinnedPrefs, styleGuide, onOpenFiles, onScrollToEdit, onAgentActivity, onCodePaneUpdate, onCodePaneReset, setMaxAgents, onBatchDiff]
  );

  // EPIC 5: Expose onSend for QuickActions/Fix with AI
  useEffect(() => {
    if (sendMessageRef) sendMessageRef.current = onSend;
    return () => {
      if (sendMessageRef) sendMessageRef.current = null;
    };
  }, [onSend, sendMessageRef]);

  // Mode-switch auto-submit: when intentMode changes and there's a pending send
  // from the ModeSwitchButton, fire it now that the mode state is current.
  useEffect(() => {
    const pending = pendingModeSwitchSend.current;
    if (pending && !isLoading) {
      pendingModeSwitchSend.current = null;
      // Small RAF to ensure state is fully flushed before sending
      requestAnimationFrame(() => onSend(pending));
    }
  }, [intentMode, isLoading, onSend]);

  // Wire onApplyStatsRef so the project page can report diff stats after applying code
  useEffect(() => {
    if (onApplyStatsRef) {
      onApplyStatsRef.current = (stats) => {
        if (activeSessionId) {
          recordApplyStats(activeSessionId, stats);
        }
      };
    }
    return () => {
      if (onApplyStatsRef) onApplyStatsRef.current = null;
    };
  }, [onApplyStatsRef, activeSessionId, recordApplyStats]);

  // Reset decision scan when session changes
  useEffect(() => {
    lastDecisionScanRef.current = 0;
  }, [activeSessionId]);

  // Load Shopify push log for version history sidebar visibility.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/shopify/push-history`);
        if (!res.ok || cancelled) return;
        const json = await res.json();
        const rows = (json?.data ?? json ?? []) as Array<Record<string, unknown>>;
        const mapped = rows.map((r) => ({
          id: String(r.id ?? ''),
          pushedAt: String(r.pushed_at ?? ''),
          trigger: String(r.trigger ?? 'manual'),
          note: (r.note as string | null) ?? null,
          fileCount: Number(r.file_count ?? 0),
        })).filter((r) => r.id && r.pushedAt);
        if (!cancelled) setPushLog(mapped);
      } catch {
        // Non-blocking sidebar enhancement.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // EPIC 14: Extract decisions from completed conversations
  useEffect(() => {
    if (isLoading || messages.length < 2) return;
    if (memoryWriteUnavailableRef.current) return;
    if (messages.length <= lastDecisionScanRef.current) return;

    const newMsgs = messages.slice(lastDecisionScanRef.current);
    lastDecisionScanRef.current = messages.length;

    const chatMsgs: DecisionChatMessage[] = newMsgs.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
      timestamp: new Date().toISOString(),
    }));

    const decisions = extractDecisionsFromChat(chatMsgs);

    let cancelled = false;
    (async () => {
      for (const d of decisions) {
        if (cancelled || memoryWriteUnavailableRef.current) break;
        if (d.confidence < 0.7) continue;

        try {
          const res = await fetch(`/api/projects/${projectId}/memory`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'decision',
              content: d.decision,
              confidence: d.confidence,
            }),
          });

          // If developer memory is unavailable in this environment, stop retrying.
          if (res.status === 503) {
            memoryWriteUnavailableRef.current = true;
            break;
          }

          const body = await res.json().catch(() => null) as { unavailable?: boolean } | null;
          if (body?.unavailable) {
            memoryWriteUnavailableRef.current = true;
            break;
          }
        } catch {
          // Best-effort only; don't interrupt chat flow.
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoading, messages, projectId]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setIsStopped(true);
    setIsLoading(false);
  }, []);

  const handleReview = useCallback(() => {
    onSend('Review all the changes we have discussed so far. Check for issues, improvements, and verify correctness.');
  }, [onSend]);

  const handleReviewTranscript = useCallback(async () => {
    if (isReviewingTranscript || !activeSessionId) return;
    setIsReviewingTranscript(true);
    try {
      const review = await reviewSessionTranscript(activeSessionId);
      if (!review) {
        appendMessage('assistant', 'Transcript review is unavailable for this session right now. Try again shortly.');
        return;
      }

      const findings = review.findings.slice(0, 6).map((f) => `- [${f.severity.toUpperCase()}] ${f.message}`);
      const response = [
        '## Transcript Review',
        '',
        `Loop risk: ${review.likelyLooping ? 'high' : 'low'}`,
        '',
        review.summary,
        '',
        '### Findings',
        findings.length > 0 ? findings.join('\n') : '- No major findings.',
      ].join('\n');
      appendMessage('assistant', response);
    } finally {
      setIsReviewingTranscript(false);
    }
  }, [isReviewingTranscript, activeSessionId, reviewSessionTranscript, appendMessage]);

  // Phase 2: Update a code edit's status (applied/rejected) within a message
  const handleEditStatusChange = useCallback((messageId: string, editIndex: number, status: 'applied' | 'rejected') => {
    const msg = messages.find((m) => m.id === messageId);
    if (!msg?.codeEdits) return;
    const updatedEdits = msg.codeEdits.map((edit, i) =>
      i === editIndex ? { ...edit, status } : edit,
    );
    updateMessage(messageId, msg.content, { codeEdits: updatedEdits });
  }, [messages, updateMessage]);

  // EPIC 2: Clear chat — reset local state and clear messages from hook
  const handleClearChat = useCallback(() => {
    setLastResponseContent(null);
    setShowRetryChip(false);
    setError(null);
    setErrorCode(null);
    setIsStopped(false);
    autoRetryCountRef.current = 0;
    arcRef.current.reset();
    setOutputMode('chat');
    clearMessages();
  }, [clearMessages]);

  // Tracks if the current active session was created with cleanStart
  const isCleanStartSession = useRef(false);

  // New Chat — create a new session and reset state
  // Pass cleanStart: true for a fully clean slate (no cross-session memory)
  const handleNewChat = useCallback(async (opts?: { cleanStart?: boolean }) => {
    setLastResponseContent(null);
    setShowRetryChip(false);
    setError(null);
    setErrorCode(null);
    setIsStopped(false);
    autoRetryCountRef.current = 0;
    arcRef.current.reset();
    setOutputMode('chat');
    setContextPressure(null);
    isCleanStartSession.current = opts?.cleanStart ?? false;
    await createNewSession(opts);
  }, [createNewSession]);

  // Switch session
  const handleSwitchSession = useCallback(
    async (sessionId: string) => {
      setLastResponseContent(null);
      setShowRetryChip(false);
      setError(null);
      setErrorCode(null);
      setIsStopped(false);
      arcRef.current.reset();
      setOutputMode('chat');
      setContextPressure(null);
      isCleanStartSession.current = false;
      await switchSession(sessionId);
    },
    [switchSession],
  );

  // ── Regenerate: remove last user+assistant pair, resend last user message ──
  const handleRegenerate = useCallback(() => {
    const lastUserContent = removeLastTurn();
    if (lastUserContent) {
      onSend(lastUserContent);
    }
  }, [removeLastTurn, onSend]);

  // ── Edit and resend: truncate messages at index, resend with new content ──
  const handleEditAndResend = useCallback(
    (index: number, newContent: string) => {
      truncateAt(index);
      // Small delay to let React flush the truncation before sending
      setTimeout(() => onSend(newContent), 0);
    },
    [truncateAt, onSend],
  );

  // ── Intent-mode dynamic placeholder ────────────────────────────────────
  const intentPlaceholder = useMemo(() => {
    switch (intentMode) {
      case 'ask': return 'Ask a question about your code...';
      case 'plan': return 'Describe what you want to plan...';
      case 'debug': return 'Describe the issue or paste an error...';
      case 'code':
      default: return 'Describe the change you want...';
    }
  }, [intentMode]);

  // Post-error suggestion chips keyed by error code (Suggestion shape for SuggestionChips)
  const errorSuggestions = useMemo((): Suggestion[] => {
    if (!errorCode || isRetrying) return [];
    const chips: { id: string; label: string; prompt: string }[] = [];
    switch (errorCode) {
      case 'CONTEXT_TOO_LONG':
        chips.push({ id: 'err-shorter', label: 'Be more specific', prompt: 'Can you focus on just the main issue? Keep it brief.' });
        if (intentMode !== 'ask') chips.push({ id: 'err-ask', label: 'Try Ask mode', prompt: 'Switch to Ask mode for a simpler question.' });
        break;
      case 'TIMEOUT':
        chips.push({ id: 'err-simpler', label: 'Simplify request', prompt: 'Can you break this into a smaller step?' });
        chips.push({ id: 'err-solo', label: 'Try 1x mode', prompt: 'Try again with a single agent for a faster response.' });
        break;
      case 'CONTENT_FILTERED':
        chips.push({ id: 'err-rephrase', label: 'Rephrase request', prompt: '' });
        break;
      case 'EMPTY_RESPONSE':
      case 'PARSE_ERROR':
        chips.push({ id: 'err-retry-detail', label: 'Add more detail', prompt: 'Could you try again with more specific instructions?' });
        break;
      default:
        chips.push({ id: 'err-retry-generic', label: 'Try again', prompt: '' });
        break;
    }
    return chips.map((c) => ({ ...c, category: 'fix' as const, score: 0 }));
  }, [errorCode, isRetrying, intentMode]);

  const sessionSidebarElement = (
    <SessionSidebar
      sessions={sessions}
      archivedSessions={archivedSessions}
      activeSessionId={activeSessionId ?? null}
      isLoading={isLoading}
      onSwitch={handleSwitchSession}
      onNew={handleNewChat}
      onNewClean={() => handleNewChat({ cleanStart: true })}
      onDelete={deleteSession}
      onRename={renameSession}
      onArchive={archiveSession}
      onUnarchive={unarchiveSession}
      onArchiveAll={() => archiveAllSessions()}
      onArchiveOlderThan={(days) => archiveAllSessions(days)}
      hasMore={hasMore}
      isLoadingMore={isLoadingMore}
      onLoadMore={loadMore}
      onLoadAllHistory={loadAllHistory}
      isLoadingAllHistory={isLoadingAllHistory}
      pushLog={pushLog}
      onOpenTemplates={() => setTemplateLibraryOpen(true)}
      onOpenTraining={() => setTrainingPanelOpen((v) => !v)}
      projectId={projectId}
      onSelectMessage={(_messageId, sessionId) => {
        handleSwitchSession(sessionId);
      }}
      activeSessionMessages={messages.map((m) => ({
        role: m.role,
        content: m.content,
        created_at: m.timestamp?.toISOString?.(),
      }))}
    />
  );

  return (
    <div className={`flex flex-col flex-1 min-h-0 ${className}`}>
      {/* Portal session sidebar to far-right slot if available, otherwise render inline */}
      {sessionSidebarPortalRef?.current
        ? createPortal(sessionSidebarElement, sessionSidebarPortalRef.current)
        : sessionSidebarElement}

      {/* Chat area */}
      <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center gap-1 mb-2 flex-shrink-0 mx-2">
        <ContextPanel context={context} className="flex-1" />
        <button
          type="button"
          onClick={() => setTrainingPanelOpen((v) => !v)}
          className={`shrink-0 p-1.5 rounded-md transition-colors ${
            trainingPanelOpen
              ? 'bg-sky-500/10 text-sky-500'
              : 'ide-text-muted hover:ide-text-2 ide-hover'
          }`}
          title="Toggle training review"
          aria-label="Toggle training review"
          aria-pressed={trainingPanelOpen}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          </svg>
        </button>
      </div>
      <TrainingReviewPanel
        open={trainingPanelOpen}
        onClose={() => setTrainingPanelOpen(false)}
        projectId={projectId}
        activeSessionId={activeSessionId}
        onReplayPrompt={(prompt) => onSend(prompt)}
      />
      <PromptTemplateLibrary
        open={templateLibraryOpen}
        onClose={() => setTemplateLibraryOpen(false)}
        onSelectTemplate={(prompt) => {
          setTemplateLibraryOpen(false);
          onSend(prompt);
        }}
      />
      {historyLoadError && (
        <div
          className="mb-2 mx-2 rounded border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-300 flex-shrink-0"
          role="status"
        >
          {historyLoadError}
        </div>
      )}
      {error && (
        <div
          className={`mb-2 mx-2 rounded border px-2 py-1.5 text-xs flex-shrink-0 flex items-center justify-between gap-2 ${
            isRetrying
              ? 'border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300'
              : 'border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300'
          }`}
          role="alert"
        >
          <span className="flex items-center gap-1.5">
            {isRetrying && (
              <LambdaDots size={12} className="shrink-0" />
            )}
            {error}
          </span>
          {!isRetrying && (
            <div className="flex items-center gap-1.5 shrink-0">
              {errorCode === 'CONTEXT_TOO_LONG' && (
                <button
                  onClick={() => { setError(null); setErrorCode(null); handleNewChat(); }}
                  className="shrink-0 rounded bg-amber-100 dark:bg-amber-500/20 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-200 hover:bg-amber-500/30 transition-colors"
                >
                  New chat
                </button>
              )}
              {errorCode === 'QUOTA_EXCEEDED' && (
                <a
                  href="/account/billing"
                  className="shrink-0 rounded bg-amber-100 dark:bg-amber-500/20 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-200 hover:bg-amber-500/30 transition-colors"
                >
                  Upgrade
                </a>
              )}
              {errorCode === 'AUTH_ERROR' && (
                <a
                  href="/account/settings"
                  className="shrink-0 rounded bg-amber-100 dark:bg-amber-500/20 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-200 hover:bg-amber-500/30 transition-colors"
                >
                  Settings
                </a>
              )}
              {errorCode !== 'AUTH_ERROR' && errorCode !== 'QUOTA_EXCEEDED' && (
                <button
                  onClick={() => {
                    setError(null);
                    setErrorCode(null);
                    autoRetryCountRef.current = 0;
                    if (lastPromptRef.current) {
                      onSend(lastPromptRef.current);
                    }
                  }}
                  className="shrink-0 rounded bg-red-100 dark:bg-red-500/20 px-2 py-0.5 text-xs text-red-600 dark:text-red-200 hover:bg-red-500/30 transition-colors"
                >
                  Retry
                </button>
              )}
            </div>
          )}
        </div>
      )}
      <ChatInterface
          messages={messages}
          isLoading={isLoading}
          isLoadingHistory={isLoadingHistory}
          activeSpecialists={activeSpecialists}
          onSend={onSend}
          placeholder={intentPlaceholder}
          className="flex-1 min-h-0"
          selectedElement={selectedElement}
          onDismissElement={onDismissElement}
          contextSuggestions={contextSuggestions}
          responseSuggestions={errorSuggestions.length > 0 ? errorSuggestions : responseSuggestionsWithRetry}
          fileCount={fileCount}
          reviewFileCount={fileCount}
          onStop={handleStop}
          onReview={handleReview}
          onReviewTranscript={handleReviewTranscript}
          isReviewingTranscript={isReviewingTranscript}
          onOpenMemory={onOpenMemory}
          isMemoryOpen={isMemoryOpen}
          onImageUpload={handleImageUpload}
          projectId={projectId}
          currentModel={model}
          onModelChange={setModel}
          specialistMode={specialistMode}
          onSpecialistModeChange={setSpecialistMode}
          maxAgents={maxAgents}
          onMaxAgentsChange={setMaxAgents}
          maxQuality={maxQuality}
          onMaxQualityChange={setMaxQuality}
          isStopped={isStopped}
          onApplyCode={onApplyCode}
          onSaveCode={onSaveCode}
          editorSelection={context.selection}
          currentAction={currentAction}
          currentPhase={currentPhase}
          onUndoCheckpoint={onUndoCheckpoint}
          onClearChat={handleClearChat}
          showRetryChip={showRetryChip}
          outputMode={outputMode}
          sessions={sessions}
          activeSessionId={activeSessionId}
          onNewChat={handleNewChat}
          onSwitchSession={handleSwitchSession}
          onDeleteSession={deleteSession}
          onRenameSession={renameSession}
          intentMode={intentMode}
          onIntentModeChange={setIntentMode}
          onModeSwitchAndSend={(mode: IntentMode, autoMsg: string) => {
            setIntentMode(mode);
            pendingModeSwitchSend.current = autoMsg;
          }}
          onEditMessage={handleEditAndResend}
          onTruncateMessages={truncateAt}
          onRegenerateMessage={handleRegenerate}
          onOpenFile={onOpenFile}
          onReportBug={() => setBugReportOpen(true)}
          errorCode={errorCode}
          resolveFileId={resolveFileIdProp}
          trimmedMessageCount={lastTrimmedCount}
          historySummary={lastHistorySummary}
          summarizedCount={lastTrimmedCount}
          totalFiles={fileCount}
          onOpenPlanFile={onOpenPlanFile}
          onBuildPlan={onBuildPlan}
          onNavigatePreview={onNavigatePreview}
          onConfirmFileCreate={onConfirmFileCreate}
          onEditStatusChange={handleEditStatusChange}
          onAttachedFilesChange={handleAttachedFilesChange}
          pendingAttachedFile={pendingAttachedFile}
          verbose={verbose}
          onToggleVerbose={() => setVerbose(!verbose)}
          onForkAtMessage={(messageIndex) => forkSession(messageIndex)}
          onPinAsPreference={(rule) => pinnedPrefs.addPin(rule)}
          onDraftChange={handleDraftWarmup}
          onOpenTemplates={() => setTemplateLibraryOpen(true)}
          onOpenTraining={() => setTrainingPanelOpen((v) => !v)}
          contextPressure={contextPressure}
          onContinueInNewChat={continueInNewChat}
          intelligenceStatus={intelligenceStatus}
        />
      </div>
      {bugReportOpen && (
        <BugReportModal
          projectId={projectId}
          onClose={() => setBugReportOpen(false)}
        />
      )}
    </div>
  );
}
