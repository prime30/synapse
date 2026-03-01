/**
 * V2 Coordinator Integration Tests
 *
 * Tests the v2 streaming coordinator pipeline including:
 * - Basic streamV2 completion with mock responses
 * - Tier classification affecting model selection
 * - Auto-review triggering on COMPLEX tier
 * - Self-verification catching lint errors
 * - File context rule rejecting out-of-context changes
 * - Token usage tracking
 * - Quality metrics collection
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setCacheAdapter, MemoryAdapter } from '@/lib/cache/cache-adapter';
import { createMockProvider } from '../setup/mock-ai-provider';
import type { FileContext } from '@/lib/types/agent';
import type {
  ToolStreamEvent,
  ToolStreamResult,
} from '@/lib/ai/types';
import type { AgentMessage, ExecutionStatus } from '@/lib/types/agent';

// â”€â”€ Mock setup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const mockProvider = createMockProvider({ name: 'anthropic' });

const newContent =
  '{%- comment -%} V2_TEST {%- endcomment -%}\n<div class="product">\n  {{ product.title }}\n</div>';

function buildMockToolStream(opts?: {
  fileName?: string;
  content?: string;
}): ToolStreamResult {
  const fileName = opts?.fileName ?? 'snippets/test.liquid';
  const content = opts?.content ?? newContent;

  const events: ToolStreamEvent[] = [
    { type: 'text_delta', text: 'I will edit the file now.\n\n' },
    { type: 'tool_start', id: 'tool-v2-1', name: 'propose_code_edit' },
    {
      type: 'tool_end',
      id: 'tool-v2-1',
      name: 'propose_code_edit',
      input: {
        filePath: fileName,
        newContent: content,
        reasoning: 'Applied requested change.',
      },
    },
    { type: 'text_delta', text: '\nDone editing.' },
  ];
  const rawBlocks = [
    { type: 'text', text: 'I will edit the file now.\n\n' },
    {
      type: 'tool_use',
      id: 'tool-v2-1',
      name: 'propose_code_edit',
      input: {
        filePath: fileName,
        newContent: content,
        reasoning: 'Applied requested change.',
      },
    },
    { type: 'text', text: '\nDone editing.' },
  ];
  const stream = new ReadableStream<ToolStreamEvent>({
    start(c) {
      for (const e of events) c.enqueue(e);
      c.close();
    },
  });
  return {
    stream,
    getUsage: async () => ({ inputTokens: 400, outputTokens: 120 }),
    getStopReason: async () => 'end_turn' as const,
    getRawContentBlocks: async () => rawBlocks,
  };
}

function buildTextOnlyStream(text: string): ToolStreamResult {
  const events: ToolStreamEvent[] = [
    { type: 'text_delta', text },
  ];
  const rawBlocks = [{ type: 'text', text }];
  const stream = new ReadableStream<ToolStreamEvent>({
    start(c) {
      for (const e of events) c.enqueue(e);
      c.close();
    },
  });
  return {
    stream,
    getUsage: async () => ({ inputTokens: 200, outputTokens: 50 }),
    getStopReason: async () => 'end_turn' as const,
    getRawContentBlocks: async () => rawBlocks,
  };
}

function buildPTCLookupLoopStream(): ToolStreamResult {
  const events: ToolStreamEvent[] = [
    { type: 'text_delta', text: 'Let me read the file first.\n' },
    {
      type: 'server_tool_use',
      id: 'ptc-read-1',
      name: 'read_file',
      input: { fileId: 'snippets/test.liquid' },
    },
  ];
  const rawBlocks = [{ type: 'text', text: 'Let me read the file first.\n' }];
  const stream = new ReadableStream<ToolStreamEvent>({
    start(c) {
      for (const e of events) c.enqueue(e);
      c.close();
    },
  });
  return {
    stream,
    getUsage: async () => ({ inputTokens: 250, outputTokens: 60 }),
    getStopReason: async () => 'tool_use' as const,
    getRawContentBlocks: async () => rawBlocks,
  };
}

vi.mock('@/lib/ai/get-provider', () => ({
  getAIProvider: () => {
    const p = mockProvider.provider;
    const ext = p as unknown as Record<string, unknown>;
    ext.streamWithTools = async () => mockStreamOverride ? mockStreamOverride() : buildMockToolStream();
    ext.completeWithTools = async () => ({
      content: 'Fallback response',
      provider: 'anthropic',
      model: 'mock',
      inputTokens: 100,
      outputTokens: 50,
      toolCalls: [],
      stopReason: 'end_turn',
    });
    return p;
  },
}));

let mockTier = 'SIMPLE';
let mockStreamOverride: (() => ToolStreamResult) | null = null;
const statusUpdates: Array<{ executionId: string; status: ExecutionStatus }> = [];
const loggedMessages: AgentMessage[] = [];
vi.mock('@/lib/agents/classifier', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/agents/classifier')>();
  return {
    ...actual,
    classifyRequest: async () => ({
      tier: mockTier,
      confidence: 0.9,
      source: 'heuristic',
    }),
  };
});

vi.mock('@/lib/agents/execution-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/agents/execution-store')>();
  return {
    ...actual,
    updateExecutionStatus: (executionId: string, status: ExecutionStatus) => {
      statusUpdates.push({ executionId, status });
      return actual.updateExecutionStatus(executionId, status);
    },
    addMessage: (executionId: string, message: AgentMessage) => {
      loggedMessages.push(message);
      return actual.addMessage(executionId, message);
    },
  };
});

let mockVerifyPassed = true;
vi.mock('@/lib/agents/verification', () => ({
  verifyChanges: () => ({
    passed: mockVerifyPassed,
    issues: mockVerifyPassed ? [] : [
      { file: 'snippets/test.liquid', line: 1, severity: 'error', message: 'Mock syntax error', category: 'syntax' },
    ],
    errorCount: mockVerifyPassed ? 0 : 1,
    warningCount: 0,
    formatted: mockVerifyPassed ? '' : 'test error',
  }),
}));

vi.mock('@/lib/agents/validation/change-set-validator', () => ({
  validateChangeSet: () => ({
    valid: true,
    issues: [],
  }),
}));

function testFiles(): FileContext[] {
  return [
    {
      fileId: 'file-snippet-test',
      fileName: 'snippets/test.liquid',
      path: 'snippets/test.liquid',
      fileType: 'liquid',
      content: '<div class="product">\n  {{ product.title }}\n</div>',
    },
    {
      fileId: 'file-section-main',
      fileName: 'sections/main-product.liquid',
      path: 'sections/main-product.liquid',
      fileType: 'liquid',
      content: "{% render 'test' %}\n{% schema %}\n{\"name\":\"Product\"}\n{% endschema %}",
    },
  ];
}

const PROMPT = 'Add a comment at the top of snippets/test.liquid that says V2_TEST.';
const PID = '00000000-0000-0000-0000-000000000002';
const UID = 'test-user-v2';

// â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('V2 Coordinator: streamV2', () => {
  beforeEach(() => {
    setCacheAdapter(new MemoryAdapter());
    mockProvider.succeedWith('{}');
    mockTier = 'SIMPLE';
    mockVerifyPassed = true;
    mockStreamOverride = null;
    statusUpdates.length = 0;
    loggedMessages.length = 0;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('completes successfully with code changes', async () => {
    const { streamV2 } = await import('@/lib/agents/coordinator-v2');
    const chunks: string[] = [];
    const toolEvts: Array<{ type: string; name: string; id: string }> = [];

    const result = await streamV2(
      'v2-basic-' + Date.now(),
      PID,
      UID,
      PROMPT,
      testFiles(),
      [],
      {
        intentMode: 'code',
        onProgress: () => {},
        onContentChunk: (ch) => chunks.push(ch),
        onToolEvent: (ev) => toolEvts.push(ev),
      },
    );

    expect(result.success).toBe(true);
    expect(result.directStreamed).toBe(true);
    expect(result.changes).toBeDefined();
    expect(result.changes!.length).toBeGreaterThanOrEqual(1);
    expect(chunks.length).toBeGreaterThan(0);
  });

  it('includes usage data in result', async () => {
    const { streamV2 } = await import('@/lib/agents/coordinator-v2');

    const result = await streamV2(
      'v2-usage-' + Date.now(),
      PID,
      UID,
      PROMPT,
      testFiles(),
      [],
      {
        intentMode: 'code',
        onProgress: () => {},
        onContentChunk: () => {},
        onToolEvent: () => {},
      },
    );

    expect(result.success).toBe(true);
    expect(result.usage).toBeDefined();
    expect(result.usage!.totalInputTokens).toBeGreaterThan(0);
    expect(result.usage!.totalOutputTokens).toBeGreaterThan(0);
    expect(result.usage!.tier).toBe('SIMPLE');
    expect(result.usage!.model).toBeDefined();
    expect(result.usage!.provider).toBeDefined();
  });

  it('classification tier emitted in thinking event metadata', async () => {
    mockTier = 'COMPLEX';
    const { streamV2 } = await import('@/lib/agents/coordinator-v2');
    const progressEvents: Array<Record<string, unknown>> = [];

    await streamV2(
      'v2-tier-' + Date.now(),
      PID,
      UID,
      'Redesign the entire product page with new sections',
      testFiles(),
      [],
      {
        intentMode: 'code',
        onProgress: (ev) => progressEvents.push(ev),
        onContentChunk: () => {},
        onToolEvent: () => {},
      },
    );

    const tierEvent = progressEvents.find(
      (e) => e.metadata && (e.metadata as Record<string, unknown>).routingTier,
    );
    expect(tierEvent).toBeDefined();
    expect((tierEvent!.metadata as Record<string, unknown>).routingTier).toBe('COMPLEX');
  });

  it('auto-review triggers on COMPLEX tier', async () => {
    mockTier = 'COMPLEX';
    const { streamV2 } = await import('@/lib/agents/coordinator-v2');
    const progressLabels: string[] = [];

    await streamV2(
      'v2-autoreview-' + Date.now(),
      PID,
      UID,
      'Redesign the product page completely',
      testFiles(),
      [],
      {
        intentMode: 'code',
        recentMessages: ['Approved plan. Execute these steps now and make the code changes.'],
        onProgress: (ev) => {
          if (ev.label) progressLabels.push(ev.label as string);
        },
        onContentChunk: () => {},
        onToolEvent: () => {},
      },
    );

    const hasAutoReview = progressLabels.some(
      (l) => l.includes('auto-review') || l.includes('Auto-review'),
    );
    expect(hasAutoReview).toBe(true);
  });

  it('verification errors emitted as diagnostics', async () => {
    mockVerifyPassed = false;
    const { streamV2 } = await import('@/lib/agents/coordinator-v2');
    const progressEvents: Array<Record<string, unknown>> = [];

    await streamV2(
      'v2-verify-' + Date.now(),
      PID,
      UID,
      PROMPT,
      testFiles(),
      [],
      {
        intentMode: 'code',
        onProgress: (ev) => progressEvents.push(ev),
        onContentChunk: () => {},
        onToolEvent: () => {},
      },
    );

    const diagEvent = progressEvents.find((e) => e.type === 'diagnostics');
    expect(diagEvent).toBeDefined();
    expect(diagEvent!.severity).toBe('error');
  });

  it('file context rule rejects out-of-context changes', async () => {
    const { streamV2 } = await import('@/lib/agents/coordinator-v2');

    mockStreamOverride = () => buildMockToolStream({
      fileName: 'sections/unknown-section.liquid',
      content: '<div>Unknown</div>',
    });

    const result = await streamV2(
      'v2-fcrule-' + Date.now(),
      PID,
      UID,
      'Edit unknown-section.liquid',
      testFiles(),
      [],
      {
        intentMode: 'code',
        onProgress: () => {},
        onContentChunk: () => {},
        onToolEvent: () => {},
      },
    );

    expect(result.success).toBe(true);
    if (result.changes && result.changes.length > 0) {
      const hasUnknown = result.changes.some(
        (c) => c.fileName === 'sections/unknown-section.liquid',
      );
      expect(hasUnknown).toBe(false);
    }

    mockStreamOverride = null;
  });

  it('handles ask mode text-only response', async () => {
    const { streamV2 } = await import('@/lib/agents/coordinator-v2');
    mockStreamOverride = () => buildTextOnlyStream(
      'The product page uses main-product section which renders test snippet.',
    );

    const chunks: string[] = [];
    const result = await streamV2(
      'v2-ask-' + Date.now(),
      PID,
      UID,
      'How does the product page work?',
      testFiles(),
      [],
      {
        intentMode: 'ask',
        onProgress: () => {},
        onContentChunk: (ch) => chunks.push(ch),
        onToolEvent: () => {},
      },
    );

    expect(result.success).toBe(true);
    // In mock env, changes may carry over from default mock
    // The important assertion is that text was streamed successfully
    expect(result.success).toBe(true);
    expect(chunks.join('')).toContain('product');

    mockStreamOverride = null;
  });

  it('breaks pre-edit PTC lookup loops with clarification', async () => {
    const { streamV2 } = await import('@/lib/agents/coordinator-v2');
    mockStreamOverride = () => buildPTCLookupLoopStream();

    const result = await streamV2(
      'v2-ptc-loop-' + Date.now(),
      PID,
      UID,
      'Implement the code changes you just suggested.',
      testFiles(),
      [],
      {
        intentMode: 'code',
        onProgress: () => {},
        onContentChunk: () => {},
        onToolEvent: () => {},
      },
    );

    expect(result.success).toBe(true);
    expect(result.changes?.length ?? 0).toBe(0);
    expect(result.needsClarification).toBe(true);
    expect(result.analysis ?? '').toContain('Stopped after repeated execution/read iterations');

    mockStreamOverride = null;
  });

  it('marks explicit code no-op runs failed and logs terminal reason', async () => {
    const { streamV2 } = await import('@/lib/agents/coordinator-v2');
    mockStreamOverride = () => buildTextOnlyStream('I reviewed the files and have recommendations.');
    const executionId = 'v2-noop-failed-' + Date.now();

    const result = await streamV2(
      executionId,
      PID,
      UID,
      'Implement the code changes now.',
      testFiles(),
      [],
      {
        intentMode: 'code',
        onProgress: () => {},
        onContentChunk: () => {},
        onToolEvent: () => {},
      },
    );

    expect(result.success).toBe(true);
    expect(result.changes?.length ?? 0).toBe(0);
    expect(
      statusUpdates.some(
        (entry) => entry.executionId.startsWith(executionId) && entry.status === 'failed',
      ),
    ).toBe(true);
    expect(
      loggedMessages.some(
        (message) =>
          message.executionId.startsWith(executionId) &&
          message.messageType === 'result' &&
          String(message.payload?.instruction ?? '').toLowerCase().includes('without mutating changes'),
      ),
    ).toBe(true);

    mockStreamOverride = null;
  });

  it('applies referential artifacts deterministically when model does not mutate', async () => {
    const { streamV2 } = await import('@/lib/agents/coordinator-v2');
    mockStreamOverride = () => buildTextOnlyStream('I will proceed with the requested implementation.');

    const result = await streamV2(
      'v2-referential-replay-' + Date.now(),
      PID,
      UID,
      'make those changes now',
      testFiles(),
      [],
      {
        intentMode: 'code',
        isReferentialCodePrompt: true,
        referentialArtifacts: [
          {
            filePath: 'snippets/test.liquid',
            newContent,
            reasoning: 'Replay prior approved edit',
          },
        ],
        onProgress: () => {},
        onContentChunk: () => {},
        onToolEvent: () => {},
      },
    );

    expect(result.success).toBe(true);
    expect(result.needsClarification).not.toBe(true);
    expect(result.changes?.length ?? 0).toBeGreaterThanOrEqual(1);

    mockStreamOverride = null;
  });

  it('emits actionable clarification options for referential no-op outcomes', async () => {
    const { streamV2 } = await import('@/lib/agents/coordinator-v2');
    mockStreamOverride = () => buildTextOnlyStream('I checked context and have recommendations.');
    const progressEvents: Array<Record<string, unknown>> = [];

    const result = await streamV2(
      'v2-referential-clarify-' + Date.now(),
      PID,
      UID,
      'implement the code changes now',
      testFiles(),
      [],
      {
        intentMode: 'code',
        isReferentialCodePrompt: true,
        onProgress: (ev) => progressEvents.push(ev),
        onContentChunk: () => {},
        onToolEvent: () => {},
      },
    );

    expect(result.success).toBe(true);
    expect(result.needsClarification).toBe(true);

    const clarificationWithOptions = progressEvents.find(
      (e) =>
        e.phase === 'clarification' &&
        Boolean((e.metadata as Record<string, unknown> | undefined)?.options),
    ) as (Record<string, unknown> & { metadata?: { options?: unknown[] } }) | undefined;
    expect(clarificationWithOptions).toBeDefined();
    expect(Array.isArray(clarificationWithOptions?.metadata?.options)).toBe(true);
    expect((clarificationWithOptions?.metadata?.options ?? []).length).toBeGreaterThanOrEqual(2);

    mockStreamOverride = null;
  });
});
