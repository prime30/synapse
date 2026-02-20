import { estimateTokens } from './token-counter';
import type { AIMessage } from './types';
import type { AgentType, RoutingTier } from '@/lib/types/agent';

export interface BudgetResult {
  messages: AIMessage[];
  totalTokens: number;
  truncated: boolean;
  truncatedCount: number;
  /** True when budget enforcement had to truncate content to fit. */
  budgetTruncated: boolean;
  /** Token overhead reserved for thinking (reduce max_tokens by this amount). */
  thinkingTokenOverhead: number;
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

export const AGENT_BUDGETS: Partial<Record<AgentType, Partial<BudgetConfig>>> = {
  'project_manager': { system: 15_000, files: 80_000 },
  'liquid':          { system: 8_000,  files: 40_000 },
  'css':             { system: 8_000,  files: 40_000 },
  'javascript':      { system: 8_000,  files: 40_000 },
  'json':            { system: 6_000,  files: 30_000 },
  'review':          { system: 6_000,  files: 20_000, user: 30_000 },
  'general':         { system: 8_000,  files: 40_000 },
  'general_1':       { system: 8_000,  files: 40_000 },
  'general_2':       { system: 8_000,  files: 40_000 },
  'general_3':       { system: 8_000,  files: 40_000 },
  'general_4':       { system: 8_000,  files: 40_000 },
};

/** Get the effective budget config for a specific agent type. */
export function getAgentBudget(agentType?: AgentType): BudgetConfig {
  if (!agentType) return { ...DEFAULT_BUDGET };
  const overrides = AGENT_BUDGETS[agentType] ?? {};
  return { ...DEFAULT_BUDGET, ...overrides };
}

// ── Tiered budget for smart routing ─────────────────────────────────────

const TIERED_BUDGETS: Record<RoutingTier, BudgetConfig> = {
  TRIVIAL: {
    total: 30_000,
    system: 3_000,
    history: 5_000,
    files: 5_000,
    user: 5_000,
    reserve: 12_000,
  },
  SIMPLE: {
    total: 100_000,
    system: 10_000,
    history: 15_000,
    files: 20_000,
    user: 10_000,
    reserve: 20_000,
  },
  COMPLEX: { ...DEFAULT_BUDGET },
  ARCHITECTURAL: {
    total: 900_000,
    system: 15_000,
    history: 50_000,
    files: 180_000,
    user: 12_000,
    reserve: 50_000,
  },
};

// ── Per-agent tier-scaled budgets (EPIC V5) ─────────────────────────────────

/**
 * Specialist agent token budgets scaled by routing tier.
 * PM budgets are higher since they need full-project awareness.
 */
export interface TierAgentBudget {
  pm: number;
  specialist: number;
}

const TIER_AGENT_BUDGETS: Record<RoutingTier, TierAgentBudget> = {
  TRIVIAL:       { pm: 20_000,  specialist: 15_000 },
  SIMPLE:        { pm: 30_000,  specialist: 25_000 },
  COMPLEX:       { pm: 50_000,  specialist: 35_000 },
  ARCHITECTURAL: { pm: 100_000, specialist: 60_000 },
};

/**
 * Get tier-scaled budget for a specific agent role.
 * Returns the appropriate token budget for PM or specialist agents
 * based on the routing tier.
 */
export function getTierAgentBudget(
  tier: RoutingTier,
  role: 'pm' | 'specialist',
): number {
  return TIER_AGENT_BUDGETS[tier][role];
}

/** Get tier-aware budget config for smart routing. */
export function getTieredBudget(tier: RoutingTier): BudgetConfig {
  return { ...TIERED_BUDGETS[tier] };
}

/**
 * Truncates text to fit within a token budget using middle-preserving strategy.
 * Keeps the first ~60% and last ~20% of the budget, cutting from the middle.
 * This preserves imports/structure at the start and JSON instructions at the end.
 */
function truncateToTokenBudget(text: string, maxTokens: number): string {
  const tokens = estimateTokens(text);
  if (tokens <= maxTokens) return text;

  const lines = text.split('\n');
  if (lines.length <= 3) {
    // Very few lines — just slice characters
    const targetChars = maxTokens * 4;
    return text.slice(0, targetChars);
  }

  // Keep first 60% of budget for the front, last 20% for the back
  const frontBudget = Math.floor(maxTokens * 0.6);
  const backBudget = Math.floor(maxTokens * 0.2);

  // Find front split point
  let frontEnd = 0;
  let frontTokens = 0;
  for (let i = 0; i < lines.length; i++) {
    const lineTokens = estimateTokens(lines[i]);
    if (frontTokens + lineTokens > frontBudget) break;
    frontTokens += lineTokens;
    frontEnd = i + 1;
  }

  // Find back split point (scan from end)
  let backStart = lines.length;
  let backTokens = 0;
  for (let i = lines.length - 1; i >= frontEnd; i--) {
    const lineTokens = estimateTokens(lines[i]);
    if (backTokens + lineTokens > backBudget) break;
    backTokens += lineTokens;
    backStart = i;
  }

  const frontPart = lines.slice(0, frontEnd).join('\n');
  const backPart = lines.slice(backStart).join('\n');
  const truncatedLines = backStart - frontEnd;

  return `${frontPart}\n\n[... ${truncatedLines} lines truncated to fit token budget ...]\n\n${backPart}`;
}

/**
 * Enforces total request budget by measuring tokens and truncating.
 * Strategy:
 * 1. Cap system messages at system budget
 * 2. Remove oldest non-system messages (history) first
 * 3. If the tail (last user message) STILL exceeds budget, truncate it using
 *    middle-preserving strategy (protects JSON instructions at the end)
 */
export function enforceRequestBudget(
  messages: AIMessage[],
  max: number = DEFAULT_BUDGET.total,
  options?: { thinkingEnabled?: boolean; thinkingOverheadPct?: number },
): BudgetResult {
  const config = DEFAULT_BUDGET;
  let truncatedCount = 0;
  let budgetTruncated = false;

  // Reserve thinking overhead (default 20%) when thinking is enabled
  const thinkingTokenOverhead = options?.thinkingEnabled
    ? Math.floor(max * (options?.thinkingOverheadPct ?? 0.2))
    : 0;

  if (messages.length === 0) {
    return {
      messages: [],
      totalTokens: 0,
      truncated: false,
      truncatedCount: 0,
      budgetTruncated: false,
      thinkingTokenOverhead,
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
      // Preserve cacheControl from original system message
      const original = systemMessages[0];
      const truncatedMsg: AIMessage = { role: 'system' as const, content: truncatedContent };
      if (original.cacheControl) truncatedMsg.cacheControl = original.cacheControl;
      if (original.citations) truncatedMsg.citations = original.citations;
      cappedSystem = [truncatedMsg];
      budgetTruncated = true;
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
      budgetTruncated,
      thinkingTokenOverhead,
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

  // Tail: from last user message onward
  let tail = lastUserIndex >= 0
    ? [...nonSystemMessages.slice(lastUserIndex)]
    : [...nonSystemMessages];
  const removable = lastUserIndex >= 0
    ? nonSystemMessages.slice(0, lastUserIndex)
    : [];

  // ── NEW: Truncate the tail (last user message) if it alone exceeds budget ──
  const availableForTail = Math.max(0, max - systemTokens);
  let tailTokens = estimateTokens(tail.map((m) => m.content).join(''));

  if (tailTokens > availableForTail && tail.length > 0) {
    // Truncate the last user message (which is tail[0]) using middle-preserving strategy
    // Spread preserves cacheControl, citations, and any other metadata
    const lastMsg = tail[0];
    const truncatedContent = truncateToTokenBudget(lastMsg.content, availableForTail);
    const truncatedMsg: AIMessage = { role: lastMsg.role, content: truncatedContent };
    if (lastMsg.cacheControl) truncatedMsg.cacheControl = lastMsg.cacheControl;
    if (lastMsg.citations) truncatedMsg.citations = lastMsg.citations;
    tail = [truncatedMsg, ...tail.slice(1)];
    tailTokens = estimateTokens(tail.map((m) => m.content).join(''));
    truncatedCount++;
    budgetTruncated = true;
    console.warn(
      `[enforceRequestBudget] Tail truncated: ${availableForTail} token budget for last user message`
    );
  }

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
    const droppedHistory = removable.length - keptRemovable.length;
    if (droppedHistory > 0) {
      truncatedCount += droppedHistory;
      budgetTruncated = true;
    }
  } else if (removable.length > 0) {
    truncatedCount += removable.length;
    budgetTruncated = true;
  }

  const resultMessages: AIMessage[] = [...cappedSystem, ...keptRemovable, ...tail];
  const totalTokens = systemTokens + removableTokens + tailTokens;

  return {
    messages: resultMessages,
    totalTokens,
    truncated: truncatedCount > 0,
    truncatedCount,
    budgetTruncated,
    thinkingTokenOverhead,
  };
}
