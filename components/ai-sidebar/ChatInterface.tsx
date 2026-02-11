'use client';

import React, { useRef, useEffect, useState } from 'react';
import { CodeBlock } from './CodeBlock';
import { ElementRefChip } from '@/components/ui/ElementRefChip';
import { SuggestionChips } from './SuggestionChips';
import type { SelectedElement } from '@/components/preview/PreviewPanel';
import type { Suggestion } from '@/lib/ai/prompt-suggestions';
import type { AgentMode } from '@/hooks/useAgentSettings';
import { Square, Search, Paperclip, ChevronDown } from 'lucide-react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatInterfaceProps {
  messages: ChatMessage[];
  isLoading?: boolean;
  onSend: (content: string) => void;
  placeholder?: string;
  className?: string;
  /** When set, displays an element reference chip above the input. */
  selectedElement?: SelectedElement | null;
  /** Called when the user dismisses the selected element chip. */
  onDismissElement?: () => void;
  /** Pre-prompt contextual suggestions (shown when input is empty / no messages). */
  contextSuggestions?: Suggestion[];
  /** Post-response suggestions (shown after the last assistant message). */
  responseSuggestions?: Suggestion[];
  /** Number of files currently loaded in context */
  fileCount?: number;
  /** Called when user clicks Stop to abort streaming */
  onStop?: () => void;
  /** Called when user clicks Review to trigger review mode */
  onReview?: () => void;
  /** Currently selected AI model */
  currentModel?: string;
  /** Called when model is changed */
  onModelChange?: (model: string) => void;
  /** Current agent mode */
  agentMode?: AgentMode;
  /** Called when mode is toggled */
  onModeChange?: (mode: AgentMode) => void;
  /** Whether streaming was stopped by user */
  isStopped?: boolean;
  /** Called when user wants to apply a code block to a file */
  onApplyCode?: (code: string, fileId: string, fileName: string) => void;
  /** Called when user wants to save a code block as new file */
  onSaveCode?: (code: string, fileName: string) => void;
  /** Current editor selection text (for selection injection context) */
  editorSelection?: string | null;
}

// ── Content renderer with CodeBlock support ────────────────────────────────────

interface ContentSegment {
  type: 'text' | 'code';
  content: string;
  language?: string;
  fileName?: string;
}

function parseContentSegments(text: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  const codeBlockRe = /```(\w*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRe.exec(text)) !== null) {
    // Text before code block
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    // Code block
    const language = match[1] || undefined;
    const code = match[2].replace(/\n$/, ''); // trim trailing newline
    segments.push({ type: 'code', content: code, language });
    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return segments;
}

function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const boldIdx = remaining.indexOf('**');
    const codeIdx = remaining.indexOf('`');

    if (boldIdx === -1 && codeIdx === -1) {
      parts.push(remaining);
      break;
    }

    const isBoldFirst =
      boldIdx !== -1 && (codeIdx === -1 || boldIdx < codeIdx);

    if (isBoldFirst) {
      if (boldIdx > 0) parts.push(remaining.slice(0, boldIdx));
      const closeIdx = remaining.indexOf('**', boldIdx + 2);
      if (closeIdx === -1) { parts.push(remaining.slice(boldIdx)); break; }
      parts.push(<strong key={`b-${key++}`} className="font-semibold text-gray-100">{remaining.slice(boldIdx + 2, closeIdx)}</strong>);
      remaining = remaining.slice(closeIdx + 2);
    } else {
      if (codeIdx > 0) parts.push(remaining.slice(0, codeIdx));
      const closeIdx = remaining.indexOf('`', codeIdx + 1);
      if (closeIdx === -1) { parts.push(remaining.slice(codeIdx)); break; }
      parts.push(<code key={`c-${key++}`} className="rounded bg-gray-700/60 px-1 py-0.5 text-[0.8em] font-mono text-blue-300">{remaining.slice(codeIdx + 1, closeIdx)}</code>);
      remaining = remaining.slice(closeIdx + 1);
    }
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

function renderTextContent(text: string): React.ReactNode {
  if (!text.trim()) return null;

  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let key = 0;

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`ul-${key++}`} className="list-disc list-inside space-y-0.5 my-1">
          {listItems}
        </ul>
      );
      listItems = [];
    }
  };

  for (const line of lines) {
    const listMatch = line.match(/^[\s]*[-*]\s+(.+)$/);
    if (listMatch) {
      listItems.push(
        <li key={`li-${key++}`}>{renderInline(listMatch[1])}</li>
      );
      continue;
    }

    flushList();

    if (line.trim() === '') {
      elements.push(<br key={`br-${key++}`} />);
    } else {
      elements.push(
        <p key={`p-${key++}`} className="my-0.5">
          {renderInline(line)}
        </p>
      );
    }
  }

  flushList();
  return <>{elements}</>;
}

// ── Model options ──────────────────────────────────────────────────────────────

const MODEL_OPTIONS = [
  { value: 'claude-sonnet-4-20250514', label: 'Sonnet 4', description: 'Fast, balanced' },
  { value: 'claude-opus-4-20250514', label: 'Opus 4', description: 'Most capable' },
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', description: 'Google AI' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', description: 'Fast, efficient' },
];

// ── ChatInterface component ───────────────────────────────────────────────────

export function ChatInterface({
  messages,
  isLoading,
  onSend,
  placeholder = 'Ask the agent...',
  className = '',
  selectedElement,
  onDismissElement,
  contextSuggestions = [],
  responseSuggestions = [],
  fileCount = 0,
  onStop,
  onReview,
  currentModel,
  onModelChange,
  agentMode = 'orchestrated',
  onModeChange,
  isStopped = false,
  onApplyCode,
  onSaveCode,
  editorSelection,
}: ChatInterfaceProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [inputHasText, setInputHasText] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, responseSuggestions]);

  // Close model picker when clicking outside
  useEffect(() => {
    if (!showModelPicker) return;
    const handleClick = () => setShowModelPicker(false);
    // Delay to avoid closing on the same click that opened it
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClick);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClick);
    };
  }, [showModelPicker]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = inputRef.current?.value?.trim();
    if (!raw || isLoading) return;

    const prefix = selectedElement ? `[${selectedElement.selector}]: ` : '';
    onSend(prefix + raw);
    if (inputRef.current) inputRef.current.value = '';
    setInputHasText(false);
    onDismissElement?.();
  };

  const handleSuggestionSelect = (prompt: string) => {
    onSend(prompt);
  };

  // Determine which suggestions to show
  const showPreSuggestions = !inputHasText && messages.length === 0 && !isLoading && contextSuggestions.length > 0;
  const showPostSuggestions = !isLoading && responseSuggestions.length > 0 && messages.length > 0;
  const lastMessage = messages[messages.length - 1];
  const showPostAfterAssistant = showPostSuggestions && lastMessage?.role === 'assistant';

  return (
    <div className={`flex flex-col flex-1 min-h-0 ${className}`}>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-3 p-2"
        role="log"
        aria-label="Conversation"
      >
        {/* Empty state with contextual suggestions */}
        {messages.length === 0 && !isLoading && (
          <div className="py-4 space-y-4">
            <p className="text-sm text-gray-500 text-center">
              What would you like to build?
            </p>
            {showPreSuggestions && (
              <SuggestionChips
                suggestions={contextSuggestions}
                onSelect={handleSuggestionSelect}
                variant="pre"
              />
            )}
          </div>
        )}

        {/* Messages */}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`rounded-lg px-3 py-2 text-sm leading-relaxed ${
              m.role === 'user'
                ? 'bg-blue-600/20 text-gray-100 ml-4'
                : 'bg-gray-800/60 text-gray-300 mr-4'
            }`}
          >
            {m.role === 'assistant' ? (
              <>
                {parseContentSegments(m.content).map((seg, i) =>
                  seg.type === 'code' ? (
                    <CodeBlock
                      key={`code-${i}`}
                      code={seg.content}
                      language={seg.language}
                      fileName={seg.fileName}
                      onApply={onApplyCode}
                      onSave={onSaveCode}
                    />
                  ) : (
                    <React.Fragment key={`text-${i}`}>
                      {renderTextContent(seg.content)}
                    </React.Fragment>
                  )
                )}
              </>
            ) : (
              m.content
            )}
          </div>
        ))}

        {/* Loading state */}
        {isLoading && (
          <div className="rounded-lg px-3 py-2 text-sm bg-gray-800/60 text-gray-500 italic">
            Analyzing your request...
          </div>
        )}

        {/* Post-response suggestions (after last assistant message) */}
        {showPostAfterAssistant && (
          <div className="pt-1">
            <p className="text-[10px] text-gray-600 uppercase tracking-wider mb-1.5 px-1">Next steps</p>
            <SuggestionChips
              suggestions={responseSuggestions}
              onSelect={handleSuggestionSelect}
              variant="post"
            />
          </div>
        )}
      </div>

      {/* Input area — Cursor-style */}
      <div className="flex-shrink-0 border-t border-gray-800">
        {/* Context badges */}
        {(fileCount > 0 || editorSelection) && (
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-800/50">
            {fileCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-800 px-2 py-0.5 text-[10px] text-gray-400">
                <Paperclip className="h-3 w-3" />
                {fileCount} file{fileCount !== 1 ? 's' : ''}
              </span>
            )}
            {editorSelection && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-600/10 border border-blue-500/20 px-2 py-0.5 text-[10px] text-blue-400 truncate max-w-[200px]">
                Selection: {editorSelection.slice(0, 40)}{editorSelection.length > 40 ? '…' : ''}
              </span>
            )}
          </div>
        )}

        {selectedElement && (
          <div className="px-3 py-1.5">
            <ElementRefChip element={selectedElement} onDismiss={onDismissElement} />
          </div>
        )}

        {/* Inline pre-prompt chips when there ARE messages but input is empty */}
        {!showPreSuggestions && !inputHasText && !isLoading && contextSuggestions.length > 0 && messages.length > 0 && (
          <div className="px-3 py-1.5">
            <SuggestionChips
              suggestions={contextSuggestions.slice(0, 2)}
              onSelect={handleSuggestionSelect}
              variant="pre"
            />
          </div>
        )}

        <form onSubmit={handleSubmit} className="px-3 py-2">
          <textarea
            ref={inputRef}
            name="message"
            rows={2}
            placeholder={placeholder}
            disabled={isLoading}
            className="w-full rounded-lg border border-gray-700 bg-gray-800/80 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 resize-none"
            onChange={(e) => setInputHasText(e.target.value.trim().length > 0)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />

          {/* Action bar */}
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-1.5">
              {/* Model picker */}
              {onModelChange && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setShowModelPicker(p => !p); }}
                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-gray-400 bg-gray-800 border border-gray-700 hover:border-gray-600 hover:text-gray-300 transition-colors"
                  >
                    <span className="truncate max-w-[100px]">{currentModel?.split('-').slice(0, 2).join(' ') || 'Model'}</span>
                    <ChevronDown className="h-3 w-3" />
                  </button>
                  {showModelPicker && (
                    <div className="absolute bottom-full left-0 mb-1 w-56 rounded-lg border border-gray-700 bg-gray-900 shadow-xl z-50 py-1">
                      {MODEL_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => { onModelChange(opt.value); setShowModelPicker(false); }}
                          className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-800 transition-colors ${
                            currentModel === opt.value ? 'text-blue-400' : 'text-gray-300'
                          }`}
                        >
                          <div className="font-medium">{opt.label}</div>
                          <div className="text-[10px] text-gray-500">{opt.description}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Orchestrated / Solo toggle */}
              {onModeChange && (
                <button
                  type="button"
                  onClick={() => onModeChange(agentMode === 'orchestrated' ? 'solo' : 'orchestrated')}
                  className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] border transition-colors ${
                    agentMode === 'solo'
                      ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                      : 'text-gray-400 bg-gray-800 border-gray-700 hover:border-gray-600'
                  }`}
                  title={agentMode === 'orchestrated' ? 'Multi-agent mode: PM delegates to specialists' : 'Solo mode: single-pass generation'}
                >
                  {agentMode === 'solo' ? 'Solo' : 'Team'}
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {/* Stop button (visible during streaming) */}
              {isLoading && onStop && (
                <button
                  type="button"
                  onClick={onStop}
                  className="inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-xs font-medium text-red-400 bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 transition-colors"
                >
                  <Square className="h-3 w-3 fill-current" />
                  Stop
                </button>
              )}

              {/* Stopped state label */}
              {!isLoading && isStopped && (
                <span className="text-[11px] text-gray-500 italic">Stopped</span>
              )}

              {/* Review button */}
              {onReview && !isLoading && messages.length > 0 && (
                <button
                  type="button"
                  onClick={onReview}
                  className="inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-xs text-gray-400 hover:bg-gray-700/60 hover:text-gray-200 transition-colors"
                >
                  <Search className="h-3 w-3" />
                  Review
                </button>
              )}

              {/* Send button */}
              <button
                type="submit"
                disabled={isLoading}
                className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
              >
                {isLoading ? 'Running…' : 'Send'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
