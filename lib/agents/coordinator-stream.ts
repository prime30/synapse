/**
 * coordinator-stream.ts — Stream health management and batch-to-stream adapter.
 *
 * Extracted from coordinator-v2.ts (original lines 153–221, 5307–5367).
 * Self-contained module with no loop-state dependencies.
 */

import type {
  AIToolCompletionResult,
  ToolStreamEvent,
  ToolStreamResult,
} from '@/lib/ai/types';

// ── Stream health state ─────────────────────────────────────────────────────

const STREAM_FIRST_BYTE_TIMEOUT_MS = 30_000;
const STREAM_HEALTH_TTL_MS = 5 * 60_000;

let v2StreamBroken = false;
let v2StreamBrokenAt = 0;

export function isV2StreamBroken(): boolean {
  if (!v2StreamBroken) return false;
  if (Date.now() - v2StreamBrokenAt > STREAM_HEALTH_TTL_MS) {
    v2StreamBroken = false;
    v2StreamBrokenAt = 0;
    return false;
  }
  return true;
}

export function markV2StreamBroken(): void {
  v2StreamBroken = true;
  v2StreamBrokenAt = Date.now();
  console.warn('[V2-StreamHealth] Streaming marked broken (TTL=5m)');
}

/** No-op — kept for backward compat with benchmark test imports. */
export function resetV2StreamHealth(): void { /* no-op */ }

export { STREAM_FIRST_BYTE_TIMEOUT_MS };

// ── First-byte race ─────────────────────────────────────────────────────────

export async function raceFirstByteV2(
  streamResult: ToolStreamResult,
  timeoutMs: number,
): Promise<ToolStreamResult | null> {
  if (timeoutMs <= 0) return streamResult;
  const reader = streamResult.stream.getReader();
  const readPromise = reader.read().then(({ done, value }) => (done ? null : value ?? null));
  const timeoutPromise = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), timeoutMs));
  const winner = await Promise.race([readPromise, timeoutPromise]);
  if (winner === 'timeout') {
    try { reader.cancel(); } catch { /* ignore */ }
    reader.releaseLock();
    return null;
  }
  const firstEvent = winner as ToolStreamEvent | null;
  reader.releaseLock();
  if (!firstEvent) return streamResult;
  const originalStream = streamResult.stream;
  const prependedStream = new ReadableStream<ToolStreamEvent>({
    async start(controller) {
      controller.enqueue(firstEvent!);
      const innerReader = originalStream.getReader();
      try {
        while (true) {
          const { done, value } = await innerReader.read();
          if (done) break;
          controller.enqueue(value);
        }
      } catch (err) { controller.error(err); }
      finally { innerReader.releaseLock(); controller.close(); }
    },
  });
  return { ...streamResult, stream: prependedStream, getUsage: streamResult.getUsage };
}

// ── Batch-to-stream adapter ─────────────────────────────────────────────────

export function synthesizeBatchAsStream(
  batchResult: AIToolCompletionResult,
): ToolStreamResult {
  const events: ToolStreamEvent[] = [];

  if (batchResult.content) {
    events.push({ type: 'text_delta', text: batchResult.content });
  }

  if (batchResult.toolCalls) {
    for (const tc of batchResult.toolCalls) {
      events.push({ type: 'tool_start', id: tc.id, name: tc.name });
      events.push({
        type: 'tool_end',
        id: tc.id,
        name: tc.name,
        input: tc.input,
      });
    }
  }

  const rawBlocks: unknown[] = [];
  if (batchResult.content) {
    rawBlocks.push({ type: 'text', text: batchResult.content });
  }
  if (batchResult.toolCalls) {
    for (const tc of batchResult.toolCalls) {
      rawBlocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
    }
  }

  const stream = new ReadableStream<ToolStreamEvent>({
    start(controller) {
      for (const event of events) {
        controller.enqueue(event);
      }
      controller.close();
    },
  });

  return {
    stream,
    getUsage: async () => ({
      inputTokens: batchResult.inputTokens ?? 0,
      outputTokens: batchResult.outputTokens ?? 0,
      cacheCreationInputTokens: (batchResult as unknown as Record<string, number>).cacheCreationInputTokens ?? 0,
      cacheReadInputTokens: (batchResult as unknown as Record<string, number>).cacheReadInputTokens ?? 0,
    }),
    getStopReason: async () => batchResult.stopReason,
    getRawContentBlocks: async () => rawBlocks,
  };
}
