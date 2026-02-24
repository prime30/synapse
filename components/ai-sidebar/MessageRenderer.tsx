'use client';

import React from 'react';
import { ThinkingBlock, type ThinkingStep } from './ThinkingBlock';
import { ThinkingBlockV2 } from './ThinkingBlockV2';
import { ToolActionItem } from './ToolActionItem';
import { MarkdownRenderer } from './MarkdownRenderer';
import type { ContentBlock } from './ChatInterface';

export interface MessageRendererMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content?: string;
  blocks?: Array<{
    type: string;
    id?: string;
    content?: string;
    text?: string;
    reasoningText?: string;
    done?: boolean;
    startedAt?: number;
    elapsedMs?: number;
    toolId?: string;
    toolName?: string;
    label?: string;
    subtitle?: string;
    status?: 'loading' | 'done' | 'error';
    cardType?: string;
    cardData?: unknown;
    error?: string;
    validationSuggestions?: string[];
    [key: string]: unknown;
  }>;
  thinkingSteps?: Array<{
    phase?: string;
    label?: string;
    detail?: string;
    done?: boolean;
    summary?: string;
    railPhase?: string;
    [key: string]: unknown;
  }>;
  thinkingComplete?: boolean;
  workers?: Array<{ workerId: string; label: string; status: 'running' | 'complete' }>;
  metadata?: Record<string, unknown>;
}

export interface MessageRendererProps {
  message: MessageRendererMessage;
  isStreaming?: boolean;
  isLastMessage?: boolean;
  /** Callbacks for interactive content (code apply, file open, etc.) */
  onOpenFile?: (path: string, line?: number) => void;
  onApplyCode?: (code: string, fileId: string, fileName: string) => void;
  onSaveCode?: (code: string, fileName: string) => void;
  resolveFileId?: (path: string) => string | null;
  onOpenPlanFile?: (filePath: string) => void;
  onBuildPlan?: (checkedSteps: Set<number>) => void;
  onSend?: (content: string) => void;
  onConfirmFileCreate?: (fileName: string, content: string) => void;
  /** Progress for legacy thinking block when streaming */
  progress?: number;
  secondsRemaining?: number | null;
  verbose?: boolean;
  onToggleVerbose?: () => void;
}

/** Map generic block to ContentBlock for ToolActionItem when possible */
function asContentBlock(
  block: NonNullable<MessageRendererMessage['blocks']>[number]
): ContentBlock | null {
  if (block.type === 'text' && (block.text ?? block.content)) {
    return {
      type: 'text',
      id: block.id ?? `text-${Math.random().toString(36).slice(2)}`,
      text: block.text ?? block.content ?? '',
    };
  }
  if (block.type === 'thinking') {
    return {
      type: 'thinking',
      id: block.id ?? `thinking-${Math.random().toString(36).slice(2)}`,
      startedAt: block.startedAt ?? 0,
      reasoningText: block.reasoningText ?? block.content ?? '',
      done: block.done ?? false,
      elapsedMs: block.elapsedMs ?? 0,
    };
  }
  if (block.type === 'tool_action') {
    return {
      type: 'tool_action',
      id: block.id ?? `tool-${Math.random().toString(36).slice(2)}`,
      toolId: block.toolId ?? '',
      toolName: block.toolName ?? block.label ?? 'tool',
      label: block.label ?? block.toolName ?? 'Action',
      subtitle: block.subtitle,
      status: (block.status as 'loading' | 'done' | 'error') ?? 'loading',
      cardType: block.cardType as ContentBlock extends { type: 'tool_action'; cardType?: infer C } ? C : never,
      cardData: block.cardData,
      error: block.error,
      validationSuggestions: block.validationSuggestions,
    };
  }
  return null;
}

export function MessageRenderer({
  message,
  isStreaming = false,
  isLastMessage = false,
  onOpenFile,
  onApplyCode,
  onSaveCode,
  resolveFileId,
  onOpenPlanFile,
  onBuildPlan,
  onSend,
  onConfirmFileCreate,
  progress,
  secondsRemaining,
  verbose,
  onToggleVerbose,
}: MessageRendererProps) {
  const { role, content, blocks, thinkingSteps, thinkingComplete, workers } = message;

  // ── System message: subtle info bar ─────────────────────────────────
  if (role === 'system') {
    return (
      <div className="text-xs text-stone-500 dark:text-stone-400 italic text-center py-2">
        {content ?? ''}
      </div>
    );
  }

  // ── User message: bubble style ────────────────────────────────────
  if (role === 'user') {
    const text = content ?? (blocks?.find(b => b.type === 'text')?.text ?? blocks?.find(b => b.type === 'text')?.content) ?? '';
    if (!text.trim()) return null;
    return (
      <div className="bg-stone-100 dark:bg-white/5 rounded-lg px-4 py-3 text-sm text-stone-900 dark:text-white">
        <MarkdownRenderer
          content={text}
          isStreaming={false}
          onOpenFile={onOpenFile}
          onApplyCode={onApplyCode}
          onSaveCode={onSaveCode}
          resolveFileId={resolveFileId}
        />
      </div>
    );
  }

  // ── Assistant message ─────────────────────────────────────────────

  // Block-based path: render each block by type
  if (blocks && blocks.length > 0) {
    return (
      <div className="space-y-1">
        {blocks.map((block, idx) => {
          const cb = asContentBlock(block);
          if (!cb) return null;

          switch (cb.type) {
            case 'thinking':
              return (
                <ThinkingBlockV2
                  key={cb.id}
                  reasoningText={cb.reasoningText}
                  isComplete={cb.done}
                  startedAt={cb.startedAt}
                  elapsedMs={cb.elapsedMs}
                />
              );
            case 'text':
              return (
                <MarkdownRenderer
                  key={cb.id}
                  content={cb.text}
                  isStreaming={isStreaming && isLastMessage}
                  onOpenFile={onOpenFile}
                  onApplyCode={onApplyCode}
                  onSaveCode={onSaveCode}
                  resolveFileId={resolveFileId}
                />
              );
            case 'tool_action':
              return (
                <ToolActionItem
                  key={cb.id}
                  block={cb}
                  onApplyCode={onApplyCode}
                  onOpenFile={onOpenFile}
                  resolveFileId={resolveFileId}
                  onOpenPlanFile={onOpenPlanFile}
                  onBuildPlan={onBuildPlan}
                  onSend={onSend}
                  onConfirmFileCreate={onConfirmFileCreate}
                />
              );
            default:
              return null;
          }
        })}
      </div>
    );
  }

  // Legacy path: thinkingSteps + content
  const hasLegacyThinking = thinkingSteps && thinkingSteps.length > 0;
  const hasContent = content && content.trim().length > 0;

  return (
    <div className="space-y-1">
      {hasLegacyThinking && (
        <ThinkingBlock
          steps={thinkingSteps as ThinkingStep[]}
          isComplete={thinkingComplete ?? false}
          defaultExpanded={!thinkingComplete}
          isStreaming={isStreaming && isLastMessage}
          progress={isStreaming && isLastMessage ? progress : undefined}
          secondsRemaining={isStreaming && isLastMessage ? secondsRemaining : undefined}
          onOpenFile={onOpenFile}
          verbose={verbose}
          onToggleVerbose={onToggleVerbose}
          workers={workers}
        />
      )}
      {hasContent && (
        <MarkdownRenderer
          content={content!}
          isStreaming={isStreaming && isLastMessage}
          onOpenFile={onOpenFile}
          onApplyCode={onApplyCode}
          onSaveCode={onSaveCode}
          resolveFileId={resolveFileId}
        />
      )}
    </div>
  );
}
