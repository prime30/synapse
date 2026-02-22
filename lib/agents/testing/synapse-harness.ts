import { AgentCoordinator } from '@/lib/agents/coordinator';
import { streamV2 } from '@/lib/agents/coordinator-v2';
import type { AgentResult, FileContext } from '@/lib/types/agent';

type HarnessMode = 'v1' | 'v2';
type IntentMode = 'ask' | 'code' | 'plan' | 'debug';

export interface HarnessRunInput {
  mode: HarnessMode;
  prompt: string;
  files: FileContext[];
  intentMode?: IntentMode;
  recentMessages?: string[];
  projectId?: string;
  userId?: string;
}

export interface HarnessMetrics {
  elapsedMs: number;
  progressCount: number;
  toolStartCount: number;
  toolCallCount: number;
  lookupToolCalls: number;
  mutatingToolCalls: number;
  toolsUsed: string[];
}

export interface HarnessChecks {
  completionFormatPresent: boolean | null;
  planFirstEnforcedWhenExpected: boolean | null;
  verificationEvidencePresent: boolean | null;
  reviewStructuredPresent: boolean | null;
  noOpCodeCompletion: boolean | null;
}

export interface HarnessRunOutput {
  result: AgentResult;
  metrics: HarnessMetrics;
  checks: HarnessChecks;
}

const LOOKUP_TOOLS = new Set([
  'read_file',
  'search_files',
  'grep_content',
  'glob_files',
  'semantic_search',
  'list_files',
  'get_dependency_graph',
]);

const MUTATING_TOOLS = new Set([
  'propose_code_edit',
  'search_replace',
  'create_file',
  'write_file',
  'delete_file',
  'rename_file',
  'run_specialist',
]);

const NON_TRIVIAL_HINT_RE =
  /\b(multi[- ]file|across .*files|entire theme|architecture|refactor|migration|system[- ]wide|shopify theme)\b/i;
const PLAN_APPROVAL_RE =
  /\b(approved plan|approve(?:d)? the plan|execute (?:these|the) .*steps|implement (?:the|this) plan|proceed with (?:the )?plan)\b/i;

function expectsPlanFirst(input: {
  intentMode: IntentMode;
  prompt: string;
  recentMessages?: string[];
}): boolean {
  if (input.intentMode !== 'code') return false;
  if (!NON_TRIVIAL_HINT_RE.test(input.prompt)) return false;
  const haystack = [input.prompt, ...(input.recentMessages ?? [])].join('\n');
  return !PLAN_APPROVAL_RE.test(haystack);
}

function hasCompletionFormat(text: string): boolean {
  return (
    text.includes("### What I've changed") &&
    text.includes('### Why this helps') &&
    text.includes('### Validation confirmation')
  );
}

export async function runSynapseHarness(input: HarnessRunInput): Promise<HarnessRunOutput> {
  const mode: HarnessMode = input.mode;
  const intentMode: IntentMode = input.intentMode ?? 'code';
  const projectId = input.projectId ?? '00000000-0000-0000-0000-00000000a001';
  const userId = input.userId ?? 'harness-user';
  const executionId = `harness-${mode}-${Date.now()}`;

  const progressEvents: Array<{ type?: string; label?: string }> = [];
  const toolEvents: Array<{ type: string; name: string; id?: string }> = [];
  const chunks: string[] = [];
  const t0 = Date.now();

  const baseOptions = {
    intentMode,
    recentMessages: input.recentMessages,
    onProgress: (ev: { type?: string; label?: string }) => progressEvents.push(ev),
    onContentChunk: (chunk: string) => chunks.push(chunk),
    onToolEvent: (ev: { type: string; name: string; id?: string }) => toolEvents.push(ev),
  };

  let result: AgentResult;
  if (mode === 'v2') {
    result = await streamV2(
      executionId,
      projectId,
      userId,
      input.prompt,
      input.files,
      [],
      baseOptions,
    );
  } else {
    const coordinator = new AgentCoordinator();
    result = await coordinator.streamAgentLoop(
      executionId,
      projectId,
      userId,
      input.prompt,
      input.files,
      [],
      baseOptions,
    );
  }

  const elapsedMs = Date.now() - t0;
  const analysisText = [result.analysis ?? '', chunks.join('')].join('\n');
  const calls = toolEvents.filter(e => e.type === 'tool_call');
  const toolsUsed = [...new Set(calls.map(c => c.name))];
  const lookupToolCalls = calls.filter(c => LOOKUP_TOOLS.has(c.name)).length;
  const mutatingToolCalls = calls.filter(c => MUTATING_TOOLS.has(c.name)).length;
  const expectedPlanFirst = expectsPlanFirst({
    intentMode,
    prompt: input.prompt,
    recentMessages: input.recentMessages,
  });
  const completedRun = result.success && !result.needsClarification;
  const changedRun = Boolean(result.changes && result.changes.length > 0);

  const checks: HarnessChecks = {
    completionFormatPresent: completedRun ? hasCompletionFormat(analysisText) : null,
    planFirstEnforcedWhenExpected: expectedPlanFirst
      ? Boolean(result.needsClarification) &&
        /Plan-first policy requires plan approval/i.test(result.analysis ?? '')
      : null,
    verificationEvidencePresent: changedRun
      ? /Verification evidence:/i.test(result.analysis ?? '') || Boolean(result.reviewResult)
      : null,
    reviewStructuredPresent: changedRun ? Boolean(result.reviewResult) : null,
    noOpCodeCompletion:
      intentMode === 'code'
        ? Boolean(result.success) &&
          !Boolean(result.needsClarification) &&
          (!result.changes || result.changes.length === 0)
        : null,
  };

  return {
    result,
    metrics: {
      elapsedMs,
      progressCount: progressEvents.length,
      toolStartCount: toolEvents.filter(e => e.type === 'tool_start').length,
      toolCallCount: calls.length,
      lookupToolCalls,
      mutatingToolCalls,
      toolsUsed,
    },
    checks,
  };
}

export function createHarnessFixtureFiles(): FileContext[] {
  return [
    {
      fileId: 'f-layout',
      fileName: 'layout/theme.liquid',
      path: 'layout/theme.liquid',
      fileType: 'liquid',
      content:
        '<!doctype html>\n<html><head>{{ content_for_header }}</head><body>{% section "main-product" %}{{ content_for_layout }}</body></html>',
    },
    {
      fileId: 'f-template',
      fileName: 'templates/product.json',
      path: 'templates/product.json',
      fileType: 'other' as const,
      content:
        '{ "sections": { "main": { "type": "main-product", "settings": {} } }, "order": ["main"] }',
    },
    {
      fileId: 'f-section',
      fileName: 'sections/main-product.liquid',
      path: 'sections/main-product.liquid',
      fileType: 'liquid',
      content:
        '<section class="product-main">{% render "product-card", product: product %}</section>\n{% schema %}\n{"name":"Main product","settings":[]}\n{% endschema %}',
    },
    {
      fileId: 'f-snippet',
      fileName: 'snippets/product-card.liquid',
      path: 'snippets/product-card.liquid',
      fileType: 'liquid',
      content:
        '<article class="product-card"><h2>{{ product.title | escape }}</h2><p>{{ product.price | money }}</p></article>',
    },
    {
      fileId: 'f-css',
      fileName: 'assets/theme.css',
      path: 'assets/theme.css',
      fileType: 'css',
      content:
        '.product-main { padding: 24px; }\n.product-card { border-radius: 8px; border: 1px solid #ddd; }',
    },
  ];
}
