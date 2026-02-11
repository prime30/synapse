'use client';

import { useState, useCallback, useRef, useMemo } from 'react';
import { ChatInterface } from '@/components/ai-sidebar/ChatInterface';
import { ContextPanel } from '@/components/ai-sidebar/ContextPanel';
import type { AISidebarContextValue } from '@/hooks/useAISidebar';
import { useAgentChat } from '@/hooks/useAgentChat';
import { useAgentSettings } from '@/hooks/useAgentSettings';
import type { SelectedElement } from '@/components/preview/PreviewPanel';
import {
  getContextualSuggestions,
  getResponseSuggestions,
  getArcSuggestion,
  type SuggestionContext,
} from '@/lib/ai/prompt-suggestions';
import {
  recordAction,
  detectActionType,
  getRecentActionTypes,
  getRecentlyShownIds,
  markSuggestionsShown,
} from '@/lib/ai/action-history';

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
}: AgentPromptPanelProps) {
  const {
    messages,
    isLoadingHistory,
    appendMessage,
    addLocalMessage,
    updateMessage,
    finalizeMessage,
  } = useAgentChat(projectId);

  const { mode, model, setMode, setModel } = useAgentSettings();

  const [isLoading, setIsLoading] = useState(false);
  const [isStopped, setIsStopped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [lastResponseContent, setLastResponseContent] = useState<string | null>(null);

  // ── Suggestion generation ───────────────────────────────────────────────

  const suggestionCtx: SuggestionContext = useMemo(() => ({
    filePath: context.filePath,
    fileLanguage: context.fileLanguage,
    selection: context.selection,
    hasShopifyConnection,
    fileCount,
    lastAction: getRecentActionTypes(projectId, 1)[0] ?? null,
  }), [context.filePath, context.fileLanguage, context.selection, hasShopifyConnection, fileCount, projectId]);

  const recentlyShown = useMemo(() => getRecentlyShownIds(projectId), [projectId]);

  // Pre-prompt contextual suggestions
  const contextSuggestions = useMemo(() => {
    const suggestions = getContextualSuggestions(suggestionCtx, recentlyShown);
    // Inject arc suggestion at the top if applicable
    const arc = getArcSuggestion(getRecentActionTypes(projectId));
    if (arc) suggestions.unshift(arc);
    return suggestions.slice(0, 4);
  }, [suggestionCtx, recentlyShown, projectId]);

  // Post-response suggestions
  const responseSuggestions = useMemo(() => {
    if (!lastResponseContent) return [];
    const suggestions = getResponseSuggestions(lastResponseContent, suggestionCtx, recentlyShown);
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
    if (allIds.length > 0) markSuggestionsShown(projectId, allIds);
  }, [contextSuggestions, responseSuggestions, projectId]);

  // ── Send handler ────────────────────────────────────────────────────────

  const onSend = useCallback(
    async (content: string) => {
      setError(null);
      setLastResponseContent(null);
      setIsStopped(false);

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // EPIC 1c: Selection injection — auto-include selected editor text as context
      let enrichedContent = content;
      if (context.selection) {
        enrichedContent = `[Selected code in editor]:\n\`\`\`\n${context.selection}\n\`\`\`\n\n${content}`;
      }

      const history = messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

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
            request: enrichedContent,
            history,
            domContext: domContext || undefined,
            mode,    // EPIC 1c: agent mode (orchestrated/solo)
            model,   // EPIC 1c: user model preference
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

        while (!done) {
          const result = await reader.read();
          done = result.done;
          if (result.value) {
            const chunk = decoder.decode(result.value, { stream: true });
            streamedContent += chunk;
            updateMessage(assistantMsgId, streamedContent);
          }
        }

        if (streamedContent) {
          finalizeMessage(assistantMsgId);
          setLastResponseContent(streamedContent);

          // Record the action type for arc detection
          const actionType = detectActionType(streamedContent);
          recordAction(projectId, {
            type: actionType,
            timestamp: Date.now(),
            context: { filePath: context.filePath ?? undefined, fileLanguage: context.fileLanguage ?? undefined },
          });
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
    [projectId, messages, appendMessage, addLocalMessage, updateMessage, finalizeMessage, context.filePath, context.fileLanguage, context.selection, getPreviewSnapshot, mode, model]
  );

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setIsStopped(true);
    setIsLoading(false);
  }, []);

  const handleReview = useCallback(() => {
    onSend('Review all the changes we have discussed so far. Check for issues, improvements, and verify correctness.');
  }, [onSend]);

  return (
    <div className={`flex flex-col flex-1 min-h-0 ${className}`}>
      <ContextPanel context={context} className="mb-2 flex-shrink-0" />
      {error && (
        <div
          className="mb-2 rounded border border-red-800/60 bg-red-900/20 px-2 py-1.5 text-xs text-red-300 flex-shrink-0"
          role="alert"
        >
          {error}
        </div>
      )}
      {isLoadingHistory ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-gray-500">Loading conversation...</p>
        </div>
      ) : (
        <ChatInterface
          messages={messages}
          isLoading={isLoading}
          onSend={onSend}
          placeholder="Describe the change you want (e.g. add a product gallery section)"
          className="flex-1 min-h-0"
          selectedElement={selectedElement}
          onDismissElement={onDismissElement}
          contextSuggestions={contextSuggestions}
          responseSuggestions={responseSuggestions}
          fileCount={fileCount}
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
        />
      )}
    </div>
  );
}
