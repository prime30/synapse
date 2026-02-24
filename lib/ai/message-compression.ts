import { estimateTokens } from '@/lib/ai/token-counter';
import type { MessageMetadata } from '@/lib/types/database';

const RECENT_FULL_TURNS = 5;
const COMPRESSED_RESULT_MAX_CHARS = 500;

interface CompressibleMessage {
  role: string;
  content: string;
  metadata?: MessageMetadata | null;
  created_at: string;
}

interface CompressedMessage {
  role: string;
  content: string;
  metadata: MessageMetadata | null;
}

function truncateToolResult(content: string, maxChars: number): string {
  if (content.length <= maxChars) return content;
  return content.slice(0, maxChars) + `\n[... truncated ${content.length - maxChars} chars]`;
}

function compressMetadata(metadata: MessageMetadata): MessageMetadata {
  return {
    toolCalls: metadata.toolCalls,
    toolResults: metadata.toolResults?.map((tr) => ({
      ...tr,
      content: truncateToolResult(tr.content, COMPRESSED_RESULT_MAX_CHARS),
      compressed: true,
    })),
  };
}

function estimateMetadataTokens(metadata: MessageMetadata | null | undefined): number {
  if (!metadata) return 0;
  let tokens = 0;

  if (metadata.toolCalls) {
    for (const tc of metadata.toolCalls) {
      tokens += 50;
      tokens += estimateTokens(JSON.stringify(tc.input ?? {}));
    }
  }

  if (metadata.toolResults) {
    for (const tr of metadata.toolResults) {
      tokens += 20;
      tokens += estimateTokens(tr.content ?? '');
    }
  }

  return tokens;
}

/**
 * Compress conversation history with tiered strategy:
 * - Recent N turns: full tool context
 * - Turns N+1 to N+10: compressed (tool names kept, results truncated)
 * - Older turns: text only (metadata stripped)
 *
 * Processes newest-first and stops when the token budget is exhausted.
 */
export function compressHistoryForBudget(
  messages: CompressibleMessage[],
  budget: number = 30_000,
): CompressedMessage[] {
  let totalTokens = 0;
  const result: CompressedMessage[] = [];

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const distanceFromEnd = messages.length - 1 - i;

    let compressedMetadata: MessageMetadata | null = null;
    let metadataTokens = 0;

    if (msg.metadata) {
      if (distanceFromEnd < RECENT_FULL_TURNS * 2) {
        // Recent: keep full metadata (each turn is 2 messages: assistant + user)
        compressedMetadata = msg.metadata;
        metadataTokens = estimateMetadataTokens(msg.metadata);
      } else if (distanceFromEnd < RECENT_FULL_TURNS * 2 + 20) {
        // Mid-range: compress tool results
        compressedMetadata = compressMetadata(msg.metadata);
        metadataTokens = estimateMetadataTokens(compressedMetadata);
      }
      // Older: metadata stays null (text only)
    }

    const contentTokens = estimateTokens(msg.content);
    const msgTokens = contentTokens + metadataTokens;

    if (totalTokens + msgTokens > budget && result.length > 0) {
      break;
    }

    result.unshift({
      role: msg.role,
      content: msg.content,
      metadata: compressedMetadata,
    });
    totalTokens += msgTokens;
  }

  return result;
}

export { estimateMetadataTokens };
