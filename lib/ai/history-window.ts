import { estimateTokens } from './token-counter';
import { estimateMetadataTokens } from './message-compression';
import type { MessageMetadata } from '@/lib/types/database';

const KEEP_RECENT = 20;

interface TrimHistoryOptions {
  budget?: number;
  keepRecent?: number;
}

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Preserved from AIMessage for prompt caching. */
  cacheControl?: { type: 'ephemeral'; ttl?: '5m' | '1h' };
  /** Tool call/result metadata for context awareness. */
  metadata?: MessageMetadata | null;
}

export interface TrimResult {
  messages: HistoryMessage[];
  summary: string;
  trimmedCount: number;
}

/**
 * Extracts the first sentence of text (up to first period, exclamation,
 * question mark, or newline). If none found, returns the full text trimmed.
 */
function extractFirstSentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  const match = trimmed.match(/^[^.!?\n]*(?:[.!?\n]|$)/);
  return match ? match[0].trim() : trimmed;
}

/**
 * Build a richer summary for an older message, preserving file names,
 * tool calls, and key actions instead of just the first sentence.
 */
function buildRichSummary(msg: HistoryMessage): string {
  const first = extractFirstSentence(msg.content);
  const parts: string[] = [first || '(empty)'];

  // Extract file names mentioned in the message
  const fileRefs = msg.content.match(/[\w./-]+\.(liquid|css|js|json)/g);
  if (fileRefs && fileRefs.length > 0) {
    const unique = [...new Set(fileRefs)].slice(0, 5);
    parts.push(`files: ${unique.join(', ')}`);
  }

  // Extract tool calls from metadata
  if (msg.metadata?.toolCalls && msg.metadata.toolCalls.length > 0) {
    const toolNames = msg.metadata.toolCalls
      .map((tc: { name?: string }) => tc.name)
      .filter(Boolean)
      .slice(0, 5);
    if (toolNames.length > 0) {
      parts.push(`tools: ${[...new Set(toolNames)].join(', ')}`);
    }
  }

  // Detect edit actions
  const editMatch = msg.content.match(/(?:edited|changed|modified|updated|created|deleted)\s+(\S+\.\w+)/gi);
  if (editMatch) {
    parts.push(`edits: ${editMatch.slice(0, 3).join(', ')}`);
  }

  return parts.join(' | ');
}

/**
 * Trims conversation history to fit within a token budget by keeping the last
 * KEEP_RECENT messages in full and summarizing older messages as first-sentence
 * excerpts. If the result still exceeds the budget, KEEP_RECENT is reduced.
 */
export function trimHistory(
  messages: HistoryMessage[],
  budgetOrOptions: number | TrimHistoryOptions = 60_000,
): TrimResult {
  const opts: TrimHistoryOptions =
    typeof budgetOrOptions === 'number'
      ? { budget: budgetOrOptions }
      : budgetOrOptions;
  const budget = opts.budget ?? 60_000;
  const baseKeepRecent = Math.max(1, opts.keepRecent ?? KEEP_RECENT);

  if (messages.length === 0) {
    return { messages: [], summary: '', trimmedCount: 0 };
  }

  const totalTokens = messages.reduce(
    (sum, m) => sum + estimateTokens(m.content) + estimateMetadataTokens(m.metadata ?? null),
    0,
  );
  if (totalTokens <= budget) {
    return { messages: [...messages], summary: '', trimmedCount: 0 };
  }

  if (messages.length <= baseKeepRecent) {
    return { messages: [...messages], summary: '', trimmedCount: 0 };
  }

  let keepRecent = Math.min(baseKeepRecent, messages.length);
  let result: TrimResult;

  do {
    const older = messages.slice(0, messages.length - keepRecent);
    const kept = messages.slice(-keepRecent);

    const summaryParts = older.map((m) => {
      return `- ${m.role}: ${buildRichSummary(m)}`;
    });
    const summary = summaryParts.length
      ? `Older conversation context (${older.length} messages summarized):\n${summaryParts.join('\n')}`
      : '';

    const keptTokens = kept.reduce(
      (sum, m) => sum + estimateTokens(m.content) + estimateMetadataTokens(m.metadata ?? null),
      0,
    );
    const summaryTokens = estimateTokens(summary);
    const combinedTokens = keptTokens + summaryTokens;

    if (combinedTokens <= budget || keepRecent <= 1) {
      result = {
        messages: kept,
        summary,
        trimmedCount: older.length,
      };
      break;
    }

    keepRecent -= 1;
  } while (keepRecent >= 1);

  return result!;
}
