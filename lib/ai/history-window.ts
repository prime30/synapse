import { estimateTokens } from './token-counter';

const KEEP_RECENT = 10;

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
  /** Preserved from AIMessage for prompt caching. */
  cacheControl?: { type: 'ephemeral'; ttl?: '5m' | '1h' };
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
 * Trims conversation history to fit within a token budget by keeping the last
 * KEEP_RECENT messages in full and summarizing older messages as first-sentence
 * excerpts. If the result still exceeds the budget, KEEP_RECENT is reduced.
 */
export function trimHistory(
  messages: HistoryMessage[],
  budget = 30_000
): TrimResult {
  if (messages.length === 0) {
    return { messages: [], summary: '', trimmedCount: 0 };
  }

  const totalTokens = estimateTokens(
    messages.map((m) => m.content).join('')
  );
  if (totalTokens <= budget) {
    return { messages: [...messages], summary: '', trimmedCount: 0 };
  }

  if (messages.length <= KEEP_RECENT) {
    return { messages: [...messages], summary: '', trimmedCount: 0 };
  }

  let keepRecent = KEEP_RECENT;
  let result: TrimResult;

  do {
    const older = messages.slice(0, messages.length - keepRecent);
    const kept = messages.slice(-keepRecent);

    const summaryParts = older.map((m) => {
      const first = extractFirstSentence(m.content);
      return `- ${m.role}: ${first || '(empty)'}`;
    });
    const summary = summaryParts.length
      ? `Older conversation summary:\n${summaryParts.join('\n')}`
      : '';

    const keptTokens = estimateTokens(kept.map((m) => m.content).join(''));
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
