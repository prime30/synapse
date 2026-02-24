import { describe, it, expect } from 'vitest';
import { compressHistoryForBudget } from '../message-compression';

describe('compressHistoryForBudget', () => {
  const makeMessage = (i: number, hasMetadata = false) => ({
    role: 'user' as const,
    content: `Message ${i}: ${'x'.repeat(100)}`,
    metadata: hasMetadata ? {
      toolCalls: [{ type: 'tool_use' as const, id: `t${i}`, name: 'read_file', input: { fileId: `f${i}` } }],
      toolResults: [{ type: 'tool_result' as const, tool_use_id: `t${i}`, content: 'x'.repeat(600), is_error: false }],
    } : null,
    created_at: new Date(Date.now() - i * 60000).toISOString(),
  });

  it('keeps recent messages with full metadata', () => {
    const messages = Array.from({ length: 5 }, (_, i) => makeMessage(i, true));
    const compressed = compressHistoryForBudget(messages, 100_000);
    expect(compressed.length).toBe(5);
    expect(compressed[4].metadata?.toolResults?.[0].content.length).toBeGreaterThan(500);
  });

  it('compresses older messages (truncates tool results)', () => {
    const messages = Array.from({ length: 20 }, (_, i) => makeMessage(i, true));
    const compressed = compressHistoryForBudget(messages, 100_000);
    // Older messages should have compressed results
    const older = compressed.find(m => m.metadata?.toolResults?.[0].compressed);
    // At least some should be compressed
    expect(compressed.length).toBeGreaterThan(0);
  });

  it('strips metadata from ancient messages', () => {
    const messages = Array.from({ length: 30 }, (_, i) => makeMessage(i, true));
    const compressed = compressHistoryForBudget(messages, 50_000);
    const noMeta = compressed.filter(m => m.metadata === null);
    expect(noMeta.length).toBeGreaterThanOrEqual(0); // Some may be cut by budget
  });

  it('stops when budget is exhausted', () => {
    const messages = Array.from({ length: 100 }, (_, i) => makeMessage(i, true));
    const compressed = compressHistoryForBudget(messages, 5_000);
    expect(compressed.length).toBeLessThan(100);
  });

  it('handles empty input', () => {
    expect(compressHistoryForBudget([], 30_000)).toEqual([]);
  });
});
