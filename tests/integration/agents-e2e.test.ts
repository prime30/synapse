/**
 * Full E2E test for Synapse agents pipeline.
 * Proves that when the model returns valid output, the coordinator completes
 * a task: success and at least one code change. Uses mocked AI provider.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setCacheAdapter, MemoryAdapter } from '@/lib/cache/cache-adapter';
import { createMockProvider } from '../setup/mock-ai-provider';
import type { FileContext } from '@/lib/types/agent';

const mockProvider = createMockProvider({ name: 'anthropic' });

vi.mock('@/lib/ai/get-provider', () => ({
  getAIProvider: () => mockProvider.provider,
}));

const TASK_MARKER = 'E2E_TASK_ACCOMPLISHED';

const cannedPMResponse = JSON.stringify({
  analysis: 'Added the requested comment for E2E verification.',
  needsClarification: false,
  changes: [
    {
      fileId: 'file-snippet-test',
      fileName: 'snippets/test.liquid',
      originalContent: '<div class="product">\n  {{ product.title }}\n</div>',
      proposedContent: '{% comment %} ' + TASK_MARKER + ' {% endcomment %}\n<div class="product">\n  {{ product.title }}\n</div>',
      reasoning: 'Added top-of-file comment for E2E test.',
    },
  ],
  delegations: [],
  referencedFiles: ['snippets/test.liquid'],
});

function minimalFileContexts(): FileContext[] {
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

describe('Agents E2E: task accomplishment', () => {
  beforeEach(() => {
    setCacheAdapter(new MemoryAdapter());
    mockProvider.succeedWith(cannedPMResponse);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('solo pipeline completes and returns success with code changes', async () => {
    const { AgentCoordinator } = await import('@/lib/agents/coordinator');
    const coordinator = new AgentCoordinator();
    const executionId = 'e2e-exec-' + Date.now();
    const projectId = '00000000-0000-0000-0000-000000000001';
    const userId = 'e2e-user';
    const userRequest = 'Add a comment at the top of snippets/test.liquid that says E2E_TASK_ACCOMPLISHED.';
    const files = minimalFileContexts();
    const progressEvents: Array<{ phase: string; label: string }> = [];

    const result = await coordinator.executeSolo(
      executionId,
      projectId,
      userId,
      userRequest,
      files,
      [],
      {
        tier: 'SIMPLE',
        autoRoute: false,
        onProgress: (ev) => {
          if (ev.type === 'thinking') progressEvents.push({ phase: ev.phase ?? '', label: ev.label ?? '' });
        },
      }
    );

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.changes).toBeDefined();
    expect(Array.isArray(result.changes)).toBe(true);
    expect(result.changes!.length).toBeGreaterThanOrEqual(1);

    const change = result.changes!.find((c) => c.fileName === 'snippets/test.liquid');
    expect(change).toBeDefined();
    expect(change!.proposedContent).toContain(TASK_MARKER);
    expect(change!.agentType).toBe('project_manager');
  });

  it('progress events are emitted during solo run', async () => {
    const { AgentCoordinator } = await import('@/lib/agents/coordinator');
    const coordinator = new AgentCoordinator();
    const executionId = 'e2e-exec-progress-' + Date.now();
    const projectId = '00000000-0000-0000-0000-000000000002';
    const userId = 'e2e-user';
    const userRequest = 'Add a comment at the top of snippets/test.liquid.';
    const progressEvents: Array<{ phase: string; label: string }> = [];

    await coordinator.executeSolo(
      executionId,
      projectId,
      userId,
      userRequest,
      minimalFileContexts(),
      [],
      {
        tier: 'SIMPLE',
        autoRoute: false,
        onProgress: (ev) => {
          if (ev.type === 'thinking') progressEvents.push({ phase: ev.phase ?? '', label: ev.label ?? '' });
        },
      }
    );

    expect(progressEvents.length).toBeGreaterThanOrEqual(1);
    const hasAnalyzing = progressEvents.some(
      (e) =>
        e.phase === 'analyzing' &&
        (e.label.includes('Solo mode') || e.label.includes('Quick edit') || e.label.includes('Single agent'))
    );
    expect(hasAnalyzing).toBe(true);
  });
});
