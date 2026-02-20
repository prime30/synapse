/**
 * Comparative test: streamAgentLoop (new) vs executeSolo (legacy).
 * Same prompt through both pipelines. Verifies both succeed with code changes,
 * agent loop streams directly, and emits tool events.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setCacheAdapter, MemoryAdapter } from '@/lib/cache/cache-adapter';
import { createMockProvider } from '../setup/mock-ai-provider';
import type { FileContext } from '@/lib/types/agent';
import type {
  ToolStreamEvent,
  ToolStreamResult,
} from '@/lib/ai/types';
import type { AgentToolEvent } from '@/lib/agents/coordinator';

const mockProvider = createMockProvider({ name: 'anthropic' });
const MARKER = 'AGENT_LOOP_TEST';

const newContent =
  '{%' +
  ' comment ' +
  '%} ' +
  MARKER +
  ' {%' +
  ' endcomment ' +
  '%}\n<div class="product">\n  {{ product.title }}\n</div>';

const cannedPM = JSON.stringify({
  analysis: 'Added comment per request.',
  needsClarification: false,
  changes: [
    {
      fileId: 'file-snippet-test',
      fileName: 'snippets/test.liquid',
      originalContent:
        '<div class="product">\n  {{ product.title }}\n</div>',
      proposedContent: newContent,
      reasoning: 'Added comment.',
    },
  ],
  delegations: [],
  referencedFiles: ['snippets/test.liquid'],
});

function buildMockToolStream(): ToolStreamResult {
  const events: ToolStreamEvent[] = [
    { type: 'text_delta', text: 'Adding comment now.\n\n' },
    { type: 'tool_start', id: 'tool-1', name: 'propose_code_edit' },
    {
      type: 'tool_end',
      id: 'tool-1',
      name: 'propose_code_edit',
      input: {
        filePath: 'snippets/test.liquid',
        newContent,
        reasoning: 'Added comment.',
      },
    },
    { type: 'text_delta', text: '\nDone.' },
  ];
  const rawBlocks = [
    { type: 'text', text: 'Adding comment now.\n\n' },
    {
      type: 'tool_use',
      id: 'tool-1',
      name: 'propose_code_edit',
      input: {
        filePath: 'snippets/test.liquid',
        newContent,
        reasoning: 'Added comment.',
      },
    },
    { type: 'text', text: '\nDone.' },
  ];
  const stream = new ReadableStream<ToolStreamEvent>({
    start(c) {
      for (const e of events) c.enqueue(e);
      c.close();
    },
  });
  return {
    stream,
    getUsage: async () => ({ inputTokens: 500, outputTokens: 150 }),
    getStopReason: async () => 'end_turn' as const,
    getRawContentBlocks: async () => rawBlocks,
  };
}

/** When true, streamWithTools returns a stream that never emits. */
let simulateHangingStream = false;

function buildHangingStream(): ToolStreamResult {
  const stream = new ReadableStream<ToolStreamEvent>({
    start() {
      // intentionally empty -- never enqueue, never close
    },
  });
  return {
    stream,
    getUsage: async () => ({ inputTokens: 0, outputTokens: 0 }),
    getStopReason: async () => 'end_turn' as const,
    getRawContentBlocks: async () => [],
  };
}

function buildCompleteWithToolsResult() {
  return {
    content: 'I will add the comment now.',
    provider: 'anthropic',
    model: 'mock',
    inputTokens: 100,
    outputTokens: 50,
    stopReason: 'end_turn' as const,
    toolCalls: [
      {
        id: 'fallback-tool-1',
        name: 'propose_code_edit',
        input: {
          filePath: 'snippets/test.liquid',
          newContent,
          reasoning: 'Added comment via fallback.',
        },
      },
    ],
    __rawContentBlocks: [
      { type: 'text', text: 'I will add the comment now.' },
      {
        type: 'tool_use',
        id: 'fallback-tool-1',
        name: 'propose_code_edit',
        input: {
          filePath: 'snippets/test.liquid',
          newContent,
          reasoning: 'Added comment via fallback.',
        },
      },
    ],
  };
}

vi.mock('@/lib/ai/get-provider', () => ({
  getAIProvider: () => {
    const p = mockProvider.provider;
    const ext = p as unknown as Record<string, unknown>;
    ext.completeWithTools = async () => {
      if (simulateHangingStream) {
        return buildCompleteWithToolsResult();
      }
      return {
        content: cannedPM,
        provider: 'anthropic',
        model: 'mock',
        inputTokens: 100,
        outputTokens: 50,
        toolCalls: [],
      };
    };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ext.streamWithTools = async (..._args: unknown[]) => {
      if (simulateHangingStream) return buildHangingStream();
      return buildMockToolStream();
    };
    return p;
  },
}));

function testFiles(): FileContext[] {
  return [
    {
      fileId: 'file-snippet-test',
      fileName: 'test.liquid',
      path: 'snippets/test.liquid',
      fileType: 'liquid',
      content: '<div class="product">\n  {{ product.title }}\n</div>',
    },
  ];
}

const PROMPT =
  'Add a comment at the top of snippets/test.liquid that says ' +
  MARKER +
  '.';
const PID = '00000000-0000-0000-0000-000000000001';
const UID = 'test-user';

describe('Agent Loop vs Legacy Solo', () => {
  beforeEach(() => {
    setCacheAdapter(new MemoryAdapter());
    mockProvider.succeedWith(cannedPM);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('executeSolo completes with code changes', async () => {
    const { AgentCoordinator } = await import('@/lib/agents/coordinator');
    const coord = new AgentCoordinator();
    const result = await coord.executeSolo(
      'leg-' + Date.now(),
      PID,
      UID,
      PROMPT,
      testFiles(),
      [],
      {
        tier: 'SIMPLE',
        autoRoute: false,
        intentMode: 'code',
        onProgress: () => {},
      },
    );
    expect(result.success).toBe(true);
    expect(result.changes!.length).toBeGreaterThanOrEqual(1);
    const change = result.changes!.find(
      (x) => x.fileName === 'snippets/test.liquid',
    );
    expect(change).toBeDefined();
    expect(change!.proposedContent).toContain(MARKER);
    expect(result.directStreamed).toBeFalsy();
  });

  it('streamAgentLoop completes with streaming and tool events', async () => {
    const { AgentCoordinator } = await import('@/lib/agents/coordinator');
    const coord = new AgentCoordinator();
    const chunks: string[] = [];
    const toolEvts: AgentToolEvent[] = [];
    const result = await coord.streamAgentLoop(
      'loop-' + Date.now(),
      PID,
      UID,
      PROMPT,
      testFiles(),
      [],
      {
        intentMode: 'code',
        onProgress: () => {},
        onContentChunk: (ch: string) => chunks.push(ch),
        onToolEvent: (ev: AgentToolEvent) => toolEvts.push(ev),
      },
    );
    expect(result.success).toBe(true);
    expect(result.directStreamed).toBe(true);
    expect(result.changes!.length).toBeGreaterThanOrEqual(1);
    const change = result.changes!.find(
      (x) => x.fileName === 'snippets/test.liquid',
    );
    expect(change).toBeDefined();
    expect(change!.proposedContent).toContain(MARKER);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.join('')).toContain('comment');
    expect(
      toolEvts.filter((e) => e.type === 'tool_start').length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      toolEvts.find((e) => e.name === 'propose_code_edit'),
    ).toBeDefined();
  });

  it('both pipelines produce equivalent changes', async () => {
    const { AgentCoordinator } = await import('@/lib/agents/coordinator');

    const legCoord = new AgentCoordinator();
    const legResult = await legCoord.executeSolo(
      'cmp-l-' + Date.now(),
      PID,
      UID,
      PROMPT,
      testFiles(),
      [],
      {
        tier: 'SIMPLE',
        autoRoute: false,
        intentMode: 'code',
        onProgress: () => {},
      },
    );

    const loopCoord = new AgentCoordinator();
    const loopResult = await loopCoord.streamAgentLoop(
      'cmp-a-' + Date.now(),
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

    expect(legResult.success).toBe(true);
    expect(loopResult.success).toBe(true);

    const legChange = legResult.changes!.find(
      (x) => x.fileName === 'snippets/test.liquid',
    );
    const loopChange = loopResult.changes!.find(
      (x) => x.fileName === 'snippets/test.liquid',
    );
    expect(legChange).toBeDefined();
    expect(loopChange).toBeDefined();
    expect(legChange!.proposedContent).toContain(MARKER);
    expect(loopChange!.proposedContent).toContain(MARKER);

    expect(loopResult.directStreamed).toBe(true);
    expect(legResult.directStreamed).toBeFalsy();
  });
});

describe('Stream fallback: hanging stream', () => {
  beforeEach(() => {
    setCacheAdapter(new MemoryAdapter());
    mockProvider.succeedWith(cannedPM);
    simulateHangingStream = true;
    // Use a very short first-byte timeout so the test doesn't wait 30s
    process.env.STREAM_FIRST_BYTE_TIMEOUT_MS = '500';
  });
  afterEach(() => {
    simulateHangingStream = false;
    delete process.env.STREAM_FIRST_BYTE_TIMEOUT_MS;
    vi.restoreAllMocks();
  });

  it('falls back to completeWithTools when stream hangs', async () => {
    const { AgentCoordinator } = await import('@/lib/agents/coordinator');
    const coord = new AgentCoordinator();
    const chunks: string[] = [];
    const toolEvts: AgentToolEvent[] = [];
    const progressLabels: string[] = [];

    const result = await coord.streamAgentLoop(
      'hang-' + Date.now(),
      PID,
      UID,
      PROMPT,
      testFiles(),
      [],
      {
        intentMode: 'code',
        onProgress: (ev) => {
          if (ev.type === 'thinking') progressLabels.push(ev.label ?? '');
        },
        onContentChunk: (ch: string) => chunks.push(ch),
        onToolEvent: (ev: AgentToolEvent) => toolEvts.push(ev),
      },
    );

    // Should still succeed via fallback
    expect(result.success).toBe(true);
    expect(result.directStreamed).toBe(true);

    // Should have code changes from the fallback completeWithTools result
    expect(result.changes).toBeDefined();
    expect(result.changes!.length).toBeGreaterThanOrEqual(1);
    const change = result.changes!.find(
      (x) => x.fileName === 'snippets/test.liquid',
    );
    expect(change).toBeDefined();
    expect(change!.proposedContent).toContain(MARKER);

    // Content was delivered via synthetic streaming
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.join('')).toContain('comment');

    // Tool events were emitted from the fallback
    const toolCalls = toolEvts.filter((e) => e.type === 'tool_call');
    expect(toolCalls.length).toBeGreaterThanOrEqual(1);
    expect(toolCalls.find((e) => e.name === 'propose_code_edit')).toBeDefined();

    // Progress should mention batch mode fallback
    expect(progressLabels.some((l) => l.includes('batch mode') || l.includes('unavailable'))).toBe(true);
  }, 60_000);
});
