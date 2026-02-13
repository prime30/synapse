'use client';

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { ChatInterface } from '@/components/ai-sidebar/ChatInterface';
import { ContextPanel } from '@/components/ai-sidebar/ContextPanel';
import type { AISidebarContextValue } from '@/hooks/useAISidebar';
import { useAgentChat } from '@/hooks/useAgentChat';
import { useAgentSettings } from '@/hooks/useAgentSettings';
import type { SelectedElement } from '@/components/preview/PreviewPanel';
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
import { ConversationArc } from '@/lib/ai/conversation-arc';
import type { AIErrorCode } from '@/lib/ai/errors';

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

interface SSEThinkingEvent {
  type: 'thinking';
  phase: 'analyzing' | 'planning' | 'executing' | 'reviewing' | 'complete';
  label: string;
  detail?: string;
  agent?: string;
  analysis?: string;
  summary?: string;
}

type SSEEvent = SSEErrorEvent | SSEDoneEvent | SSEThinkingEvent;

/** User-friendly error messages mapped from error codes (client-side). */
const ERROR_CODE_MESSAGES: Record<string, string> = {
  RATE_LIMITED: 'The AI is temporarily busy. Retrying in a moment...',
  CONTEXT_TOO_LONG: 'Your files are too large for this model. Try selecting fewer files or switching to a model with a larger context window.',
  CONTENT_FILTERED: 'Your request was filtered by the AI safety system. Try rephrasing your message.',
  AUTH_ERROR: 'AI is not configured. Please ask your admin to add API keys in Settings.',
  MODEL_UNAVAILABLE: 'The selected AI model is currently unavailable. Try switching to a different model.',
  NETWORK_ERROR: 'Connection lost. Check your internet and try again.',
  TIMEOUT: 'The AI took too long to respond. Try a simpler request or switch to Solo mode.',
  EMPTY_RESPONSE: 'The AI returned an empty response. Retrying...',
  PARSE_ERROR: 'Received an unexpected response from the AI. Please try again.',
  PROVIDER_ERROR: 'The AI service is experiencing issues. Please try again in a moment.',
  QUOTA_EXCEEDED: 'Your AI usage quota has been reached. Please upgrade your plan or wait for the quota to reset.',
};

/** Parse an SSE event from a chunk of stream text. Returns null if not an SSE event. */
function parseSSEEvent(chunk: string): SSEEvent | null {
  // SSE events are formatted as: data: {json}\n\n
  const match = chunk.match(/data:\s*(\{.*\})/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    if (parsed.type === 'error' || parsed.type === 'done' || parsed.type === 'thinking') {
      return parsed as SSEEvent;
    }
  } catch {
    // Not a valid SSE event — just normal content
  }
  return null;
}

/** Auto-retryable codes (frontend will automatically retry once). */
const AUTO_RETRY_CODES = new Set<string>(['EMPTY_RESPONSE', 'RATE_LIMITED']);

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
  /** EPIC 5: Ref to expose send function for QuickActions/Fix with AI. Parent can call sendMessageRef.current?.(prompt) */
  sendMessageRef?: React.MutableRefObject<((content: string) => void) | null>;
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
  sendMessageRef,
}: AgentPromptPanelProps) {
  const {
    messages,
    isLoadingHistory,
    appendMessage,
    addLocalMessage,
    updateMessage,
    finalizeMessage,
    sessions,
    activeSessionId,
    createNewSession,
    switchSession,
    deleteSession,
    renameSession,
    clearMessages,
    removeLastTurn,
    truncateAt,
  } = useAgentChat(projectId);

  const { mode, model, intentMode, setMode, setModel, setIntentMode } = useAgentSettings();

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
  const lastPromptRef = useRef<string>('');
  const autoRetryCountRef = useRef(0);
  const thinkingStepsRef = useRef<import('@/components/ai-sidebar/ThinkingBlock').ThinkingStep[]>([]);
  const lastDecisionScanRef = useRef(0);

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

      // EPIC 5: Track user turn in conversation arc
      arcRef.current.addTurn('user');

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // EPIC 2: Detect [RETRY_WITH_FULL_CONTEXT] prefix
      let actualContent = content;
      let includeFullFile = false;
      if (content.startsWith(RETRY_PREFIX)) {
        actualContent = content.slice(RETRY_PREFIX.length).trim() || 'Please try again with more detail.';
        includeFullFile = true;
      }

      // Passive IDE context injection (gated by getPassiveContext)
      let enrichedContent = actualContent;
      const passiveCtx = getPassiveContext?.() ?? '';
      if (passiveCtx) {
        enrichedContent = `${passiveCtx}\n\n${enrichedContent}`;
      }

      // EPIC 1c: Selection injection — auto-include selected editor text as context
      if (context.selection) {
        enrichedContent = `[Selected code in editor]:\n\`\`\`\n${context.selection}\n\`\`\`\n\n${actualContent}`;
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

      appendMessage('user', enrichedContent);
      setIsLoading(true);

      const assistantMsgId = crypto.randomUUID();
      let streamedContent = '';

      try {
        // EPIC 1a: Get DOM context from preview panel before sending (3s timeout)
        let domContext: string | undefined;
        if (getPreviewSnapshot) {
          try {
            domContext = await getPreviewSnapshot();
          } catch {
            // Preview not available — proceed without DOM context
          }
        }

        const res = await fetch('/api/agents/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            request: requestWithContext,
            history,
            domContext: domContext || undefined,
            mode,          // EPIC 1c: agent mode (orchestrated/solo)
            model,         // EPIC 1c: user model preference
            intentMode,    // Intent mode: ask/plan/code/debug
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

        while (!done) {
          const result = await reader.read();
          done = result.done;
          if (result.value) {
            const chunk = decoder.decode(result.value, { stream: true });

            // Check for SSE events (error, done, thinking) in the chunk
            const sseEvent = parseSSEEvent(chunk);
            if (sseEvent) {
              if (sseEvent.type === 'done') {
                receivedDone = true;
                continue;
              }
              if (sseEvent.type === 'error') {
                receivedError = sseEvent;
                continue;
              }
              if (sseEvent.type === 'thinking') {
                // Mark previous steps as done
                const steps = thinkingStepsRef.current.map(s => ({ ...s, done: true }));
                // Add new step (only mark 'complete' phase as done)
                const newStep = {
                  phase: sseEvent.phase,
                  label: sseEvent.label,
                  detail: sseEvent.detail,
                  agent: sseEvent.agent,
                  analysis: sseEvent.analysis,
                  summary: sseEvent.summary,
                  done: sseEvent.phase === 'complete',
                };
                steps.push(newStep);
                thinkingStepsRef.current = steps;
                if (sseEvent.phase === 'complete') thinkingComplete = true;

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
                if (innerEvent.type === 'error') receivedError = innerEvent;
                if (innerEvent.type === 'done') receivedDone = true;
                if (innerEvent.type === 'thinking') {
                  const steps = thinkingStepsRef.current.map(s => ({ ...s, done: true }));
                  steps.push({
                    phase: innerEvent.phase,
                    label: innerEvent.label,
                    detail: innerEvent.detail,
                    agent: innerEvent.agent,
                    analysis: innerEvent.analysis,
                    summary: innerEvent.summary,
                    done: innerEvent.phase === 'complete',
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

            // First text content arriving means thinking is done
            if (!thinkingComplete && thinkingStepsRef.current.length > 0) {
              thinkingComplete = true;
              const steps = thinkingStepsRef.current.map(s => ({ ...s, done: true }));
              thinkingStepsRef.current = steps;
            }

            streamedContent += chunk;
            updateMessage(assistantMsgId, streamedContent, {
              thinkingSteps: thinkingStepsRef.current.length > 0 ? [...thinkingStepsRef.current] : undefined,
              thinkingComplete: thinkingComplete || undefined,
            });
          }
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
        }
      } catch (err) {
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
      }
    },
    [projectId, messages, appendMessage, addLocalMessage, updateMessage, finalizeMessage, context.filePath, context.fileLanguage, context.selection, getPreviewSnapshot, getActiveFileContent, onTokenUsage, mode, model, intentMode, getPassiveContext, contextSuggestions, responseSuggestionsWithRetry]
  );

  // EPIC 5: Expose onSend for QuickActions/Fix with AI
  useEffect(() => {
    if (sendMessageRef) sendMessageRef.current = onSend;
    return () => {
      if (sendMessageRef) sendMessageRef.current = null;
    };
  }, [onSend, sendMessageRef]);

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
    <div className={`flex flex-col flex-1 min-h-0 ${className}`}>
      <ContextPanel context={context} className="mb-2 flex-shrink-0" />
      {error && (
        <div
          className={`mb-2 rounded border px-2 py-1.5 text-xs flex-shrink-0 flex items-center justify-between gap-2 ${
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
        />
      )}
    </div>
  );
}
