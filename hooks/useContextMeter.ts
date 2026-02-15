'use client';

import { useMemo } from 'react';
import { estimateTokens } from '@/lib/ai/token-counter';
import {
  MODEL_CONTEXT_LIMITS,
  DEFAULT_CONTEXT_LIMIT,
  SYSTEM_PROMPT_OVERHEAD,
  AVG_TOKENS_PER_FILE,
} from '@/lib/ai/model-limits';
import type { ChatMessage } from '@/components/ai-sidebar/ChatInterface';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ContextStatus = 'ok' | 'warning' | 'critical';

export interface ContextBreakdown {
  messages: number;
  systemPrompt: number;
  fileContext: number;
  selection: number;
  /** Number of messages that were summarized/trimmed */
  summarizedMessages?: number;
  /** Total files available in project */
  totalFiles?: number;
  /** Files actually included in context */
  includedFiles?: number;
  /** Whether budget enforcement truncated content */
  budgetTruncated?: boolean;
  /** Per-agent token usage breakdown */
  perAgentUsage?: Array<{ agentType: string; inputTokens: number; outputTokens: number }>;
}

export interface ContextMeterState {
  /** Total estimated tokens in use. */
  usedTokens: number;
  /** Max tokens for the current model. */
  maxTokens: number;
  /** Usage percentage (0-100). */
  percentage: number;
  /** Token count per category. */
  breakdown: ContextBreakdown;
  /** Threshold status for color coding. */
  status: ContextStatus;
}

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

const WARNING_THRESHOLD = 0.6;  // 60%
const CRITICAL_THRESHOLD = 0.85; // 85%

function deriveStatus(percentage: number): ContextStatus {
  if (percentage >= CRITICAL_THRESHOLD * 100) return 'critical';
  if (percentage >= WARNING_THRESHOLD * 100) return 'warning';
  return 'ok';
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Computes an estimated context window usage breakdown.
 *
 * The estimate is intentionally conservative -- it counts all message text,
 * a fixed system-prompt overhead, a per-file rough estimate, and any
 * editor selection text.  Recomputes whenever messages or model change.
 */
export function useContextMeter(
  messages: ChatMessage[],
  currentModel?: string,
  fileCount = 0,
  editorSelection?: string | null,
  /** Number of messages that were summarized */
  summarizedCount?: number,
  /** Total files in project */
  totalFiles?: number,
  /** Whether budget enforcement truncated */
  budgetTruncated?: boolean,
  /** Per-agent token usage breakdown */
  perAgentUsage?: Array<{ agentType: string; inputTokens: number; outputTokens: number }>,
  /** Actual loaded file tokens from context_stats SSE event (overrides estimate) */
  loadedFileTokens?: number,
): ContextMeterState {
  return useMemo(() => {
    // 1. Messages
    const messageTokens = messages.reduce(
      (sum, m) => sum + estimateTokens(m.content),
      0,
    );

    // 2. System prompt overhead (fixed estimate)
    const systemTokens = SYSTEM_PROMPT_OVERHEAD;

    // 3. File context: use actual loaded tokens if available, otherwise estimate
    const fileTokens = loadedFileTokens ?? (fileCount * AVG_TOKENS_PER_FILE);

    // 4. Editor selection
    const selectionTokens = editorSelection
      ? estimateTokens(editorSelection)
      : 0;

    const usedTokens =
      messageTokens + systemTokens + fileTokens + selectionTokens;

    const maxTokens =
      (currentModel && MODEL_CONTEXT_LIMITS[currentModel]) ||
      DEFAULT_CONTEXT_LIMIT;

    const percentage = Math.min(100, (usedTokens / maxTokens) * 100);

    return {
      usedTokens,
      maxTokens,
      percentage,
      breakdown: {
        messages: messageTokens,
        systemPrompt: systemTokens,
        fileContext: fileTokens,
        selection: selectionTokens,
        summarizedMessages: summarizedCount,
        totalFiles,
        includedFiles: fileCount,
        budgetTruncated,
        perAgentUsage,
      },
      status: deriveStatus(percentage),
    };
  }, [messages, currentModel, fileCount, editorSelection, summarizedCount, totalFiles, budgetTruncated, perAgentUsage, loadedFileTokens]);
}
