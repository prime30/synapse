'use client';

import { ContextPanel } from './ContextPanel';
import { ChatInterface } from './ChatInterface';
import { AmbientBar } from './AmbientBar';
import type { ChatMessage } from './ChatInterface';
import type { AISidebarContextValue } from '@/hooks/useAISidebar';
import type { AmbientNudge } from '@/hooks/useAmbientIntelligence';
import { ResizeHandle } from '@/components/ui/ResizeHandle';

interface AISidebarProps {
  isOpen: boolean;
  width: number;
  minWidth: number;
  maxWidth: number;
  onClose: () => void;
  onResize: (width: number) => void;
  context: AISidebarContextValue;
  messages: ChatMessage[];
  isLoading: boolean;
  onSend: (content: string) => void;
  className?: string;
  /** Highest-confidence ambient nudge to display. */
  topNudge?: AmbientNudge | null;
  /** Called when user accepts a nudge. */
  onNudgeAccept?: (nudgeId: string) => void;
  /** Called when user dismisses a nudge. */
  onNudgeDismiss?: (nudgeId: string) => void;
}

export function AISidebar({
  isOpen,
  width,
  minWidth,
  maxWidth,
  onClose,
  onResize,
  context,
  messages,
  isLoading,
  onSend,
  className = '',
  topNudge = null,
  onNudgeAccept,
  onNudgeDismiss,
}: AISidebarProps) {
  if (!isOpen) return null;

  return (
    <>
      <div
        className={`relative flex flex-col border-l ide-border-subtle ide-surface flex-shrink-0 ${className}`}
        style={{ width: `${width}px` }}
        role="complementary"
        aria-label="AI assistant"
      >
        {/* Resize handle (left edge) */}
        <ResizeHandle
          side="left"
          minWidth={minWidth}
          maxWidth={maxWidth}
          currentWidth={width}
          onResize={onResize}
        />
        <div className="flex flex-col flex-1 min-h-0 pl-1">
          {/* Header */}
          <div className="flex items-center justify-between border-b ide-border-subtle px-3 py-2 flex-shrink-0">
            <span className="text-sm font-medium ide-text-2">AI Assistant</span>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1.5 ide-text-3 ide-hover hover:ide-text-2"
              aria-label="Close sidebar"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <ContextPanel context={context} className="mx-2 mt-2 flex-shrink-0" />
          <ChatInterface
            messages={messages}
            isLoading={isLoading}
            onSend={onSend}
            className="flex-1 min-h-0 mt-2"
          />
          {/* Ambient intelligence bar — shows proactive nudges below chat */}
          {onNudgeAccept && onNudgeDismiss && (
            <AmbientBar
              nudge={topNudge}
              onAccept={onNudgeAccept}
              onDismiss={onNudgeDismiss}
            />
          )}
        </div>
      </div>
    </>
  );
}
