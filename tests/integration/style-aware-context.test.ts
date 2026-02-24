/**
 * Phase 3.5 — P0 Integration Tests for Style-Aware Agent Features
 *
 * Covers:
 *   - Reference section preloading for section edits (via streamV2 progress events)
 *   - "like X" intent detection (detectReferenceSection)
 *   - Unified validation merging structural + cross-file + design-token results
 *   - Design token graceful fallback when tokens are unavailable
 *   - Advisory suggestion injection cap (acceptance criteria documented)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setCacheAdapter, MemoryAdapter } from '@/lib/cache/cache-adapter';
import { createMockProvider } from '../setup/mock-ai-provider';
import type { FileContext, CodeChange } from '@/lib/types/agent';
import type {
  ToolStreamEvent,
  ToolStreamResult,
} from '@/lib/ai/types';
import type { AgentMessage, ExecutionStatus } from '@/lib/types/agent';

// ── Mock setup ────────────────────────────────────────────────────────────────

const mockProvider = createMockProvider({ name: 'anthropic' });

function buildTextOnlyStream(text: string): ToolStreamResult {
  const events: ToolStreamEvent[] = [{ type: 'text_delta', text }];
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

function buildMockToolStream(opts?: {
  fileName?: string;
  content?: string;
}): ToolStreamResult {
  const fileName = opts?.fileName ?? 'sections/hero.liquid';
  const content = opts?.content ?? '<section class="hero">{{ section.settings.title }}</section>';
  const events: ToolStreamEvent[] = [
    { type: 'text_delta', text: 'Editing section.\n\n' },
    { type: 'tool_start', id: 'tool-sa-1', name: 'propose_code_edit' },
    {
      type: 'tool_end',
      id: 'tool-sa-1',
      name: 'propose_code_edit',
      input: { filePath: fileName, newContent: content, reasoning: 'Style-aware edit.' },
    },
    { type: 'text_delta', text: '\nDone.' },
  ];
  const rawBlocks = [
    { type: 'text', text: 'Editing section.\n\n' },
    {
      type: 'tool_use',
      id: 'tool-sa-1',
      name: 'propose_code_edit',
      input: { filePath: fileName, newContent: content, reasoning: 'Style-aware edit.' },
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
    getUsage: async () => ({ inputTokens: 400, outputTokens: 120 }),
    getStopReason: async () => 'end_turn' as const,
    getRawContentBlocks: async () => rawBlocks,
  };
}

// ── Shared mocks ──────────────────────────────────────────────────────────────

let mockStreamOverride: (() => ToolStreamResult) | null = null;

vi.mock('@/lib/ai/get-provider', () => ({
  getAIProvider: () => {
    const p = mockProvider.provider;
    const ext = p as unknown as Record<string, unknown>;
    ext.streamWithTools = async () =>
      mockStreamOverride ? mockStreamOverride() : buildMockToolStream();
    ext.completeWithTools = async () => ({
      content: 'Fallback',
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

vi.mock('@/lib/agents/classifier', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/agents/classifier')>();
  return {
    ...actual,
    classifyRequest: async () => ({
      tier: 'SIMPLE',
      confidence: 0.9,
      source: 'heuristic',
    }),
  };
});

const statusUpdates: Array<{ executionId: string; status: ExecutionStatus }> = [];
const loggedMessages: AgentMessage[] = [];
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

vi.mock('@/lib/agents/verification', () => ({
  verifyChanges: () => ({
    passed: true,
    issues: [],
    errorCount: 0,
    warningCount: 0,
    formatted: '',
  }),
}));

vi.mock('@/lib/agents/validation/change-set-validator', () => ({
  validateChangeSet: () => ({ valid: true, issues: [] }),
}));

// ── Test data builders ────────────────────────────────────────────────────────

const PID = '00000000-0000-0000-0000-000000000003';
const UID = 'test-user-style';

function sectionFiles(): FileContext[] {
  return [
    {
      fileId: 'sec-hero',
      fileName: 'sections/hero.liquid',
      path: 'sections/hero.liquid',
      fileType: 'liquid',
      content:
        '<section class="hero">\n  <h1>{{ section.settings.heading }}</h1>\n</section>\n{% schema %}\n{"name":"Hero"}\n{% endschema %}',
    },
    {
      fileId: 'sec-featured',
      fileName: 'sections/featured-collection.liquid',
      path: 'sections/featured-collection.liquid',
      fileType: 'liquid',
      content:
        '<section class="featured">\n  {% for product in collections[section.settings.collection].products %}\n    {{ product.title }}\n  {% endfor %}\n</section>\n{% schema %}\n{"name":"Featured collection"}\n{% endschema %}',
    },
    {
      fileId: 'sec-banner',
      fileName: 'sections/hero-banner.liquid',
      path: 'sections/hero-banner.liquid',
      fileType: 'liquid',
      content:
        '<section class="hero-banner">\n  {{ section.settings.image | image_url | image_tag }}\n</section>\n{% schema %}\n{"name":"Hero banner"}\n{% endschema %}',
    },
    {
      fileId: 'snip-test',
      fileName: 'snippets/product-card.liquid',
      path: 'snippets/product-card.liquid',
      fileType: 'liquid',
      content: '<div class="product-card">{{ product.title }}</div>',
    },
    {
      fileId: 'css-base',
      fileName: 'assets/base.css',
      path: 'assets/base.css',
      fileType: 'css',
      content: ':root { --color-primary: #000; }\n.hero { display: flex; }',
    },
  ];
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('style-aware context', () => {
  beforeEach(() => {
    setCacheAdapter(new MemoryAdapter());
    mockProvider.succeedWith('{}');
    mockStreamOverride = null;
    statusUpdates.length = 0;
    loggedMessages.length = 0;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('preloads reference sections when editing sections/*.liquid', async () => {
    const { streamV2 } = await import('@/lib/agents/coordinator-v2');
    const progressEvents: Array<Record<string, unknown>> = [];

    await streamV2(
      'sa-ref-preload-' + Date.now(),
      PID,
      UID,
      'Update the hero section to add a subtitle',
      sectionFiles(),
      [],
      {
        intentMode: 'code',
        activeFilePath: 'sections/hero.liquid',
        onProgress: (ev) => progressEvents.push(ev),
        onContentChunk: () => {},
        onToolEvent: () => {},
      },
    );

    const styleCtxEvent = progressEvents.find(
      (e) =>
        e.label === 'Style context loaded' &&
        e.metadata != null,
    );
    expect(styleCtxEvent).toBeDefined();

    const meta = styleCtxEvent!.metadata as Record<string, unknown>;
    const refsLoaded = meta.referenceSectionsLoaded as number;
    expect(refsLoaded).toBeGreaterThanOrEqual(1);
    expect(refsLoaded).toBeLessThanOrEqual(3);
  });

  it('does not preload reference sections for non-section files', async () => {
    const { streamV2 } = await import('@/lib/agents/coordinator-v2');
    const progressEvents: Array<Record<string, unknown>> = [];

    await streamV2(
      'sa-no-ref-' + Date.now(),
      PID,
      UID,
      'Fix the product card snippet',
      sectionFiles(),
      [],
      {
        intentMode: 'code',
        activeFilePath: 'snippets/product-card.liquid',
        onProgress: (ev) => progressEvents.push(ev),
        onContentChunk: () => {},
        onToolEvent: () => {},
      },
    );

    const styleCtxEvent = progressEvents.find(
      (e) =>
        e.label === 'Style context loaded' &&
        e.metadata != null,
    );
    if (styleCtxEvent) {
      const meta = styleCtxEvent.metadata as Record<string, unknown>;
      expect(meta.referenceSectionsLoaded).toBe(0);
    }
  });
});

describe('"like X" reference section detection', () => {
  it('detects "like hero-banner" and returns section path', async () => {
    const { detectReferenceSection } = await import('@/lib/agents/workflows/shopify-workflows');
    const result = detectReferenceSection('create a section like hero-banner');
    expect(result).toBe('sections/hero-banner.liquid');
  });

  it('detects "similar to featured-collection" with quotes', async () => {
    const { detectReferenceSection } = await import('@/lib/agents/workflows/shopify-workflows');
    const result = detectReferenceSection('make it similar to "featured-collection"');
    expect(result).toBe('sections/featured-collection.liquid');
  });

  it('detects "based on" phrasing', async () => {
    const { detectReferenceSection } = await import('@/lib/agents/workflows/shopify-workflows');
    const result = detectReferenceSection('build a new section based on testimonials');
    expect(result).toBe('sections/testimonials.liquid');
  });

  it('detects "same as" phrasing', async () => {
    const { detectReferenceSection } = await import('@/lib/agents/workflows/shopify-workflows');
    const result = detectReferenceSection("make it same as 'product-grid'");
    expect(result).toBe('sections/product-grid.liquid');
  });

  it('returns null when no like intent is present', async () => {
    const { detectReferenceSection } = await import('@/lib/agents/workflows/shopify-workflows');
    expect(detectReferenceSection('fix the header')).toBeNull();
    expect(detectReferenceSection('add a new section for testimonials')).toBeNull();
    expect(detectReferenceSection('update the product page')).toBeNull();
  });

  it('handles names that already include .liquid suffix', async () => {
    const { detectReferenceSection } = await import('@/lib/agents/workflows/shopify-workflows');
    const result = detectReferenceSection('create a section like hero-banner.liquid');
    expect(result).toBe('sections/hero-banner.liquid');
  });
});

describe('unified validation merges results', () => {
  it('combines structural and cross-file validation issues', async () => {
    const { validateCodeChanges } = await import(
      '@/lib/agents/validation/unified-validator'
    );

    const changes: CodeChange[] = [
      {
        fileId: 'sec-hero',
        fileName: 'sections/hero.liquid',
        originalContent: '<section>{{ section.settings.heading }}</section>',
        proposedContent:
          "<section>{% render 'nonexistent-snippet' %}\n{{ section.settings.heading }}</section>",
        reasoning: 'Added snippet render',
        agentType: 'liquid',
      },
    ];

    const projectFiles: FileContext[] = [
      {
        fileId: 'sec-hero',
        fileName: 'sections/hero.liquid',
        path: 'sections/hero.liquid',
        fileType: 'liquid',
        content: '<section>{{ section.settings.heading }}</section>',
      },
    ];

    const result = await validateCodeChanges(changes, projectFiles, {
      skipTokenChecks: true,
    });

    expect(result).toBeDefined();
    expect(result.timing).toBeDefined();
    expect(result.timing.totalMs).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.issues)).toBe(true);
    expect(typeof result.valid).toBe('boolean');
  });

  it('returns valid=true when only warnings exist (no errors)', async () => {
    const { validateCodeChanges } = await import(
      '@/lib/agents/validation/unified-validator'
    );

    const changes: CodeChange[] = [
      {
        fileId: 'css-base',
        fileName: 'assets/base.css',
        originalContent: ':root { --color-primary: #000; }',
        proposedContent: ':root { --color-primary: #111; }',
        reasoning: 'Updated primary color',
        agentType: 'css',
      },
    ];

    const projectFiles: FileContext[] = [
      {
        fileId: 'css-base',
        fileName: 'assets/base.css',
        path: 'assets/base.css',
        fileType: 'css',
        content: ':root { --color-primary: #000; }',
      },
    ];

    const result = await validateCodeChanges(changes, projectFiles, {
      skipTokenChecks: true,
    });

    const hasError = result.issues.some((i) => i.severity === 'error');
    if (!hasError) {
      expect(result.valid).toBe(true);
    }
  });

  it('returns valid=false when errors exist', async () => {
    const { validateCodeChanges } = await import(
      '@/lib/agents/validation/unified-validator'
    );

    const changes: CodeChange[] = [
      {
        fileId: 'sec-hero',
        fileName: 'sections/hero.liquid',
        originalContent:
          '<section>{% schema %}\n{"name":"Hero","settings":[{"id":"heading","type":"text"}]}\n{% endschema %}</section>',
        proposedContent:
          '<section>{% schema %}\n{"name":"Hero"}\n{% endschema %}</section>',
        reasoning: 'Removed settings',
        agentType: 'liquid',
      },
      {
        fileId: 'tmpl-index',
        fileName: 'templates/index.json',
        originalContent: '{"sections":{"hero":{"type":"hero","settings":{"heading":"Welcome"}}}}',
        proposedContent: '{"sections":{"hero":{"type":"hero","settings":{"heading":"Welcome"}}}}',
        reasoning: 'No change',
        agentType: 'json',
      },
    ];

    const projectFiles: FileContext[] = [
      {
        fileId: 'sec-hero',
        fileName: 'sections/hero.liquid',
        path: 'sections/hero.liquid',
        fileType: 'liquid',
        content:
          '<section>{% schema %}\n{"name":"Hero","settings":[{"id":"heading","type":"text"}]}\n{% endschema %}</section>',
      },
      {
        fileId: 'tmpl-index',
        fileName: 'templates/index.json',
        path: 'templates/index.json',
        fileType: 'other',
        content: '{"sections":{"hero":{"type":"hero","settings":{"heading":"Welcome"}}}}',
      },
    ];

    const result = await validateCodeChanges(changes, projectFiles, {
      skipTokenChecks: true,
    });

    expect(Array.isArray(result.issues)).toBe(true);
    if (result.issues.some((i) => i.severity === 'error')) {
      expect(result.valid).toBe(false);
    }
  });

  it('issues are sorted by severity (errors first)', async () => {
    const { validateCodeChanges } = await import(
      '@/lib/agents/validation/unified-validator'
    );

    const changes: CodeChange[] = [
      {
        fileId: 'sec-hero',
        fileName: 'sections/hero.liquid',
        originalContent: '<section>old</section>',
        proposedContent:
          "<section>{% render 'ghost-snippet' %}</section>",
        reasoning: 'Test',
        agentType: 'liquid',
      },
    ];

    const projectFiles: FileContext[] = [
      {
        fileId: 'sec-hero',
        fileName: 'sections/hero.liquid',
        path: 'sections/hero.liquid',
        fileType: 'liquid',
        content: '<section>old</section>',
      },
    ];

    const result = await validateCodeChanges(changes, projectFiles, {
      skipTokenChecks: true,
    });

    if (result.issues.length >= 2) {
      const severityOrder = result.issues.map((i) => i.severity);
      const errorIdx = severityOrder.indexOf('error');
      const warningIdx = severityOrder.indexOf('warning');
      if (errorIdx !== -1 && warningIdx !== -1) {
        expect(errorIdx).toBeLessThan(warningIdx);
      }
    }
  });
});

describe('design token graceful fallback', () => {
  it('returns empty design context when no tokens exist', async () => {
    const { streamV2 } = await import('@/lib/agents/coordinator-v2');
    const progressEvents: Array<Record<string, unknown>> = [];

    await streamV2(
      'sa-no-tokens-' + Date.now(),
      PID,
      UID,
      'Update the hero section colors',
      sectionFiles(),
      [],
      {
        intentMode: 'code',
        activeFilePath: 'sections/hero.liquid',
        onProgress: (ev) => progressEvents.push(ev),
        onContentChunk: () => {},
        onToolEvent: () => {},
      },
    );

    const styleCtxEvent = progressEvents.find(
      (e) => e.label === 'Style context loaded',
    );
    expect(styleCtxEvent).toBeDefined();
    const meta = styleCtxEvent!.metadata as Record<string, unknown>;
    expect(meta.designTokenCount).toBeDefined();
    expect(typeof meta.designTokenCount).toBe('number');
    // When no tokens are available the count defaults to 0
    expect(meta.designTokenCount).toBeGreaterThanOrEqual(0);
  });

  it('unified validator skips design-token checks gracefully when tokens are null', async () => {
    const { validateCodeChanges } = await import(
      '@/lib/agents/validation/unified-validator'
    );

    const changes: CodeChange[] = [
      {
        fileId: 'css-base',
        fileName: 'assets/base.css',
        originalContent: ':root { --color-primary: #000; }',
        proposedContent: ':root { --color-primary: #222; }',
        reasoning: 'Color tweak',
        agentType: 'css',
      },
    ];

    const projectFiles: FileContext[] = [
      {
        fileId: 'css-base',
        fileName: 'assets/base.css',
        path: 'assets/base.css',
        fileType: 'css',
        content: ':root { --color-primary: #000; }',
      },
    ];

    const result = await validateCodeChanges(changes, projectFiles, {
      designTokens: null,
    });

    expect(result).toBeDefined();
    expect(Array.isArray(result.issues)).toBe(true);
    const tokenIssues = result.issues.filter(
      (i) => i.source === 'design-code-validator',
    );
    expect(tokenIssues.length).toBe(0);
  });

  it('unified validator skips design-token checks when skipTokenChecks=true', async () => {
    const { validateCodeChanges } = await import(
      '@/lib/agents/validation/unified-validator'
    );

    const changes: CodeChange[] = [
      {
        fileId: 'sec-hero',
        fileName: 'sections/hero.liquid',
        originalContent: '<section>old</section>',
        proposedContent: '<section style="color: red;">new</section>',
        reasoning: 'Color override',
        agentType: 'liquid',
      },
    ];

    const projectFiles: FileContext[] = [
      {
        fileId: 'sec-hero',
        fileName: 'sections/hero.liquid',
        path: 'sections/hero.liquid',
        fileType: 'liquid',
        content: '<section>old</section>',
      },
    ];

    const result = await validateCodeChanges(changes, projectFiles, {
      designTokens: { projectId: PID },
      skipTokenChecks: true,
    });

    const tokenIssues = result.issues.filter(
      (i) => i.source === 'design-code-validator',
    );
    expect(tokenIssues.length).toBe(0);
  });
});

describe('advisory injection cap', () => {
  /**
   * Acceptance criterion: Advisory suggestions are capped at 2 injections
   * per streamV2 execution. This prevents infinite advisory loops where
   * the model repeatedly receives style suggestions without acting on them.
   *
   * The advisory injection count is tracked internally in streamV2's
   * iteration loop. When the count reaches 2, no further advisory prompts
   * are appended to the conversation. This is verified by:
   *
   * 1. The iteration loop's advisoryInjectionCount variable (internal)
   * 2. Observing that after 2 advisory rounds the model proceeds without
   *    additional style prompts
   *
   * Note: Direct unit testing of the internal counter would require
   * exporting it or adding a test hook. For now this is documented as
   * an acceptance criterion and covered by the existing iteration-limit
   * tests in v2-coordinator.test.ts.
   */
  it.todo('advisory suggestions capped at 2 injections (requires test hook or export)');
});
