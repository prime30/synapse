import { estimateTokens } from './token-counter';
import type { AIMessage } from './types';

export interface BudgetResult {
  messages: AIMessage[];
  totalTokens: number;
  truncated: boolean;
  truncatedCount: number;
}

export interface BudgetConfig {
  total: number;
  system: number;
  history: number;
  files: number;
  user: number;
  reserve: number;
}

export const DEFAULT_BUDGET: BudgetConfig = {
  total: 180_000,   // Shopify themes + Claude's 200k window
  system: 12_000,   // PM knowledge modules + specialist prompts
  history: 30_000,
  files: 100_000,   // Manifest + selected file content
  user: 12_000,     // Selection injection + DOM context
  reserve: 24_000,  // Safety margin for response tokens
};

/**
 * Truncates text to fit within a token budget by removing from the end.
 * Uses character-based estimation (4 chars ≈ 1 token).
 */
function truncateToTokenBudget(text: string, maxTokens: number): string {
  const tokens = estimateTokens(text);
  if (tokens <= maxTokens) return text;
  const targetChars = maxTokens * 4;
  return text.slice(0, targetChars);
}

/**
 * Enforces total request budget by measuring tokens and truncating from oldest
 * non-system messages. System messages are always kept but capped at the
 * system budget. The last user message is always preserved.
 */
export function enforceRequestBudget(
  messages: AIMessage[],
  max: number = DEFAULT_BUDGET.total
): BudgetResult {
  const config = DEFAULT_BUDGET;
  let truncatedCount = 0;

  if (messages.length === 0) {
    return {
      messages: [],
      totalTokens: 0,
      truncated: false,
      truncatedCount: 0,
    };
  }

  const systemMessages: AIMessage[] = [];
  const nonSystemMessages: AIMessage[] = [];

  for (const m of messages) {
    if (m.role === 'system') {
      systemMessages.push(m);
    } else {
      nonSystemMessages.push(m);
    }
  }

  // Cap system messages at system budget (never remove, only truncate content)
  let cappedSystem: AIMessage[] = systemMessages;
  let systemTokens = 0;
  let systemWasTruncated = false;
  if (systemMessages.length > 0) {
    const combinedSystemContent = systemMessages.map((m) => m.content).join('\n\n');
    const originalSystemTokens = estimateTokens(combinedSystemContent);
    systemWasTruncated = originalSystemTokens > config.system;
    if (systemWasTruncated) {
      const truncatedContent = truncateToTokenBudget(combinedSystemContent, config.system);
      cappedSystem = [{ role: 'system' as const, content: truncatedContent }];
    }
    systemTokens = estimateTokens(cappedSystem.map((m) => m.content).join(''));
  }

  // Edge case: only system messages
  if (nonSystemMessages.length === 0) {
    return {
      messages: cappedSystem,
      totalTokens: systemTokens,
      truncated: systemWasTruncated,
      truncatedCount: 0,
    };
  }

  // Find index of last user message in non-system array
  let lastUserIndex = -1;
  for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
    if (nonSystemMessages[i].role === 'user') {
      lastUserIndex = i;
      break;
    }
  }

  // Tail: from last user message onward (always kept)
  const tail = lastUserIndex >= 0
    ? nonSystemMessages.slice(lastUserIndex)
    : nonSystemMessages;
  const removable = lastUserIndex >= 0
    ? nonSystemMessages.slice(0, lastUserIndex)
    : [];

  const tailTokens = estimateTokens(tail.map((m) => m.content).join(''));
  let keptRemovable: AIMessage[] = [];
  let removableTokens = 0;

  const budgetForRemovable = Math.max(0, max - systemTokens - tailTokens);

  if (removable.length > 0 && budgetForRemovable > 0) {
    // Keep the most recent part of removable (work backwards from end)
    // Remove oldest first until within budget
    const reversed = [...removable].reverse();
    let accumulated = 0;
    const keptReversed: AIMessage[] = [];
    for (const m of reversed) {
      const tokens = estimateTokens(m.content);
      if (accumulated + tokens <= budgetForRemovable) {
        keptReversed.unshift(m);
        accumulated += tokens;
      }
    }
    keptRemovable = keptReversed;
    removableTokens = accumulated;
    truncatedCount = removable.length - keptRemovable.length;
  } else if (removable.length > 0) {
    truncatedCount = removable.length;
  }

  const resultMessages: AIMessage[] = [...cappedSystem, ...keptRemovable, ...tail];
  const totalTokens = systemTokens + removableTokens + tailTokens;

  return {
    messages: resultMessages,
    totalTokens,
    truncated: truncatedCount > 0,
    truncatedCount,
  };
}
