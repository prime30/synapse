/**
 * Anthropic API Features Integration Tests
 *
 * Verifies all new Anthropic API features are correctly wired:
 * 1. Cache TTL propagation (system, messages, tools, history)
 * 2. Thinking delta forwarding and filtering
 * 3. Context editing (beta header, body param, response parsing)
 * 4. Stream error recovery
 * 5. Signature delta skip
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Feature flag mock (factory is hoisted, so must be self-contained)
vi.mock('@/lib/ai/feature-flags', () => ({
  AI_FEATURES: {
    promptCaching: true,
    adaptiveThinking: true,
    contextEditing: true,
    promptCacheTtl: '1h' as const,
    structuredOutputs: false,
    streamingToolUse: false,
    citations: false,
    batchProcessing: false,
    pmExplorationTools: false,
    conditionalSummary: false,
    v2Agent: false,
    programmaticToolCalling: false,
  },
}));

// Fetch mock
let lastBody: Record<string, unknown> | null = null;
let lastHeaders: Record<string, string> | null = null;
let sseLines: string[] = [];

const mockFetch = vi.fn(async (_url: string, init?: RequestInit) => {
  lastBody = init?.body ? JSON.parse(init.body as string) : null;
  lastHeaders = (init?.headers as Record<string, string>) ?? null;
  const payload = sseLines.join('\n\n') + '\n\n';
  const enc = new TextEncoder();
  const body = new ReadableStream({
    start(c) { c.enqueue(enc.encode(payload)); c.close(); },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
});

vi.stubGlobal('fetch', mockFetch);

// Imports after mocks
import { createAnthropicProvider } from '@/lib/ai/providers/anthropic';
import type { AIMessage, ToolDefinition, ToolStreamEvent } from '@/lib/ai/types';

// Helpers
function sse(data: Record<string, unknown>): string {
  return 'data: ' + JSON.stringify(data);
}

function minSSE(extras?: string[]): string[] {
  return [
    sse({ type: 'message_start', message: { usage: { input_tokens: 100, cache_creation_input_tokens: 50, cache_read_input_tokens: 30 } } }),
    sse({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
    sse({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello' } }),
    sse({ type: 'content_block_stop', index: 0 }),
    ...(extras ?? []),
    sse({ type: 'message_delta', usage: { output_tokens: 10 }, delta: { stop_reason: 'end_turn' } }),
    sse({ type: 'message_stop' }),
  ];
}

const testTools: ToolDefinition[] = [
  { name: 'read_file', description: 'Read', input_schema: { type: 'object', properties: { p: { type: 'string' } } } },
  { name: 'write_file', description: 'Write', input_schema: { type: 'object', properties: { p: { type: 'string' } } } },
];

const testMsgs: AIMessage[] = [
  { role: 'system', content: 'You are helpful.', cacheControl: { type: 'ephemeral', ttl: '1h' } },
  { role: 'user', content: 'Hello', cacheControl: { type: 'ephemeral', ttl: '5m' } },
];

async function drain(stream: ReadableStream<ToolStreamEvent>): Promise<ToolStreamEvent[]> {
  const out: ToolStreamEvent[] = [];
  const r = stream.getReader();
  for (;;) {
    const { done, value } = await r.read();
    if (done) break;
    out.push(value);
  }
  return out;
}

// Tests
describe('Anthropic API Features', () => {
  let prov: ReturnType<typeof createAnthropicProvider>;

  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key-123');
    prov = createAnthropicProvider();
    lastBody = null;
    lastHeaders = null;
    sseLines = minSSE();
    mockFetch.mockClear();
  });

  afterEach(() => { vi.unstubAllEnvs(); });

  // 1. Cache TTL
  describe('Cache TTL propagation', () => {
    it('includes ttl in system message cache_control', async () => {
      const res = await prov.streamWithTools(testMsgs, testTools);
      await drain(res.stream);
      const sys = lastBody!.system as Array<Record<string, unknown>>;
      expect(sys[0].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
    });

    it('includes ttl in user message cache_control', async () => {
      const res = await prov.streamWithTools(testMsgs, testTools);
      await drain(res.stream);
      const messages = lastBody!.messages as Array<{ role: string; content: unknown }>;
      const user = messages.find((m) => m.role === 'user');
      const blocks = user!.content as Array<Record<string, unknown>>;
      expect(blocks[0].cache_control).toEqual({ type: 'ephemeral', ttl: '5m' });
    });

    it('adds cache_control to last tool definition only', async () => {
      const res = await prov.streamWithTools(testMsgs, testTools);
      await drain(res.stream);
      const t = lastBody!.tools as Array<Record<string, unknown>>;
      expect(t[0].cache_control).toBeUndefined();
      expect(t[1].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
    });
  });

  // 2. Thinking delta
  describe('Thinking delta forwarding', () => {
    it('emits thinking_delta events', async () => {
      sseLines = [
        sse({ type: 'message_start', message: { usage: { input_tokens: 100 } } }),
        sse({ type: 'content_block_start', index: 0, content_block: { type: 'thinking' } }),
        sse({ type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'Let me think' } }),
        sse({ type: 'content_block_stop', index: 0 }),
        sse({ type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } }),
        sse({ type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Answer' } }),
        sse({ type: 'content_block_stop', index: 1 }),
        sse({ type: 'message_delta', usage: { output_tokens: 10 }, delta: { stop_reason: 'end_turn' } }),
        sse({ type: 'message_stop' }),
      ];
      const res = await prov.streamWithTools(testMsgs, testTools);
      const events = await drain(res.stream);
      const thinking = events.filter((e) => e.type === 'thinking_delta');
      expect(thinking).toHaveLength(1);
      expect(thinking[0]).toEqual({ type: 'thinking_delta', text: 'Let me think' });
    });
  });

  // 3. Thinking blocks excluded from rawBlocks
  describe('Thinking blocks filtered from rawBlocks', () => {
    it('excludes thinking from getRawContentBlocks()', async () => {
      sseLines = [
        sse({ type: 'message_start', message: { usage: { input_tokens: 100 } } }),
        sse({ type: 'content_block_start', index: 0, content_block: { type: 'thinking' } }),
        sse({ type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'hmm' } }),
        sse({ type: 'content_block_stop', index: 0 }),
        sse({ type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } }),
        sse({ type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Result' } }),
        sse({ type: 'content_block_stop', index: 1 }),
        sse({ type: 'message_delta', usage: { output_tokens: 10 }, delta: { stop_reason: 'end_turn' } }),
        sse({ type: 'message_stop' }),
      ];
      const res = await prov.streamWithTools(testMsgs, testTools);
      await drain(res.stream);
      const raw = await res.getRawContentBlocks();
      const types = raw.map((b: unknown) => (b as { type: string }).type);
      expect(types).not.toContain('thinking');
      expect(types).toContain('text');
    });
  });

  // 4. Context management
  describe('Context management body param', () => {
    it('sends context_management when provided', async () => {
      const cm = {
        edits: [
          { type: 'clear_thinking_20251015' as const, keep: { type: 'thinking_turns' as const, value: 1 } },
          { type: 'clear_tool_uses_20250919' as const, trigger: { type: 'input_tokens' as const, value: 50000 } },
        ],
      };
      const res = await prov.streamWithTools(testMsgs, testTools, { contextManagement: cm });
      await drain(res.stream);
      expect(lastBody!.context_management).toEqual(cm);
    });

    it('includes context-management beta header', async () => {
      const res = await prov.streamWithTools(testMsgs, testTools);
      await drain(res.stream);
      expect(lastHeaders!['anthropic-beta']).toContain('context-management-2025-06-27');
    });

    it('omits context_management when not provided', async () => {
      const res = await prov.streamWithTools(testMsgs, testTools);
      await drain(res.stream);
      expect(lastBody!.context_management).toBeUndefined();
    });
  });

  // 5. Context edit parsing
  describe('Context edit parsing', () => {
    it('resolves getContextEdits() with applied_edits', async () => {
      const edits = [
        { type: 'clear_tool_uses_20250919', cleared_input_tokens: 12000, cleared_tool_uses: 5 },
        { type: 'clear_thinking_20251015', cleared_input_tokens: 3000, cleared_thinking_turns: 2 },
      ];
      sseLines = [
        sse({ type: 'message_start', message: { usage: { input_tokens: 100 } } }),
        sse({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
        sse({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'OK' } }),
        sse({ type: 'content_block_stop', index: 0 }),
        sse({ type: 'message_delta', usage: { output_tokens: 10 }, delta: { stop_reason: 'end_turn' }, context_management: { applied_edits: edits } }),
        sse({ type: 'message_stop' }),
      ];
      const res = await prov.streamWithTools(testMsgs, testTools);
      await drain(res.stream);
      const result = await res.getContextEdits!();
      expect(result).toHaveLength(2);
      expect(result[0].cleared_tool_uses).toBe(5);
      expect(result[1].cleared_thinking_turns).toBe(2);
    });

    it('resolves empty when no edits applied', async () => {
      const res = await prov.streamWithTools(testMsgs, testTools);
      await drain(res.stream);
      const result = await res.getContextEdits!();
      expect(result).toHaveLength(0);
    });
  });

  // 6. Stream error recovery
  describe('Stream error recovery', () => {
    it('resolves promises even on mid-stream error', async () => {
      mockFetch.mockImplementationOnce(async () => {
        const enc = new TextEncoder();
        const body = new ReadableStream({
          start(c) {
            c.enqueue(enc.encode(sse({ type: 'message_start', message: { usage: { input_tokens: 50 } } }) + '\n\n'));
            c.error(new Error('Network lost'));
          },
        });
        return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
      });

      const res = await prov.streamWithTools(testMsgs, testTools);
      const reader = res.stream.getReader();
      try { for (;;) { const { done } = await reader.read(); if (done) break; } } catch { /* expected */ }

      // Promises must resolve, not hang
      const usage = await Promise.race([res.getUsage(), new Promise<null>((r) => setTimeout(() => r(null), 3000))]);
      expect(usage).not.toBeNull();
      const edits = await Promise.race([res.getContextEdits!(), new Promise<null>((r) => setTimeout(() => r(null), 3000))]);
      expect(edits).not.toBeNull();
    });
  });

  // 7. Signature delta skip
  describe('Signature delta skip', () => {
    it('does not emit events for signature_delta', async () => {
      sseLines = [
        sse({ type: 'message_start', message: { usage: { input_tokens: 100 } } }),
        sse({ type: 'content_block_start', index: 0, content_block: { type: 'thinking' } }),
        sse({ type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'hmm' } }),
        sse({ type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'abc123' } }),
        sse({ type: 'content_block_stop', index: 0 }),
        sse({ type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } }),
        sse({ type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Final' } }),
        sse({ type: 'content_block_stop', index: 1 }),
        sse({ type: 'message_delta', usage: { output_tokens: 10 }, delta: { stop_reason: 'end_turn' } }),
        sse({ type: 'message_stop' }),
      ];
      const res = await prov.streamWithTools(testMsgs, testTools);
      const events = await drain(res.stream);
      const types = events.map((e) => e.type);
      expect(types).toContain('thinking_delta');
      expect(types).toContain('text_delta');
      expect(types).not.toContain('signature_delta');
      expect(types.filter((t) => t === 'tool_delta')).toHaveLength(0);
    });
  });
});
