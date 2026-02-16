'use client';

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { ChatInterface } from '@/components/ai-sidebar/ChatInterface';
import type { ThinkingStep } from '@/components/ai-sidebar/ThinkingBlock';
import { ContextPanel } from '@/components/ai-sidebar/ContextPanel';
import { SessionSidebar } from '@/components/ai-sidebar/SessionSidebar';
import type { AISidebarContextValue } from '@/hooks/useAISidebar';
import { useAgentChat } from '@/hooks/useAgentChat';
import { useAgentSettings } from '@/hooks/useAgentSettings';
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

interface SSEContextStatsEvent {
  type: 'context_stats';
  loadedFiles: number;
  loadedTokens: number;
  totalFiles: number;
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
}

interface SSEToolCallEvent {
  type: 'tool_call';
  name: string;
  input: Record<string, unknown>;
}

interface SSECacheStatsEvent {
  type: 'cache_stats';
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  cacheHit: boolean;
}

interface SSECitationEvent {
  type: 'citation';
  citedText: string;
  documentTitle: string;
  startIndex?: number;
  endIndex?: number;
}

interface SSEDiagnosticsEvent {
  type: 'diagnostics';
  file: string;
  errorCount: number;
  warningCount: number;
}

interface SSEWorkerProgressEvent {
  type: 'worker_progress';
  workerId: string;
  label: string;
  status: 'running' | 'complete';
  metadata?: Record<string, unknown>;
}

type SSEEvent = SSEErrorEvent | SSEDoneEvent | SSEThinkingEvent | SSEContextStatsEvent | SSEToolStartEvent | SSEToolCallEvent | SSECacheStatsEvent | SSECitationEvent | SSEDiagnosticsEvent | SSEWorkerProgressEvent;

/** User-friendly error messages mapped from error codes (client-side). */
const ERROR_CODE_MESSAGES: Record<string, string> = {
  RATE_LIMITED: 'The AI is temporarily busy. Retrying in a moment...',
  CONTEXT_TOO_LONG: 'Your files are too large for this model. Try selecting fewer files or switching to a model with a larger context window.',
  CONTENT_FILTERED: 'Your request was filtered by the AI safety system. Try rephrasing your message.',
  AUTH_ERROR: 'AI is not configured. Please ask your admin to add API keys in Settings.',
  MODEL_UNAVAILABLE: 'The selected AI model is currently unavailable. Try switching to a different model.',
  NETWORK_ERROR: 'Connection lost. Check your internet and try again.',
  TIMEOUT: 'The AI took too long to respond. Try a simpler request or switch to Solo mode.',
  EMPTY_RESPONSE: 'The AI returned an empty response. Try again or rephrase your message.',
  PARSE_ERROR: 'Received an unexpected response from the AI. Please try again.',
  PROVIDER_ERROR: 'The AI service is experiencing issues. Please try again in a moment.',
  QUOTA_EXCEEDED: 'Your AI usage quota has been reached. Please upgrade your plan or wait for the quota to reset.',
  CONTEXT_TOO_LARGE: 'Request was too large. Retrying with reduced context...',
  SOLO_EXECUTION_FAILED: 'The AI agent encountered an error. Please try again or switch to Team mode.',
  UNKNOWN: 'Something went wrong. Please try again.',
};

/** Parse an SSE event from a chunk of stream text. Returns null if not an SSE event. */
function parseSSEEvent(chunk: string): SSEEvent | null {
  // SSE events are formatted as: data: {json}\n\n
  const match = chunk.match(/data:\s*(\{.*\})/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    if (
      parsed.type === 'error' || parsed.type === 'done' ||
      parsed.type === 'thinking' || parsed.type === 'context_stats' ||
      parsed.type === 'tool_start' || parsed.type === 'tool_call' ||
      parsed.type === 'cache_stats' || parsed.type === 'citation' ||
      parsed.type === 'diagnostics' || parsed.type === 'worker_progress'
    ) {
      return parsed as SSEEvent;
    }
  } catch {
    // Not a valid SSE event — just normal content
  }
  return null;
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
  if (/\b(review|audit|check|inspect|scan)\b/.test(lower)) return 'review';
  if (/\b(fix|debug|repair|resolve|patch)\b/.test(lower)) return 'fix';
  if (/\b(refactor|clean|simplif|reorganiz)\b/.test(lower)) return 'refactor';
  if (/\b(explain|what|how|why|describe)\b/.test(lower)) return 'explain';
  if (/\b(plan|outline|design|architect)\b/.test(lower)) return 'plan';
  if (/\b(document|docs|comment|jsdoc)\b/.test(lower)) return 'document';
  if (/\b(summar)\b/.test(lower)) return 'summary';
  if (/\b(generate|create|build|add|make|write|implement)\b/.test(lower)) return 'generate';
  if (/\b(analyz)\b/.test(lower)) return 'analyze';
  return 'generate'; // default to generate for most prompts
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
  if (sectionId) parts.push(`Section: ${sectionId}`);
  if (sectionType) parts.push(`Section type: ${sectionType}`);
  if (blockId) parts.push(`Block: ${blockId}`);

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
  pendingAnnotation,
  onClearAnnotation,
  onLiveChange,
  onLiveSessionStart,
  onLiveSessionEnd,
  onOpenFiles,
  onScrollToEdit,
  onAgentActivity,
}: AgentPromptPanelProps) {
  const {
    messages,
    isLoadingHistory,
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
    unarchiveSession,
    loadMore,
    hasMore,
    isLoadingMore,
    recordApplyStats,
    clearMessages,
    removeLastTurn,
    truncateAt,
    forkSession,
  } = useAgentChat(projectId);

  const { mode, model, intentMode, verbose, setMode, setModel, setIntentMode, setVerbose } = useAgentSettings();
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
  const [currentAction, setCurrentAction] = useState<string | undefined>();
  const [lastTrimmedCount, setLastTrimmedCount] = useState(0);
  const [lastHistorySummary, setLastHistorySummary] = useState<string | undefined>();
  const [templateLibraryOpen, setTemplateLibraryOpen] = useState(false);
  const lastPromptRef = useRef<string>('');
  const autoRetryCountRef = useRef(0);

  // Phase 3b: Attached files from chat drag-and-drop
  const attachedFilesRef = useRef<Array<{ id: string; name: string; path: string }>>([]);
  const handleAttachedFilesChange = useCallback((files: Array<{ id: string; name: string; path: string }>) => {
    attachedFilesRef.current = files;
  }, []);
  const thinkingStepsRef = useRef<import('@/components/ai-sidebar/ThinkingBlock').ThinkingStep[]>([]);
  const lastDecisionScanRef = useRef(0);
  const workersRef = useRef<Array<{ workerId: string; label: string; status: string }>>([]);

  // Stall detection refs
  const lastSSEEventTimeRef = useRef<number>(Date.now());
  const stallTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stallWarningEmittedRef = useRef(false);
  const stallAlertEmittedRef = useRef(false);

  // Content debounce refs
  const contentBufferRef = useRef<string>('');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // ── Send handler ────────────────────────────────────────────────────────

  const onSend = useCallback(
    async (content: string) => {
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
      setCurrentAction(detectPromptAction(content));
      lastPromptRef.current = content;
      thinkingStepsRef.current = [];
      workersRef.current = [];
      // Reset stall detection
      lastSSEEventTimeRef.current = Date.now();
      stallWarningEmittedRef.current = false;
      stallAlertEmittedRef.current = false;
      contentBufferRef.current = '';

      // EPIC 5: Track user turn in conversation arc
      arcRef.current.addTurn('user');

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // Phase 4a: Start live preview session
      onLiveSessionStart?.();

      // 4-minute client-side timeout — abort if the stream produces nothing
      const clientTimeout = setTimeout(() => {
        controller.abort();
      }, 240_000);

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

      // EPIC 1c: Selection injection — auto-include selected editor text (with line range for chat pill)
      if (context.selection) {
        const start = context.selectionStartLine;
        const end = context.selectionEndLine;
        const lineTag =
          typeof start === 'number' && typeof end === 'number'
            ? ` — lines ${start}-${end}`
            : '';
        enrichedContent = `[Selected code in editor${lineTag}]:\n\`\`\`\n${context.selection}\n\`\`\`\n\n${enrichedContent}`;
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
      const { messages: trimmedHistory, summary: historySummary, trimmedCount } = trimHistory(rawHistory);
      const history = trimmedHistory;

      // Store trim info for ChatInterface UI (D2 summary block + D3 context meter)
      setLastTrimmedCount(trimmedCount);
      setLastHistorySummary(historySummary || undefined);

      const requestWithContext = historySummary
        ? `[Context from earlier conversation]:\n${historySummary}\n\n${enrichedContent}`
        : enrichedContent;

      // Display user message with selected-code as a line-number pill (collapsed by default), not raw code
      const displayContent =
        context.selection && context.selection.trim().length > 0
          ? (() => {
              const start = context.selectionStartLine;
              const end = context.selectionEndLine;
              const lineTag =
                typeof start === 'number' && typeof end === 'number'
                  ? ` — lines ${start}-${end}`
                  : '';
              return `[Selected code in editor${lineTag}]:\n\`\`\`\n${context.selection}\n\`\`\`\n\n${actualContent}`;
            })()
          : actualContent;
      appendMessage('user', displayContent);
      setIsLoading(true);

      const assistantMsgId = crypto.randomUUID();
      let streamedContent = '';

      try {
        // EPIC V3: Capture "before" DOM snapshot for preview verification
        if (captureBeforeSnapshot) {
          try { await captureBeforeSnapshot(); } catch { /* best-effort */ }
        }

        // EPIC 1a: Get DOM context from preview panel before sending (3s timeout)
        let domContext: string | undefined;
        if (getPreviewSnapshot) {
          try {
            domContext = await getPreviewSnapshot();
          } catch {
            // Preview not available — proceed without DOM context
          }
        }

        // Extract element hint for smart file auto-selection on the server
        const elementHint = extractElementHint(selectedElement);

        const res = await fetch('/api/agents/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            request: requestWithContext,
            history,
            activeFilePath: context.filePath ?? undefined,
            openTabs: openTabIds ?? undefined,
            domContext: domContext || undefined,
            elementHint: elementHint || undefined,
            mode,          // EPIC 1c: agent mode (orchestrated/solo)
            model,         // EPIC 1c: user model preference
            intentMode,    // Intent mode: ask/plan/code/debug
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

        // Local accumulators for tool card data (avoids reading message state mid-stream)
        let accumulatedCodeEdits: Array<{ filePath: string; reasoning?: string; newContent: string; originalContent?: string; status: 'pending' | 'applied' | 'rejected' }> = [];
        let accumulatedFileCreates: Array<{ fileName: string; content: string; reasoning?: string; status: 'pending' | 'confirmed' | 'cancelled' }> = [];
        let accumulatedCitations: Array<{ citedText: string; documentTitle: string; startIndex?: number; endIndex?: number }> = [];
        // Agent Power Tools accumulators (Phase 7)
        let accumulatedFileOps: Array<{ type: 'write' | 'delete' | 'rename'; fileName: string; success: boolean; error?: string; newFileName?: string }> = [];
        let accumulatedShopifyOps: Array<{ type: 'push' | 'pull' | 'list_themes' | 'list_resources' | 'get_asset'; status: 'pending' | 'success' | 'error'; summary: string; detail?: string; error?: string }> = [];

        // Start stall detection timer (checks every 10s)
        stallTimerRef.current = setInterval(() => {
          const elapsed = (Date.now() - lastSSEEventTimeRef.current) / 1000;
          if (elapsed >= 120 && !stallAlertEmittedRef.current) {
            stallAlertEmittedRef.current = true;
            const steps = thinkingStepsRef.current.map(s => ({ ...s, done: true }));
            steps.push({
              phase: 'budget_warning' as const,
              label: 'This is taking unusually long. You can Stop and retry.',
              done: false,
              startedAt: Date.now(),
            });
            thinkingStepsRef.current = steps;
            updateMessage(assistantMsgId, streamedContent, {
              thinkingSteps: [...steps],
              thinkingComplete: false,
            });
          } else if (elapsed >= 60 && !stallWarningEmittedRef.current) {
            stallWarningEmittedRef.current = true;
            const steps = thinkingStepsRef.current.map(s => ({ ...s, done: true }));
            steps.push({
              phase: 'analyzing' as const,
              label: 'Taking longer than expected...',
              done: false,
              startedAt: Date.now(),
            });
            thinkingStepsRef.current = steps;
            updateMessage(assistantMsgId, streamedContent, {
              thinkingSteps: [...steps],
              thinkingComplete: false,
            });
          }
        }, 10_000);

        while (!done) {
          const result = await reader.read();
          done = result.done;
          if (result.value) {
            const chunk = decoder.decode(result.value, { stream: true });

            // Check for SSE events (error, done, thinking) in the chunk
            const sseEvent = parseSSEEvent(chunk);
            if (sseEvent) {
              // Reset stall detection on any SSE event
              lastSSEEventTimeRef.current = Date.now();
              stallWarningEmittedRef.current = false;
              stallAlertEmittedRef.current = false;

              if (sseEvent.type === 'done') {
                receivedDone = true;
                // Mark thinking complete and enable input immediately so UX updates without waiting for stream close
                thinkingComplete = true;
                const steps = thinkingStepsRef.current.map(s => ({ ...s, done: true }));
                thinkingStepsRef.current = steps;
                updateMessage(assistantMsgId, streamedContent, {
                  thinkingSteps: steps.length > 0 ? [...steps] : undefined,
                  thinkingComplete: true,
                });
                setIsLoading(false);
                continue;
              }
              if (sseEvent.type === 'error') {
                receivedError = sseEvent;
                continue;
              }
              // Handle context_stats SSE event for accurate ContextMeter
              if (sseEvent.type === 'context_stats') {
                updateMessage(assistantMsgId, streamedContent, {
                  contextStats: {
                    loadedFiles: sseEvent.loadedFiles,
                    loadedTokens: sseEvent.loadedTokens,
                    totalFiles: sseEvent.totalFiles,
                  },
                });
                continue;
              }
              // Handle tool_start: show loading skeleton
              if (sseEvent.type === 'tool_start') {
                updateMessage(assistantMsgId, streamedContent, {
                  activeToolCall: { name: sseEvent.name, id: sseEvent.id },
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
                  updateMessage(assistantMsgId, streamedContent, {
                    ...clearActive,
                    planData: {
                      title: (input.title as string) ?? 'Plan',
                      description: (input.description as string) ?? '',
                      steps: (input.steps as Array<{ number: number; text: string; complexity?: 'simple' | 'moderate' | 'complex'; files?: string[] }>) ?? [],
                    },
                  });
                } else if (toolName === 'propose_code_edit') {
                  const editFilePath = (input.filePath as string) ?? '';
                  const editNewContent = (input.newContent as string) ?? '';
                  const originalFileContent = resolveFileContent?.(editFilePath) ?? undefined;
                  accumulatedCodeEdits = [
                    ...accumulatedCodeEdits,
                    {
                      filePath: editFilePath,
                      reasoning: input.reasoning as string | undefined,
                      newContent: editNewContent,
                      originalContent: originalFileContent,
                      status: 'pending' as const,
                    },
                  ];
                  // Phase 4a: Push live change to preview
                  onLiveChange?.({ filePath: editFilePath, newContent: editNewContent });

                  // Agent Live Breakout: auto-scroll to first changed line
                  if (onScrollToEdit && originalFileContent && editFilePath) {
                    const range = getFirstChangedLineRange(originalFileContent, editNewContent);
                    if (range) {
                      onScrollToEdit(editFilePath, range.startLine);
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
                  accumulatedFileCreates = [
                    ...accumulatedFileCreates,
                    {
                      fileName: (input.fileName as string) ?? '',
                      content: (input.content as string) ?? '',
                      reasoning: input.reasoning as string | undefined,
                      status: 'pending' as const,
                    },
                  ];
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
                continue;
              }
              // Handle cache_stats event
              if (sseEvent.type === 'cache_stats') {
                // Cache stats are informational; no UI update needed yet
                continue;
              }
              // Handle citation events
              if (sseEvent.type === 'citation') {
                accumulatedCitations = [
                  ...accumulatedCitations,
                  {
                    citedText: sseEvent.citedText,
                    documentTitle: sseEvent.documentTitle,
                    startIndex: sseEvent.startIndex,
                    endIndex: sseEvent.endIndex,
                  },
                ];
                updateMessage(assistantMsgId, streamedContent, {
                  citations: [...accumulatedCitations],
                });
                continue;
              }
              // Handle diagnostics events — attach to most recent thinking step
              if (sseEvent.type === 'diagnostics') {
                const steps = thinkingStepsRef.current;
                if (steps.length > 0) {
                  const diagEvent = sseEvent as SSEDiagnosticsEvent;
                  steps[steps.length - 1].diagnostics = {
                    file: diagEvent.file,
                    errorCount: diagEvent.errorCount,
                    warningCount: diagEvent.warningCount,
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
                const workers = (workersRef.current ?? []) as Array<{ workerId: string; label: string; status: string }>;
                const existingIdx = workers.findIndex(w => w.workerId === workerEvent.workerId);
                if (existingIdx >= 0) {
                  workers[existingIdx] = { workerId: workerEvent.workerId, label: workerEvent.label, status: workerEvent.status };
                } else {
                  workers.push({ workerId: workerEvent.workerId, label: workerEvent.label, status: workerEvent.status });
                }
                workersRef.current = workers;

                // Agent Live Breakout: auto-open files from worker_progress metadata
                const wpMeta = workerEvent.metadata;
                if (
                  workerEvent.status === 'running' &&
                  wpMeta?.affectedFiles &&
                  Array.isArray(wpMeta.affectedFiles) &&
                  (wpMeta.affectedFiles as string[]).length > 0
                ) {
                  onOpenFiles?.(wpMeta.affectedFiles as string[]);
                }

                // Phase 8: Pass workers to ThinkingBlock via message metadata
                updateMessage(assistantMsgId, streamedContent, {
                  thinkingSteps: thinkingStepsRef.current.length > 0 ? [...thinkingStepsRef.current] : undefined,
                  workers: [...workers],
                });
                continue;
              }
              if (sseEvent.type === 'thinking') {
                // Mark previous steps as done
                const steps = thinkingStepsRef.current.map(s => ({ ...s, done: true }));
                // Add new step with startedAt timestamp
                const metadata = sseEvent.metadata as Record<string, unknown> | undefined;
                const rawTier = metadata?.routingTier as string | undefined;
                const validTier = rawTier && ['TRIVIAL', 'SIMPLE', 'COMPLEX', 'ARCHITECTURAL'].includes(rawTier)
                  ? rawTier as 'TRIVIAL' | 'SIMPLE' | 'COMPLEX' | 'ARCHITECTURAL'
                  : undefined;
                const newStep = {
                  phase: sseEvent.phase,
                  label: sseEvent.label,
                  detail: sseEvent.detail,
                  agent: sseEvent.agent,
                  analysis: sseEvent.analysis,
                  summary: sseEvent.summary,
                  done: sseEvent.phase === 'complete',
                  startedAt: Date.now(),
                  // Extract routing tier metadata from smart routing events
                  routingTier: validTier,
                  model: metadata?.model as string | undefined,
                  // Phase mapping for progress rail
                  railPhase: mapCoordinatorPhase(sseEvent.phase),
                  subPhase: (sseEvent.subPhase ?? undefined) as ThinkingStep['subPhase'],
                  // Rich metadata for deep-link rendering
                  metadata: metadata as ThinkingStep['metadata'],
                };
                steps.push(newStep);
                thinkingStepsRef.current = steps;
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
                  if (metaOptions && metaOptions.length > 0) {
                    // Extract a short question from the first line or fallback
                    const firstLine = clarificationText.split('\n').find(
                      (l: string) => l.trim().length > 0 && !l.trim().match(/^\d+[.)]/),
                    ) ?? 'Which option would you like?';
                    updateMessage(assistantMsgId, streamedContent, {
                      clarification: {
                        question: firstLine.trim().slice(0, 200),
                        options: metaOptions.map((o) => ({
                          id: o.id,
                          label: o.label,
                          recommended: o.recommended,
                        })),
                      },
                    });
                  }
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

                // Update message with thinking steps
                updateMessage(assistantMsgId, streamedContent, {
                  thinkingSteps: [...steps],
                  thinkingComplete,
                });
                continue;
              }
            }

            // Normal content chunk — skip if it looks like raw SSE data
            // (providers may inject formatSSEError mid-stream)
            if (chunk.trim().startsWith('data: {')) {
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
            }

            streamedContent += chunk;

            // Debounced content update (100ms) to reduce react-markdown re-renders
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = setTimeout(() => {
              updateMessage(assistantMsgId, streamedContent, {
                thinkingSteps: thinkingStepsRef.current.length > 0 ? [...thinkingStepsRef.current] : undefined,
                thinkingComplete: thinkingComplete || undefined,
              });
            }, 100);
          }
        }

        // Clean up timers (client timeout, stall detection) and flush debounce
        clearTimeout(clientTimeout);
        if (stallTimerRef.current) { clearInterval(stallTimerRef.current); stallTimerRef.current = null; }
        // Stream ended — ensure we show Complete and final content
        thinkingComplete = true;
        const stepsToFlush = thinkingStepsRef.current.map(s => ({ ...s, done: true }));
        thinkingStepsRef.current = stepsToFlush;
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
        }
        const stepsForMessage = stepsToFlush.length > 0 ? [...stepsToFlush] : undefined;
        if (streamedContent || stepsForMessage) {
          updateMessage(assistantMsgId, streamedContent, {
            thinkingSteps: stepsForMessage,
            thinkingComplete: true,
          });
        }

        // ── Handle SSE error events ─────────────────────────────────────
        if (receivedError) {
          const code = receivedError.code;
          const userMsg = ERROR_CODE_MESSAGES[code] ?? receivedError.message ?? 'Something went wrong.';
          setErrorCode(code);
          setError(userMsg);

          if (streamedContent) {
            // Partial content was received before the error — append error note
            streamedContent += `\n\n---\n⚠️ **Error:** ${userMsg}`;
            updateMessage(assistantMsgId, streamedContent);
            finalizeMessage(assistantMsgId);
          } else {
            // No content — show in-thread error message with hints
            const hints: string[] = [];
            if (code === 'CONTEXT_TOO_LONG') hints.push('Try starting a **new chat** to free up context.');
            else if (code === 'QUOTA_EXCEEDED') hints.push('Your usage quota has been reached. **Upgrade your plan** to continue.');
            else if (code === 'AUTH_ERROR') hints.push('Check your API key configuration in **Settings**.');
            else hints.push('You can **retry** or **edit your message** and try again.');
            const inThreadMsg = `⚠️ **Error:** ${userMsg}\n\n${hints.join(' ')}`;
            updateMessage(assistantMsgId, inThreadMsg);
            finalizeMessage(assistantMsgId);
          }

          // Auto-retry for transient errors (max 1 auto-retry)
          if (AUTO_RETRY_CODES.has(code) && autoRetryCountRef.current < 1) {
            autoRetryCountRef.current += 1;
            const delay = code === 'RATE_LIMITED' ? 5000 : 1500;
            setIsRetrying(true);
            setError(code === 'RATE_LIMITED' ? 'Rate limited — retrying...' : 'Empty response — retrying...');
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

        if (err instanceof DOMException && err.name === 'AbortError') return;
        const msg = err instanceof Error ? err.message : 'Request failed';
        setError(msg);

        if (streamedContent) {
          streamedContent += '\n\n*Connection interrupted.*';
          updateMessage(assistantMsgId, streamedContent);
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
        // Phase 4a: End live preview session
        onLiveSessionEnd?.();
      }
    },
    [projectId, messages, appendMessage, addLocalMessage, updateMessage, finalizeMessage, context.filePath, context.fileLanguage, context.selection, getPreviewSnapshot, getActiveFileContent, onTokenUsage, mode, model, intentMode, getPassiveContext, contextSuggestions, responseSuggestionsWithRetry, onOpenFile, openTabIds, selectedElement, resolveFileContent, captureBeforeSnapshot, verifyPreview, pendingAnnotation, onClearAnnotation, onLiveChange, onLiveSessionStart, onLiveSessionEnd, pinnedPrefs, styleGuide, onOpenFiles, onScrollToEdit, onAgentActivity]
  );

  // EPIC 5: Expose onSend for QuickActions/Fix with AI
  useEffect(() => {
    if (sendMessageRef) sendMessageRef.current = onSend;
    return () => {
      if (sendMessageRef) sendMessageRef.current = null;
    };
  }, [onSend, sendMessageRef]);

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

  // EPIC 14: Extract decisions from completed conversations
  useEffect(() => {
    if (isLoading || messages.length < 2) return;
    if (messages.length <= lastDecisionScanRef.current) return;

    const newMsgs = messages.slice(lastDecisionScanRef.current);
    lastDecisionScanRef.current = messages.length;

    const chatMsgs: DecisionChatMessage[] = newMsgs.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
      timestamp: new Date().toISOString(),
    }));

    const decisions = extractDecisionsFromChat(chatMsgs);

    for (const d of decisions) {
      if (d.confidence >= 0.7) {
        fetch(`/api/projects/${projectId}/memory`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'decision',
            content: d.decision,
            confidence: d.confidence,
          }),
        }).catch(() => {});
      }
    }
  }, [isLoading, messages, projectId]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setIsStopped(true);
    setIsLoading(false);
  }, []);

  const handleReview = useCallback(() => {
    onSend('Review all the changes we have discussed so far. Check for issues, improvements, and verify correctness.');
  }, [onSend]);

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

  // New Chat — create a new session and reset state
  const handleNewChat = useCallback(async () => {
    setLastResponseContent(null);
    setShowRetryChip(false);
    setError(null);
    setErrorCode(null);
    setIsStopped(false);
    autoRetryCountRef.current = 0;
    arcRef.current.reset();
    setOutputMode('chat');
    await createNewSession();
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
        chips.push({ id: 'err-solo', label: 'Try Solo mode', prompt: 'Try again in Solo mode for a faster single-pass response.' });
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

  return (
    <div className={`flex flex-1 min-h-0 ${className}`}>
      {/* Session sidebar (left edge of right panel) */}
      <SessionSidebar
        sessions={sessions}
        archivedSessions={archivedSessions}
        activeSessionId={activeSessionId ?? null}
        isLoading={isLoading}
        onSwitch={handleSwitchSession}
        onNew={handleNewChat}
        onDelete={deleteSession}
        onRename={renameSession}
        onArchive={archiveSession}
        onUnarchive={unarchiveSession}
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        onLoadMore={loadMore}
        onOpenTemplates={() => setTemplateLibraryOpen(true)}
      />

      {/* Chat area */}
      <div className="flex flex-col flex-1 min-h-0 min-w-0">
      <ContextPanel context={context} className="mb-2 flex-shrink-0 mx-2" />
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
              <svg className="h-3 w-3 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
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
      {isLoadingHistory ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm ide-text-muted">Loading conversation...</p>
        </div>
      ) : (
        <ChatInterface
          messages={messages}
          isLoading={isLoading}
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
          currentModel={model}
          onModelChange={setModel}
          agentMode={mode}
          onModeChange={setMode}
          isStopped={isStopped}
          onApplyCode={onApplyCode}
          onSaveCode={onSaveCode}
          editorSelection={context.selection}
          currentAction={currentAction}
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
          onEditMessage={handleEditAndResend}
          onRegenerateMessage={handleRegenerate}
          onOpenFile={onOpenFile}
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
          verbose={verbose}
          onToggleVerbose={() => setVerbose(!verbose)}
          onForkAtMessage={(messageIndex) => forkSession(messageIndex)}
          projectId={projectId}
          onPinAsPreference={(rule) => pinnedPrefs.addPin(rule)}
          templateLibraryOpen={templateLibraryOpen}
          onTemplateLibraryClose={() => setTemplateLibraryOpen(false)}
        />
      )}
      </div>
    </div>
  );
}
