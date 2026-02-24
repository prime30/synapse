'use client';

import React from 'react';
import { Pencil, ClipboardCopy, Pin, RotateCcw, GitBranch } from 'lucide-react';

export interface MessageActionsProps {
  messageId: string;
  role: 'user' | 'assistant';
  isPinned: boolean;
  isLastAssistant: boolean;
  isLoading?: boolean;
  /** Whether the copy-response button shows "Copied!" */
  isCopiedResponse?: boolean;
  /** Whether the copy-prompt button shows "Copied!" */
  isCopiedPrompt?: boolean;
  onEdit?: () => void;
  onCopyResponse?: () => void;
  onCopyPrompt?: () => void;
  onPin?: () => void;
  onRegenerate?: () => void;
  onFork?: () => void;
}

/**
 * Per-message action buttons (edit, copy, pin, regenerate, fork).
 * Rendered on hover above each message.
 */
export function MessageActions({
  messageId,
  role,
  isPinned,
  isLastAssistant,
  isLoading = false,
  isCopiedResponse = false,
  isCopiedPrompt = false,
  onEdit,
  onCopyResponse,
  onCopyPrompt,
  onPin,
  onRegenerate,
  onFork,
}: MessageActionsProps) {
  return (
    <div
      className="absolute -top-1 right-1 hidden group-hover/msg:flex items-center gap-0.5 z-10 ide-surface-pop rounded-md px-0.5 py-0.5 border ide-border-subtle"
      data-message-id={messageId}
    >
      {/* Edit & resend (user messages only) */}
      {role === 'user' && onEdit && !isLoading && (
        <button
          type="button"
          onClick={onEdit}
          className="rounded p-1 ide-text-muted hover:ide-text-2 ide-hover transition-colors"
          title="Edit and resend"
          aria-label="Edit and resend this message"
        >
          <Pencil className="h-3 w-3" />
        </button>
      )}
      {/* Regenerate (last assistant message only) */}
      {role === 'assistant' && isLastAssistant && onRegenerate && !isLoading && (
        <button
          type="button"
          onClick={onRegenerate}
          className="rounded p-1 ide-text-muted hover:ide-text-2 ide-hover transition-colors"
          title="Regenerate response"
          aria-label="Regenerate this response"
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      )}
      {/* Copy full response (assistant messages) */}
      {role === 'assistant' && onCopyResponse && (
        <button
          type="button"
          onClick={onCopyResponse}
          className="rounded p-1 ide-text-muted hover:ide-text-2 ide-hover transition-colors"
          title="Copy full response"
          aria-label="Copy full response"
        >
          {isCopiedResponse ? (
            <span className="text-[10px] text-accent font-medium px-0.5">
              Copied!
            </span>
          ) : (
            <ClipboardCopy className="h-3 w-3" />
          )}
        </button>
      )}
      {/* Pin */}
      {onPin && (
        <button
          type="button"
          onClick={onPin}
          className={`rounded p-1 transition-colors ${
            isPinned
              ? 'text-amber-400 bg-amber-500/10'
              : 'ide-text-muted hover:ide-text-2 ide-hover'
          }`}
          title={isPinned ? 'Unpin message' : 'Pin message'}
        >
          <Pin className={`h-3 w-3 ${isPinned ? 'fill-current' : ''}`} />
        </button>
      )}
      {/* Copy as reusable prompt (assistant messages) */}
      {role === 'assistant' && onCopyPrompt && (
        <button
          type="button"
          onClick={onCopyPrompt}
          className="rounded p-1 ide-text-muted hover:ide-text-2 ide-hover transition-colors"
          title="Copy as reusable prompt"
        >
          {isCopiedPrompt ? (
            <span className="text-[10px] text-accent font-medium px-0.5">
              Copied!
            </span>
          ) : (
            <ClipboardCopy className="h-3 w-3" />
          )}
        </button>
      )}
      {/* Fork conversation */}
      {onFork && role === 'assistant' && (
        <button
          type="button"
          onClick={onFork}
          className="rounded p-1 ide-text-muted hover:ide-text-2 ide-hover transition-colors"
          title="Fork conversation from here"
        >
          <GitBranch className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
