/**
 * V2 Live Benchmark: Per-Tier Scenarios
 *
 * Each scenario is designed to classify into a specific routing tier.
 * Synapse uses production tier routing (no forced model bypass).
 * Cursor/Baseline use the SAME model Synapse resolves for that tier,
 * giving a fair apples-to-apples comparison.
 *
 * Each (scenario, contender) is run RUNS_PER_PROMPT times and metrics are
 * averaged so the marketing benchmarks page reflects statistical averages.
 *
 * Cursor contender:
 * - Default: "Cursor simulation" — same Anthropic API with generic assistant prompt (apples-to-apples model cost).
 * - Production: Set CURSOR_PRODUCTION=1 and CURSOR_API_KEY (from Cursor Dashboard → Integrations). Uses Cursor
 *   Headless CLI (`agent -p "..."`) so the benchmark runs real Cursor agent and records production values.
 *
 * Cursor-only merge (after a full run failed on Cursor): Set BENCHMARK_CURSOR_ONLY=1 with RUN_LIVE_AGENT_TESTS=true
 * and CURSOR_PRODUCTION=1. Runs only the Cursor contender per scenario and merges into the latest v2-bench-*.json,
 * then updates lib/benchmarks/latest-results.json. Synapse and Baseline are never run in this mode—they only
 * appear on the benchmarks page if they were already in the loaded file (from a previous "All tiers × contenders" run).
 *
 * To get Synapse + Baseline + Cursor for all scenarios on the benchmarks page: run the full benchmark once
 * (do not set BENCHMARK_CURSOR_ONLY, set RUN_LIVE_AGENT_TESTS=true and ANTHROPIC_API_KEY).
 *
 * Recommended: run from Cursor's terminal with WSL via scripts/run-benchmark-wsl.sh for reliable streaming and env.
 * Set RUN_LIVE_AGENT_TESTS=true and ANTHROPIC_API_KEY (or for Cursor-only: CURSOR_API_KEY) in .env.local to run.
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { describe, it, expect, beforeAll, vi } from 'vitest';

const projectRoot = process.cwd();
dotenv.config({ path: path.join(projectRoot, '.env.local') });
// WSL often invokes Windows npm, so script env vars don't reach Node. Load .env.benchmark if the script wrote it.
const benchEnvPath = path.join(projectRoot, '.env.benchmark');
if (fs.existsSync(benchEnvPath)) {
  dotenv.config({ path: benchEnvPath, override: true });
}

process.env.ENABLE_PROMPT_CACHING = 'true';
process.env.PROMPT_CACHE_TTL = '1h';
process.env.ENABLE_ADAPTIVE_THINKING = 'true';
if (!process.env.ENABLE_CONTEXT_EDITING) {
  process.env.ENABLE_CONTEXT_EDITING = 'false';
}

vi.mock('@/lib/design-tokens/agent-integration', () => ({
  DesignSystemContextProvider: class {
    async getDesignContext() {
      return '';
    }
  },
}));

import { setCacheAdapter, MemoryAdapter } from '@/lib/cache/cache-adapter';
import type { FileContext } from '@/lib/types/agent';
import { resolveModel, MODELS } from '@/lib/agents/model-router';
import type { AIAction } from '@/lib/agents/model-router';

/** Cursor-only mode: run only Cursor contender and merge; requires CURSOR_API_KEY, not ANTHROPIC. */
const cursorOnlyMerge =
  process.env.BENCHMARK_CURSOR_ONLY === '1' || process.env.BENCHMARK_CURSOR_ONLY === 'true';

const runLive =
  process.env.RUN_LIVE_AGENT_TESTS === 'true' &&
  (!!process.env.ANTHROPIC_API_KEY ||
    (cursorOnlyMerge && !!process.env.CURSOR_API_KEY));

/** When true, "cursor" contender uses Cursor Headless CLI (production) instead of API simulation. Requires CURSOR_API_KEY. */
const useCursorProduction =
  process.env.CURSOR_PRODUCTION === '1' || process.env.CURSOR_PRODUCTION === 'true';

// Log at load time so we see env even when Vitest skips the whole describe (beforeAll never runs).
console.log(
  '[bench] runLive=%s cursorOnlyMerge=%s useCursorProduction=%s | RUN_LIVE_AGENT_TESTS=%s BENCHMARK_CURSOR_ONLY=%s CURSOR_PRODUCTION=%s CURSOR_API_KEY=%s',
  runLive,
  cursorOnlyMerge,
  useCursorProduction,
  process.env.RUN_LIVE_AGENT_TESTS,
  process.env.BENCHMARK_CURSOR_ONLY,
  process.env.CURSOR_PRODUCTION,
  process.env.CURSOR_API_KEY ? 'set' : 'missing'
);

/** Number of runs per (scenario, contender) to average. Must match marketing copy (e.g. "3 runs averaged"). */
const RUNS_PER_PROMPT = Math.max(1, parseInt(process.env.BENCHMARK_RUNS_PER_PROMPT ?? '3', 10));
const ENFORCE_PLAN_APPROVE_CODE_FLOW = process.env.BENCHMARK_PLAN_APPROVE_CODE_FLOW !== 'false';

// ── Pricing ────────────────────────────────────────────────────────────────

const PRICING: Record<string, { i: number; o: number; cr: number; cw: number }> = {
  'claude-sonnet-4-6': { i: 3.0, o: 15.0, cr: 0.3, cw: 3.75 },
  'claude-opus-4-6': { i: 15.0, o: 75.0, cr: 1.5, cw: 18.75 },
  'claude-haiku-4-5-20251001': { i: 0.8, o: 4.0, cr: 0.08, cw: 1.0 },
};

function calcCost(model: string, inp: number, out: number, cr: number = 0, cw: number = 0): number {
  const p = PRICING[model] ?? { i: 3.0, o: 15.0, cr: 0.3, cw: 3.75 };
  return (inp * p.i + out * p.o + cr * p.cr + cw * p.cw) / 1_000_000;
}

function fmtCost(usd: number): string {
  return usd < 0.01 ? (usd * 1000).toFixed(2) + 'm' : '$' + usd.toFixed(4);
}

function fmtMs(ms: number): string {
  return ms >= 1000 ? (ms / 1000).toFixed(1) + 's' : ms + 'ms';
}

// ── File Loading ───────────────────────────────────────────────────────────

function loadThemeFile(rel: string): FileContext | null {
  const full = path.join(projectRoot, 'theme-workspace', rel);
  try {
    const content = fs.readFileSync(full, 'utf-8');
    const ext = path.extname(rel).slice(1);
    return {
      fileId: 'file-' + rel.replace(/[/\\]/g, '-'),
      fileName: path.basename(rel),
      path: rel,
      fileType: (ext || 'liquid') as FileContext['fileType'],
      content,
    };
  } catch {
    return null;
  }
}

function loadFiles(paths: string[]): FileContext[] {
  return paths.map(loadThemeFile).filter((f): f is FileContext => f !== null);
}

// ── Tier → Model resolution ────────────────────────────────────────────────

type RoutingTier = 'TRIVIAL' | 'SIMPLE' | 'COMPLEX' | 'ARCHITECTURAL';

function tierModel(tier: RoutingTier, intentMode: 'ask' | 'code' | 'debug'): string {
  const action: AIAction = intentMode === 'ask' ? 'ask' : 'generate';
  return resolveModel({ action, agentRole: 'project_manager', tier });
}

// ── Types ──────────────────────────────────────────────────────────────────

interface Scenario {
  key: string;
  name: string;
  intentMode: 'ask' | 'code' | 'debug';
  expectedTier: RoutingTier;
  prompt: string;
  files: string[];
  recentMessages?: string[];
  validate: (r: SResult) => void;
}

function shouldUsePlanApproveCodeFlow(sc: Scenario): boolean {
  return (
    ENFORCE_PLAN_APPROVE_CODE_FLOW &&
    sc.intentMode === 'code' &&
    (sc.expectedTier === 'COMPLEX' || sc.expectedTier === 'ARCHITECTURAL')
  );
}

interface SResult {
  success: boolean;
  responseText: string;
  totalTimeMs: number;
  firstChunkMs: number;
  model: string;
  tier: string;
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheWrite: number;
  costUSD: number;
  toolCalls: number;
  toolsUsed: string[];
  changes: number;
  filesCreated: number;
  thinkingN: number;
  features: string[];
  reviewTimeMs?: number;
  thinkingTimeMs?: number;
  streamFallbackMs?: number;
  /** Min/max across runs (only set when RUNS_PER_PROMPT > 1). Used for bar range dots. */
  totalTimeMsLow?: number;
  totalTimeMsHigh?: number;
  firstChunkMsLow?: number;
  firstChunkMsHigh?: number;
  costUSDLow?: number;
  costUSDHigh?: number;
}

interface Contender {
  key: string;
  name: string;
  runner: 'v2' | 'baseline' | 'cursor';
  model: string;
  features: string[];
}

// ── Scenarios (one per tier) ──────────────────────────────────────────────

const SCENARIOS: Scenario[] = [
  {
    key: 'trivial-color',
    name: 'Trivial: Change background color',
    intentMode: 'code',
    expectedTier: 'TRIVIAL',
    prompt:
      'Change the announcement bar background color to #1a1a2e and the text color to white.',
    files: ['sections/announcement-bar.liquid'],
    validate: (r) => {
      expect(r.success).toBe(true);
      expect(r.responseText.length).toBeGreaterThan(20);
    },
  },
  {
    key: 'simple-ask',
    name: 'Simple: Accessibility audit',
    intentMode: 'ask',
    expectedTier: 'SIMPLE',
    prompt:
      'What accessibility issues exist in the product-thumbnail.liquid snippet? Give specific WCAG violations and fixes.',
    files: ['snippets/product-thumbnail.liquid', 'snippets/product-img.liquid'],
    validate: (r) => {
      expect(r.success).toBe(true);
      expect(r.responseText.length).toBeGreaterThan(100);
      expect(r.responseText.toLowerCase()).toMatch(/accessib|a11y|alt|aria|wcag/);
    },
  },
  {
    key: 'complex-section',
    name: 'Complex: Build announcement bar section',
    intentMode: 'code',
    expectedTier: 'COMPLEX',
    prompt:
      'Add a new section for an announcement bar with a background color picker, text content, a link URL, and a dismissible toggle. Follow existing section patterns in the theme.',
    files: ['sections/announcement-bar.liquid', 'layout/theme.liquid'],
    validate: (r) => {
      expect(r.success).toBe(true);
      expect(r.responseText.length).toBeGreaterThan(100);
    },
  },
  {
    key: 'arch-rebuild',
    name: 'Architectural: Rebuild product template',
    intentMode: 'code',
    expectedTier: 'ARCHITECTURAL',
    prompt:
      'Rebuild the entire product page template to use a modular section-based architecture with separate blocks for gallery, description, variants, and add-to-cart. Restructure the existing monolithic template.',
    files: ['templates/product.json', 'sections/main-product.liquid'],
    validate: (r) => {
      expect(r.success).toBe(true);
      expect(r.responseText.length + r.changes * 50 + r.toolCalls * 20).toBeGreaterThan(50);
    },
  },
  {
    key: 'compound-quickview',
    name: 'Compound: Multi-Turn Quick-View Workflow',
    intentMode: 'code',
    expectedTier: 'COMPLEX',
    prompt:
      'Now make the modal responsive for mobile with a slide-up animation, and add a loading spinner while product data loads.',
    files: ['sections/main-collection.liquid', 'snippets/product-thumbnail.liquid', 'layout/theme.liquid'],
    recentMessages: [
      'Add a product quick-view modal that opens when clicking "Quick View" on collection page product cards. Include product image, title, price, and an add-to-cart button.',
      'Done. I created a quick-view modal snippet at snippets/quick-view-modal.liquid and added a trigger button to the product thumbnail snippet. The modal shows product image, title, price, and add-to-cart. It uses the existing theme modal pattern with a backdrop overlay.',
    ],
    validate: (r) => {
      expect(r.success).toBe(true);
      expect(r.responseText.length + r.changes * 50 + r.toolCalls * 20).toBeGreaterThan(30);
    },
  },
  {
    key: 'crossfile-consistency',
    name: 'Cross-File: Sale Badge Consistency',
    intentMode: 'code',
    expectedTier: 'COMPLEX',
    prompt:
      'Add a sale badge to product cards that shows the discount percentage. Make sure it appears consistently across collection pages, search results, and featured product sections. Follow existing badge patterns in the theme.',
    files: [
      'snippets/product-thumbnail.liquid',
      'sections/main-collection.liquid',
      'sections/featured-product.liquid',
      'sections/main-search.liquid',
    ],
    validate: (r) => {
      expect(r.success).toBe(true);
      expect(r.responseText.length + r.changes * 50 + r.toolCalls * 20).toBeGreaterThan(30);
    },
  },
];

// ── Build contenders per scenario ──────────────────────────────────────────

const V2_FEATURES = [
  'prompt-caching',
  'adaptive-thinking',
  'context-editing',
  'auto-review',
  'tier-routing',
  'fast-edit-path',
  'hallucination-reduction',
];

const MODEL_LABELS: Record<string, string> = {
  [MODELS.CLAUDE_HAIKU]: 'Haiku 4.5',
  [MODELS.CLAUDE_SONNET]: 'Sonnet 4.6',
  [MODELS.CLAUDE_OPUS]: 'Opus 4.6',
};

function contendersForScenario(sc: Scenario): Contender[] {
  const model = tierModel(sc.expectedTier, sc.intentMode);
  const label = MODEL_LABELS[model] ?? model;
  const cursorLabel = useCursorProduction ? `Cursor production (${label})` : `Cursor (${label})`;
  return [
    { key: 'synapse', name: `Synapse (${label})`, runner: 'v2', model, features: V2_FEATURES },
    { key: 'baseline', name: `Baseline (${label})`, runner: 'baseline', model, features: [] },
    { key: 'cursor', name: cursorLabel, runner: 'cursor', model, features: useCursorProduction ? ['cursor-production'] : ['generic-assistant'] },
  ];
}

// ── Runners ────────────────────────────────────────────────────────────────

async function warmUp(): Promise<void> {
  console.log('[warm-up] Priming API connection...');
  try {
    const { getAIProvider } = await import('@/lib/ai/get-provider');
    const p = getAIProvider('anthropic');
    await p.complete([{ role: 'user', content: 'Reply: OK' }], { maxTokens: 8, temperature: 0 });
    console.log('[warm-up] Done.\n');
  } catch (e) {
    console.warn('[warm-up] Failed:', e);
  }
}

async function runV2Scenario(sc: Scenario, _contender: Contender): Promise<SResult> {
  const { streamV2, resetV2StreamHealth } = await import('@/lib/agents/coordinator-v2');
  resetV2StreamHealth();
  const files = loadFiles(sc.files);
  if (!files.length) throw new Error('No files for ' + sc.key);

  const chunks: string[] = [];
  const toolEvts: Array<{ type: string; name: string; id: string }> = [];
  let firstAt = 0;
  let thinkN = 0;
  let thinkingStartMs = 0;
  let thinkingTimeMs = 0;
  let reviewTimeMs = 0;
  let reviewStartMs = 0;

  console.log('  Files: ' + files.map((f) => f.path).join(', '));
  console.log('  Expected tier: ' + sc.expectedTier);
  const t0 = Date.now();
  let usageInputTokens = 0;
  let usageOutputTokens = 0;
  let usageCacheRead = 0;
  let usageCacheWrite = 0;

  const runV2Pass = async (
    pass: { intentMode: 'ask' | 'code' | 'plan' | 'debug'; prompt: string; recentMessages?: string[] },
    passLabel: string,
  ) => {
    console.log('  [v2-pass] ' + passLabel + ' (' + pass.intentMode + ')');
    const passRes = await streamV2(
      'bench-' + sc.key + '-' + passLabel + '-' + Date.now(),
      '00000000-0000-0000-0000-000000000099',
      'bench-user',
      pass.prompt,
      files,
      [],
      {
        intentMode: pass.intentMode,
        recentMessages: pass.recentMessages,
        // NO forcedModel — let production tier routing work
        onProgress: (ev: { type: string; label?: string; [key: string]: unknown }) => {
          if (ev.type === 'thinking') console.log('    [progress] ' + ev.label);
          if (ev.label && /review/i.test(ev.label)) {
            if (!reviewStartMs) reviewStartMs = Date.now();
          }
          if (reviewStartMs && ev.label && /done|complete|finish/i.test(ev.label)) {
            reviewTimeMs += Date.now() - reviewStartMs;
            reviewStartMs = 0;
          }
        },
        onContentChunk: (ch: string) => {
          if (!chunks.length) firstAt = Date.now() - t0;
          chunks.push(ch);
        },
        onToolEvent: (ev: { type: string; name: string; id: string }) => {
          toolEvts.push(ev);
          if (ev.type === 'tool_start') console.log('    [tool] ' + ev.name);
        },
        onReasoningChunk: () => {
          if (!thinkingStartMs) thinkingStartMs = Date.now();
          thinkN++;
        },
      },
    );

    usageInputTokens += passRes.usage?.totalInputTokens ?? 0;
    usageOutputTokens += passRes.usage?.totalOutputTokens ?? 0;
    usageCacheRead += passRes.usage?.totalCacheReadTokens ?? 0;
    usageCacheWrite += passRes.usage?.totalCacheWriteTokens ?? 0;
    return passRes;
  };
  const usePlanFlow = shouldUsePlanApproveCodeFlow(sc);
  let res;
  if (usePlanFlow) {
    const planRes = await runV2Pass(
      { intentMode: 'plan', prompt: sc.prompt, recentMessages: sc.recentMessages },
      'plan',
    );
    const planText = (chunks.join('') || planRes.analysis || '').slice(-12000);
    chunks.length = 0;
    const codeRecentMessages = [
      ...(sc.recentMessages ?? []),
      sc.prompt,
      planText || 'Plan generated.',
      'Approved plan. Execute these steps now and make the code changes.',
    ];
    res = await runV2Pass(
      {
        intentMode: 'code',
        prompt: 'Implement the approved plan with concrete code changes now.',
        recentMessages: codeRecentMessages,
      },
      'code',
    );
  } else {
    res = await runV2Pass(
      { intentMode: sc.intentMode, prompt: sc.prompt, recentMessages: sc.recentMessages },
      'single',
    );
  }

  if (thinkingStartMs) thinkingTimeMs = Date.now() - thinkingStartMs;
  if (reviewStartMs) reviewTimeMs += Date.now() - reviewStartMs;

  const elapsed = Date.now() - t0;
  const text = chunks.join('');
  const calls = toolEvts.filter((e) => e.type === 'tool_call');
  const model = res.usage?.model ?? _contender.model;

  console.log(
    '  Actual model: ' +
      model +
      ' (tier: ' +
      (res.usage?.tier ?? '?') +
      ', planFlow=' +
      (usePlanFlow ? 'on' : 'off') +
      ')',
  );

  return {
    success: res.success,
    responseText: res.analysis || text,
    totalTimeMs: elapsed,
    firstChunkMs: firstAt,
    model,
    tier: res.usage?.tier ?? sc.expectedTier,
    inputTokens: usageInputTokens,
    outputTokens: usageOutputTokens,
    cacheRead: usageCacheRead,
    cacheWrite: usageCacheWrite,
    costUSD: calcCost(model, usageInputTokens, usageOutputTokens, usageCacheRead, usageCacheWrite),
    toolCalls: calls.length,
    toolsUsed: [...new Set(calls.map((e) => e.name))],
    changes: res.changes?.length ?? 0,
    filesCreated: res.changes?.filter(c => !c.originalContent).length ?? 0,
    thinkingN: thinkN,
    features: V2_FEATURES,
    reviewTimeMs: reviewTimeMs || undefined,
    thinkingTimeMs: thinkingTimeMs || undefined,
  };
}

async function runBaselineScenario(sc: Scenario, contender: Contender): Promise<SResult> {
  const { createAnthropicProvider } = await import('@/lib/ai/providers/anthropic');
  const { selectV2Tools } = await import('@/lib/agents/tools/v2-tool-definitions');
  const { executeToolCall } = await import('@/lib/agents/tools/tool-executor');

  const provider = createAnthropicProvider();
  const files = loadFiles(sc.files);
  if (!files.length) throw new Error('No files for baseline ' + sc.key);

  const model = contender.model;
  const tools = selectV2Tools(sc.intentMode, false, false);

  const systemContent = 'You are a Shopify theme development assistant. Help with the requested task using the provided files and tools. Be thorough and use tools when needed.';

  const fileContents = files
    .map((f) => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
    .join('\n\n');

  const userContent = sc.prompt + '\n\n## FILES:\n' + fileContents;

  type Msg = { role: string; content: string | unknown[]; __toolCalls?: unknown[]; __toolResults?: unknown[] };
  const messages: Msg[] = [{ role: 'system', content: systemContent }];

  if (sc.recentMessages?.length) {
    for (let i = 0; i < sc.recentMessages.length; i++) {
      messages.push({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: sc.recentMessages[i],
      });
    }
  }

  messages.push({ role: 'user', content: userContent });

  console.log('  [baseline] Model: ' + model);

  const t0 = Date.now();
  let firstChunkAt = 0;
  let totalIn = 0;
  let totalOut = 0;
  let totalToolCalls = 0;
  const toolsUsedSet = new Set<string>();
  let changes = 0;
  let filesCreated = 0;
  let responseText = '';
  const MAX_ITERATIONS = 10;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let result;
    try {
      result = await provider.completeWithTools(
        messages as any, tools,
        { model, maxTokens: sc.intentMode === 'ask' ? 2048 : 4096, temperature: 0.7 },
      );
    } catch (err: any) {
      console.error('  [baseline] API error:', err.message);
      return {
        success: false, responseText: 'Baseline error: ' + (err.message || String(err)),
        totalTimeMs: Date.now() - t0, firstChunkMs: 0, model, tier: 'BASELINE',
        inputTokens: totalIn, outputTokens: totalOut, cacheRead: 0, cacheWrite: 0, costUSD: 0,
        toolCalls: totalToolCalls, toolsUsed: [...toolsUsedSet], changes, filesCreated, thinkingN: 0,
        features: contender.features,
      };
    }

    totalIn += result.inputTokens ?? 0;
    totalOut += result.outputTokens ?? 0;
    if (!firstChunkAt && result.content) firstChunkAt = Date.now() - t0;

    const toolCalls = result.toolCalls ?? [];
    if (toolCalls.length === 0) { responseText = result.content || ''; break; }

    totalToolCalls += toolCalls.length;
    const toolUseBlocks = toolCalls.map((tc: any) => ({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input }));
    messages.push({ role: 'assistant', content: toolUseBlocks, __toolCalls: toolUseBlocks });

    const toolResultBlocks: unknown[] = [];
    for (const tc of toolCalls) {
      console.log('    [baseline-tool] ' + tc.name);
      toolsUsedSet.add(tc.name);
      let toolResult = '[no result]';
      try {
        const res = await executeToolCall(
          { name: tc.name, input: tc.input ?? {} } as any,
          { files, contextEngine: null as any, executionId: 'baseline-' + sc.key, projectId: '00000000-0000-0000-0000-000000000099', userId: 'baseline' } as any,
        );
        toolResult = typeof res.content === 'string' ? res.content : JSON.stringify(res.content);
        if (tc.name === 'search_replace' || tc.name === 'create_file') changes++;
        if (tc.name === 'create_file') filesCreated++;
      } catch (toolErr: any) {
        toolResult = 'Tool error: ' + (toolErr.message || String(toolErr));
      }
      toolResultBlocks.push({ type: 'tool_result', tool_use_id: tc.id, content: toolResult.slice(0, 10000) });
    }

    messages.push({ role: 'user', content: toolResultBlocks, __toolResults: toolResultBlocks });
    if (result.content) responseText += result.content;
  }

  if (!firstChunkAt) firstChunkAt = Date.now() - t0;

  return {
    success: true, responseText, totalTimeMs: Date.now() - t0, firstChunkMs: firstChunkAt,
    model, tier: 'BASELINE', inputTokens: totalIn, outputTokens: totalOut,
    cacheRead: 0, cacheWrite: 0, costUSD: calcCost(model, totalIn, totalOut),
    toolCalls: totalToolCalls, toolsUsed: [...toolsUsedSet], changes, filesCreated, thinkingN: 0,
    features: contender.features,
  };
}

/** Per-run timeout for Cursor Headless CLI. Override with CURSOR_RUN_TIMEOUT_MIN (default 10; on Windows CLI may need 15+ if indexing is slow). */
function getCursorRunTimeoutMs(_sc: Scenario): number {
  const min = Math.max(1, parseInt(process.env.CURSOR_RUN_TIMEOUT_MIN ?? '10', 10));
  return min * 60 * 1000;
}

/** If no stdout after this long, assume CLI is stuck and fail fast. Override with CURSOR_NO_OUTPUT_FAIL_MIN (default 12). On Windows indexing often takes 8+ min with no output; use 12–15 so the CLI can finish indexing before we kill. */
const CURSOR_NO_OUTPUT_FAIL_MS =
  (parseFloat(process.env.CURSOR_NO_OUTPUT_FAIL_MIN ?? '12') || 12) * 60 * 1000;

/** Resolve Cursor agent executable. Uses CURSOR_AGENT_PATH, or on Windows tries common install locations. */
function resolveAgentPath(): string {
  if (process.env.CURSOR_AGENT_PATH) return process.env.CURSOR_AGENT_PATH;
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || '';
    const candidates = [
      path.join(localAppData, 'cursor-agent', 'agent.cmd'),
      path.join(localAppData, 'cursor-agent', 'agent.ps1'),
      path.join(localAppData, 'cursor', 'bin', 'agent.exe'),
      path.join(localAppData, 'Programs', 'cursor', 'agent.exe'),
      path.join(process.env.USERPROFILE || '', '.cursor', 'bin', 'agent.exe'),
    ];
    for (const c of candidates) {
      if (c && fs.existsSync(c)) return c;
    }
  }
  return 'agent';
}

/** Resolve direct node.exe + index.js from cursor-agent/versions/ so we can spawn Node directly (no cmd/PowerShell; fixes CLI producing no output). */
function resolveCursorNodeDirect(agentPath: string): { nodeExe: string; indexJs: string } | null {
  if (agentPath === 'agent') return null;
  const dir = path.dirname(agentPath);
  const versionsDir = path.join(dir, 'versions');
  if (!fs.existsSync(versionsDir)) return null;
  const entries = fs.readdirSync(versionsDir, { withFileTypes: true });
  const versionDirs = entries
    .filter((e) => e.isDirectory() && /^\d{4}\.\d{1,2}\.\d{1,2}-[a-f0-9]+$/.test(e.name))
    .map((e) => e.name)
    .sort()
    .reverse();
  if (versionDirs.length === 0) return null;
  const versionName = versionDirs[0];
  const nodeExe = path.join(versionsDir, versionName, 'node.exe');
  const indexJs = path.join(versionsDir, versionName, 'index.js');
  if (!fs.existsSync(nodeExe) || !fs.existsSync(indexJs)) return null;
  return { nodeExe, indexJs };
}

/** On Windows, agent.cmd launches cursor-agent.ps1. Using .ps1 via PowerShell avoids cmd; using node.exe + index.js directly avoids both and fixes no output. */
function resolveCursorPs1(agentPath: string): string | null {
  if (process.platform !== 'win32' || !agentPath.toLowerCase().endsWith('.cmd')) return null;
  const dir = path.dirname(agentPath);
  const ps1 = path.join(dir, 'cursor-agent.ps1');
  return fs.existsSync(ps1) ? ps1 : null;
}

/**
 * On Windows, prefer spawning node.exe + index.js directly from cursor-agent/versions/ so the CLI gets a real stdio and produces output.
 * Otherwise use PowerShell → .ps1 or cmd → .cmd so args are passed correctly.
 */
function getCursorSpawnArgs(agentPath: string, args: string[]): { executable: string; args: string[] } {
  if (process.platform === 'win32') {
    const direct = resolveCursorNodeDirect(agentPath);
    if (direct) return { executable: direct.nodeExe, args: [direct.indexJs, ...args] };
    const ps1 = resolveCursorPs1(agentPath);
    if (ps1) {
      return {
        executable: 'powershell.exe',
        args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1, ...args],
      };
    }
    if (agentPath.toLowerCase().endsWith('.cmd')) {
      return { executable: process.env.ComSpec || 'cmd.exe', args: ['/c', agentPath, ...args] };
    }
    if (agentPath.toLowerCase().endsWith('.ps1')) {
      return {
        executable: 'powershell.exe',
        args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', agentPath, ...args],
      };
    }
  }
  return { executable: agentPath, args };
}

/** Parse Cursor CLI stdout (stream-json or single JSON) into tokens and response text. */
function parseCursorStdout(stdout: string): { inputTokens: number; outputTokens: number; responseText: string } {
  let inputTokens = 0;
  let outputTokens = 0;
  let responseText = '';
  const lines = stdout.trim().split(/\r?\n/).filter((l) => l.length > 0);
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      if (!parsed || typeof parsed !== 'object') continue;
      if (typeof parsed.input_tokens === 'number') inputTokens = parsed.input_tokens;
      if (typeof parsed.output_tokens === 'number') outputTokens = parsed.output_tokens;
      const msg = parsed.message as { role?: string; content?: Array<{ type?: string; text?: string }> } | undefined;
      if (msg?.role === 'assistant' && Array.isArray(msg.content)) {
        const textParts = msg.content
          .filter((c): c is { type: string; text: string } => c && typeof c === 'object' && c.type === 'text' && typeof c.text === 'string')
          .map((c) => c.text);
        if (textParts.length) responseText = textParts.join('');
      }
      if (typeof parsed.text === 'string') responseText = parsed.text;
    } catch {
      // ignore malformed lines
    }
  }
  if (lines.length <= 1 && !responseText && inputTokens === 0 && outputTokens === 0) {
    try {
      const parsed = JSON.parse(stdout.trim()) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object') {
        responseText = (typeof parsed.text === 'string' ? parsed.text : (parsed.content as string) ?? '') || stdout.trim();
        if (typeof parsed.input_tokens === 'number') inputTokens = parsed.input_tokens;
        if (typeof parsed.output_tokens === 'number') outputTokens = parsed.output_tokens;
      }
    } catch {
      responseText = stdout.trim() || '(no output)';
    }
  }
  if (!responseText) responseText = stdout.trim() || '(no output)';
  return { inputTokens, outputTokens, responseText };
}

/**
 * Run Cursor via Headless CLI (production). Requires CURSOR_API_KEY and `agent` on PATH (or set CURSOR_AGENT_PATH on Windows).
 * Uses a PTY (node-pty) when available so the CLI streams output instead of buffering; otherwise falls back to spawn (may see no output until exit).
 */
async function runCursorProductionScenario(sc: Scenario, contender: Contender): Promise<SResult> {
  const themeWorkspace = path.join(projectRoot, 'theme-workspace');
  if (!fs.existsSync(themeWorkspace)) throw new Error('theme-workspace not found for Cursor production run');
  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) throw new Error('CURSOR_API_KEY required for Cursor production (set in .env.local or env)');

  const prompt = sc.recentMessages?.length
    ? sc.recentMessages[sc.recentMessages.length - 1] + '\n\nFollow-up: ' + sc.prompt
    : sc.prompt;

  const t0 = Date.now();
  let firstChunkMs = 0;
  let stdout = '';
  let stderr = '';

  const agentPath = resolveAgentPath();
  const agentArgs = ['-p', '--force', '--trust', '--output-format', 'stream-json', prompt];
  const { executable, args: spawnArgs } = getCursorSpawnArgs(agentPath, agentArgs);
  const useShell = process.platform === 'win32' && agentPath === 'agent';
  if (agentPath !== 'agent') console.log('  [cursor-production] Using agent at:', agentPath);

  const env: NodeJS.ProcessEnv = { ...process.env, CURSOR_API_KEY: apiKey };
  env.CURSOR_AGENT = '1';
  if (process.platform === 'win32' && executable.toLowerCase().endsWith('node.exe')) {
    env.CURSOR_INVOKED_AS = 'agent';
    if (!env.NODE_COMPILE_CACHE)
      env.NODE_COMPILE_CACHE = path.join(process.env.LOCALAPPDATA || '', 'cursor-compile-cache');
  }

  const runTimeoutMs = getCursorRunTimeoutMs(sc);
  const buildResult = (
    success: boolean,
    totalTimeMs: number,
    out: string,
    err: string,
    inputTokens: number,
    outputTokens: number,
    responseText: string
  ): SResult => ({
    success,
    responseText: responseText.slice(0, 50000),
    totalTimeMs,
    firstChunkMs: firstChunkMs || totalTimeMs,
    model: contender.model,
    tier: 'CURSOR',
    inputTokens,
    outputTokens,
    cacheRead: 0,
    cacheWrite: 0,
    costUSD: inputTokens + outputTokens > 0 ? calcCost(contender.model, inputTokens, outputTokens) : 0,
    toolCalls: 0,
    toolsUsed: [],
    changes: 0,
    filesCreated: 0,
    thinkingN: 0,
    features: contender.features,
  });

  // Prefer node-pty so the CLI sees a TTY and streams output instead of buffering.
  let pty: typeof import('node-pty') | null = null;
  try {
    pty = await import('node-pty').then((m) => m.default ?? m);
  } catch {
    // node-pty not installed or failed to load (e.g. native build)
  }

  if (pty) {
    console.log('  [cursor-production] Using PTY so CLI streams output (indexing may take 1–2 min first)...');
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result: SResult) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      const ptyProcess = pty!.spawn(executable, spawnArgs, {
        cwd: themeWorkspace,
        env: env as Record<string, string>,
        cols: 80,
        rows: 24,
      });
      const killChild = () => {
        try {
          ptyProcess.kill();
        } catch (_) {
          // ignore
        }
      };
      const timeoutId = setTimeout(() => {
        if (settled) return;
        killChild();
        finish(
          buildResult(
            false,
            Date.now() - t0,
            stdout,
            stderr,
            0,
            0,
            'Cursor run timed out after ' + runTimeoutMs / 60000 + ' min'
          )
        );
        console.error('  [cursor-production] Run timed out after ' + runTimeoutMs / 60000 + ' min');
      }, runTimeoutMs);
      let noOutputId: ReturnType<typeof setTimeout> | null = setTimeout(() => {
        noOutputId = null;
        if (settled || stdout.length > 0) return;
        killChild();
        finish(
          buildResult(
            false,
            Date.now() - t0,
            stdout,
            stderr,
            0,
            0,
            'Cursor CLI produced no output (stuck indexing or hung). Set CURSOR_SKIP_PRODUCTION=1 to skip.'
          )
        );
        console.error(
          '  [cursor-production] No output after ' + CURSOR_NO_OUTPUT_FAIL_MS / 60000 + ' min — CLI may be stuck.'
        );
      }, CURSOR_NO_OUTPUT_FAIL_MS);
      ptyProcess.onData((data: string) => {
        if (noOutputId) {
          clearTimeout(noOutputId);
          noOutputId = null;
        }
        if (!firstChunkMs) firstChunkMs = Date.now() - t0;
        stdout += data;
        process.stderr.write(data);
      });
      ptyProcess.onExit(({ exitCode, signal }) => {
        clearTimeout(timeoutId);
        if (noOutputId) {
          clearTimeout(noOutputId);
          noOutputId = null;
        }
        if (settled) return;
        const totalTimeMs = Date.now() - t0;
        const success = exitCode === 0;
        const { inputTokens, outputTokens, responseText } = parseCursorStdout(stdout);
        if ((!success || (inputTokens === 0 && outputTokens === 0)) && (stdout.length > 0 || stderr.length > 0)) {
          console.error('  [cursor-production] (0 tokens) stdout length:', stdout.length, 'last 400:', stdout.slice(-400));
        }
        finish(buildResult(success, totalTimeMs, stdout, stderr, inputTokens, outputTokens, responseText));
      });
    });
  }

  // Fallback: regular spawn (CLI may buffer and produce no output until exit).
  console.log(
    '  [cursor-production] No PTY (install node-pty for streaming). Running in theme-workspace — CLI may buffer output...'
  );
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: SResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const child = spawn(executable, spawnArgs, {
      cwd: themeWorkspace,
      env,
      shell: useShell,
    });

    const killChild = () => {
      try {
        if (process.platform === 'win32' && child.pid) {
          spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { shell: false });
        } else {
          child.kill('SIGTERM');
        }
      } catch (_) {
        child.kill('SIGKILL');
      }
    };

    const timeoutId = setTimeout(() => {
      if (settled) return;
      killChild();
      const totalTimeMs = Date.now() - t0;
      console.error('  [cursor-production] Run timed out after ' + (runTimeoutMs / 60000) + ' min');
      finish(
        buildResult(
          false,
          totalTimeMs,
          stdout,
          stderr,
          0,
          0,
          'Cursor run timed out after ' + runTimeoutMs / 60000 + ' min'
        )
      );
    }, runTimeoutMs);

    let noOutputId: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      noOutputId = null;
      if (settled || stdout.length > 0) return;
      killChild();
      const totalTimeMs = Date.now() - t0;
      console.error(
        '  [cursor-production] No output after ' + CURSOR_NO_OUTPUT_FAIL_MS / 60000 + ' min — CLI may be stuck. Set CURSOR_SKIP_PRODUCTION=1 to skip.'
      );
      finish(
        buildResult(
          false,
          totalTimeMs,
          stdout,
          stderr,
          0,
          0,
          'Cursor CLI produced no output (stuck indexing or hung). Set CURSOR_SKIP_PRODUCTION=1 to skip.'
        )
      );
    }, CURSOR_NO_OUTPUT_FAIL_MS);

    child.stdout.on('data', (chunk: Buffer) => {
      if (noOutputId) {
        clearTimeout(noOutputId);
        noOutputId = null;
      }
      if (!firstChunkMs) firstChunkMs = Date.now() - t0;
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      const s = chunk.toString();
      stderr += s;
      process.stderr.write(s);
    });

    child.on('close', (code, signal) => {
      clearTimeout(timeoutId);
      if (noOutputId) {
        clearTimeout(noOutputId);
        noOutputId = null;
      }
      if (settled) return;
      const totalTimeMs = Date.now() - t0;
      const success = code === 0;
      const { inputTokens, outputTokens, responseText } = parseCursorStdout(stdout);
      if ((!success || (inputTokens === 0 && outputTokens === 0)) && (stdout.length > 0 || stderr.length > 0)) {
        console.error('  [cursor-production] (0 tokens) stdout length:', stdout.length, 'last 400 chars:', stdout.slice(-400));
        if (stderr) console.error('  [cursor-production] stderr (last 400):', stderr.slice(-400));
      }
      if (!success && stdout.trim()) console.error('  [cursor-production] stdout:', stdout.trim().slice(0, 300));
      if (!success && stderr) console.error('  [cursor-production] stderr:', stderr.slice(0, 500));
      finish(buildResult(success, totalTimeMs, stdout, stderr, inputTokens, outputTokens, responseText));
    });

    child.on('error', (err) => {
      clearTimeout(timeoutId);
      if (noOutputId) {
        clearTimeout(noOutputId);
        noOutputId = null;
      }
      const totalTimeMs = Date.now() - t0;
      finish({
        success: false,
        responseText: 'Cursor CLI error: ' + (err.message || String(err)),
        totalTimeMs,
        firstChunkMs: 0,
        model: contender.model,
        tier: 'CURSOR',
        inputTokens: 0,
        outputTokens: 0,
        cacheRead: 0,
        cacheWrite: 0,
        costUSD: 0,
        toolCalls: 0,
        toolsUsed: [],
        changes: 0,
        filesCreated: 0,
        thinkingN: 0,
        features: contender.features,
      });
    });
  });
}

async function runCursorScenario(sc: Scenario, contender: Contender): Promise<SResult> {
  if (useCursorProduction) return runCursorProductionScenario(sc, contender);

  const { createAnthropicProvider } = await import('@/lib/ai/providers/anthropic');
  const { selectV2Tools } = await import('@/lib/agents/tools/v2-tool-definitions');
  const { executeToolCall } = await import('@/lib/agents/tools/tool-executor');

  const provider = createAnthropicProvider();
  const files = loadFiles(sc.files);
  if (!files.length) throw new Error('No files for cursor ' + sc.key);

  const model = contender.model;
  const tools = selectV2Tools(sc.intentMode, false, false);

  const systemContent = 'You are a helpful coding assistant. You help users write and edit code. Use the tools available to you to read, search, and modify files as needed. Be thorough and precise.';

  const fileContents = files
    .map((f) => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
    .join('\n\n');

  const userContent = sc.prompt + '\n\n## FILES:\n' + fileContents;

  type Msg = { role: string; content: string | unknown[]; __toolCalls?: unknown[]; __toolResults?: unknown[] };
  const messages: Msg[] = [{ role: 'system', content: systemContent }];

  if (sc.recentMessages?.length) {
    for (let i = 0; i < sc.recentMessages.length; i++) {
      messages.push({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: sc.recentMessages[i],
      });
    }
  }

  messages.push({ role: 'user', content: userContent });

  console.log('  [cursor-sim] Model: ' + model);

  const t0 = Date.now();
  let firstChunkAt = 0;
  let totalIn = 0;
  let totalOut = 0;
  let totalToolCalls = 0;
  const toolsUsedSet = new Set<string>();
  let changes = 0;
  let filesCreated = 0;
  let responseText = '';
  const MAX_ITERATIONS = 10;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let result;
    try {
      result = await provider.completeWithTools(
        messages as any, tools,
        { model, maxTokens: sc.intentMode === 'ask' ? 2048 : 4096, temperature: 0.7 },
      );
    } catch (err: any) {
      console.error('  [cursor-sim] API error:', err.message);
      return {
        success: false, responseText: 'Cursor-sim error: ' + (err.message || String(err)),
        totalTimeMs: Date.now() - t0, firstChunkMs: 0, model, tier: 'CURSOR',
        inputTokens: totalIn, outputTokens: totalOut, cacheRead: 0, cacheWrite: 0, costUSD: 0,
        toolCalls: totalToolCalls, toolsUsed: [...toolsUsedSet], changes, filesCreated, thinkingN: 0,
        features: contender.features,
      };
    }

    totalIn += result.inputTokens ?? 0;
    totalOut += result.outputTokens ?? 0;
    if (!firstChunkAt && result.content) firstChunkAt = Date.now() - t0;

    const toolCalls = result.toolCalls ?? [];
    if (toolCalls.length === 0) { responseText = result.content || ''; break; }

    totalToolCalls += toolCalls.length;
    const toolUseBlocks = toolCalls.map((tc: any) => ({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input }));
    messages.push({ role: 'assistant', content: toolUseBlocks, __toolCalls: toolUseBlocks });

    const toolResultBlocks: unknown[] = [];
    for (const tc of toolCalls) {
      console.log('    [cursor-tool] ' + tc.name);
      toolsUsedSet.add(tc.name);
      let toolResult = '[no result]';
      try {
        const res = await executeToolCall(
          { name: tc.name, input: tc.input ?? {} } as any,
          { files, contextEngine: null as any, executionId: 'cursor-' + sc.key, projectId: '00000000-0000-0000-0000-000000000099', userId: 'cursor' } as any,
        );
        toolResult = typeof res.content === 'string' ? res.content : JSON.stringify(res.content);
        if (tc.name === 'search_replace' || tc.name === 'create_file') changes++;
        if (tc.name === 'create_file') filesCreated++;
      } catch (toolErr: any) {
        toolResult = 'Tool error: ' + (toolErr.message || String(toolErr));
      }
      toolResultBlocks.push({ type: 'tool_result', tool_use_id: tc.id, content: toolResult.slice(0, 10000) });
    }

    messages.push({ role: 'user', content: toolResultBlocks, __toolResults: toolResultBlocks });
    if (result.content) responseText += result.content;
  }

  if (!firstChunkAt) firstChunkAt = Date.now() - t0;

  return {
    success: true, responseText, totalTimeMs: Date.now() - t0, firstChunkMs: firstChunkAt,
    model, tier: 'CURSOR', inputTokens: totalIn, outputTokens: totalOut,
    cacheRead: 0, cacheWrite: 0, costUSD: calcCost(model, totalIn, totalOut),
    toolCalls: totalToolCalls, toolsUsed: [...toolsUsedSet], changes, filesCreated, thinkingN: 0,
    features: contender.features,
  };
}

// ── Dispatch ───────────────────────────────────────────────────────────────

async function runContender(sc: Scenario, contender: Contender): Promise<SResult> {
  switch (contender.runner) {
    case 'v2': return runV2Scenario(sc, contender);
    case 'baseline': return runBaselineScenario(sc, contender);
    case 'cursor': return runCursorScenario(sc, contender);
    default: throw new Error('Unknown runner: ' + contender.runner);
  }
}

/** Run a contender N times and return one SResult with averaged metrics (for marketing methodology). */
async function runContenderAveraged(sc: Scenario, contender: Contender, nRuns: number): Promise<SResult> {
  if (nRuns <= 1) return runContender(sc, contender);

  const runs: SResult[] = [];
  for (let i = 0; i < nRuns; i++) {
    console.log('    run ' + (i + 1) + '/' + nRuns + '...');
    const r = await runContender(sc, contender);
    runs.push(r);
  }

  const n = runs.length;
  const successCount = runs.filter((r) => r.success).length;
  const success = successCount >= Math.ceil(n / 2);

  const sum = (get: (r: SResult) => number) => runs.reduce((a, r) => a + get(r), 0);
  const avg = (get: (r: SResult) => number) => Math.round(sum(get) / n);
  const avgFrac = (get: (r: SResult) => number) => sum(get) / n;

  const first = runs[0];
  const lastSuccessful = runs.find((r) => r.success) ?? first;

  const totalTimeMsLow = Math.min(...runs.map((r) => r.totalTimeMs));
  const totalTimeMsHigh = Math.max(...runs.map((r) => r.totalTimeMs));
  const firstChunkMsLow = Math.min(...runs.map((r) => r.firstChunkMs));
  const firstChunkMsHigh = Math.max(...runs.map((r) => r.firstChunkMs));
  const costUSDLow = Math.min(...runs.map((r) => r.costUSD));
  const costUSDHigh = Math.max(...runs.map((r) => r.costUSD));

  return {
    success,
    responseText: lastSuccessful.responseText,
    totalTimeMs: Math.round(avgFrac((r) => r.totalTimeMs)),
    firstChunkMs: Math.round(avgFrac((r) => r.firstChunkMs)),
    model: first.model,
    tier: first.tier,
    inputTokens: avg((r) => r.inputTokens),
    outputTokens: avg((r) => r.outputTokens),
    cacheRead: avg((r) => r.cacheRead),
    cacheWrite: avg((r) => r.cacheWrite),
    costUSD: sum((r) => r.costUSD) / n,
    toolCalls: avg((r) => r.toolCalls),
    toolsUsed: [...new Set(runs.flatMap((r) => r.toolsUsed))],
    changes: avg((r) => r.changes),
    filesCreated: avg((r) => r.filesCreated),
    thinkingN: avg((r) => r.thinkingN),
    features: first.features,
    reviewTimeMs: first.reviewTimeMs != null ? Math.round(avgFrac((r) => r.reviewTimeMs ?? 0)) : undefined,
    thinkingTimeMs: first.thinkingTimeMs != null ? Math.round(avgFrac((r) => r.thinkingTimeMs ?? 0)) : undefined,
    streamFallbackMs: first.streamFallbackMs != null ? Math.round(avgFrac((r) => r.streamFallbackMs ?? 0)) : undefined,
    totalTimeMsLow,
    totalTimeMsHigh,
    firstChunkMsLow,
    firstChunkMsHigh,
    costUSDLow,
    costUSDHigh,
  };
}

// ── Print ──────────────────────────────────────────────────────────────────

function printResult(sc: Scenario, contender: Contender, r: SResult): void {
  const hitPct =
    r.inputTokens > 0
      ? ((r.cacheRead / (r.inputTokens + r.cacheRead)) * 100).toFixed(1) + '%'
      : 'N/A';
  const W = 45;
  const sep = '+' + '='.repeat(66) + '+';
  const mid = '+' + '-'.repeat(66) + '+';
  const row = (label: string, val: string) =>
    '  | ' + (label + ':').padEnd(19) + val.padEnd(W) + ' |';

  console.log('\n  ' + sep);
  console.log('  | ' + (sc.name + ' / ' + contender.name).padEnd(64) + ' |');
  console.log('  ' + sep);
  console.log(row('Success', String(r.success)));
  console.log(row('Tier / Model', r.tier + ' / ' + r.model));
  console.log(row('Total time', fmtMs(r.totalTimeMs)));
  console.log(row('First chunk', fmtMs(r.firstChunkMs)));
  console.log(row('Tool calls', String(r.toolCalls)));
  console.log(row('Tools used', r.toolsUsed.join(', ') || 'none'));
  console.log(row('Code changes', String(r.changes)));
  console.log(row('Files created', String(r.filesCreated)));
  console.log(row('Response length', r.responseText.length + ' chars'));
  console.log(row('Thinking chunks', String(r.thinkingN)));
  if (r.reviewTimeMs) console.log(row('Review time', fmtMs(r.reviewTimeMs)));
  if (r.thinkingTimeMs) console.log(row('Thinking time', fmtMs(r.thinkingTimeMs)));
  console.log('  ' + mid);
  console.log(row('Input tokens', String(r.inputTokens)));
  console.log(row('Output tokens', String(r.outputTokens)));
  console.log(row('Cache read', String(r.cacheRead)));
  console.log(row('Cache write', String(r.cacheWrite)));
  console.log(row('Cache hit rate', hitPct));
  console.log(row('Estimated cost', fmtCost(r.costUSD)));
  console.log(row('Features', r.features.join(', ') || 'none'));
  console.log('  ' + sep);
}

// ── Gap Analysis ───────────────────────────────────────────────────────────

interface GapEntry {
  scenario: string;
  metric: string;
  synapseValue: string;
  cursorValue: string;
  delta: string;
  severity: 'critical' | 'gap' | 'quality-investment' | 'cache-priming' | 'info';
  likelyCause: string;
  recommendation: string;
}

function analyzeGaps(allResults: Map<string, Map<string, SResult>>): GapEntry[] {
  const gaps: GapEntry[] = [];

  for (const sc of SCENARIOS) {
    const scResults = allResults.get(sc.key);
    if (!scResults) continue;

    const synapse = scResults.get('synapse');
    const cursor = scResults.get('cursor');
    if (!synapse?.success || !cursor?.success) continue;

    const timeRatio = synapse.totalTimeMs / cursor.totalTimeMs;
    if (timeRatio > 1.5) {
      const hasReview = (synapse.reviewTimeMs ?? 0) > 0;
      const hasThinking = (synapse.thinkingTimeMs ?? 0) > 0;
      const overhead = (synapse.reviewTimeMs ?? 0) + (synapse.thinkingTimeMs ?? 0);
      if (hasReview || hasThinking) {
        gaps.push({
          scenario: sc.key, metric: 'time',
          synapseValue: fmtMs(synapse.totalTimeMs), cursorValue: fmtMs(cursor.totalTimeMs),
          delta: '+' + ((timeRatio - 1) * 100).toFixed(0) + '%', severity: 'quality-investment',
          likelyCause: fmtMs(overhead) + ' on ' + [hasReview ? 'review' : '', hasThinking ? 'thinking' : ''].filter(Boolean).join('+'),
          recommendation: 'Quality overhead. Without it: ' + fmtMs(synapse.totalTimeMs - overhead),
        });
      } else {
        gaps.push({
          scenario: sc.key, metric: 'time',
          synapseValue: fmtMs(synapse.totalTimeMs), cursorValue: fmtMs(cursor.totalTimeMs),
          delta: '+' + ((timeRatio - 1) * 100).toFixed(0) + '%', severity: 'gap',
          likelyCause: 'No review/thinking overhead. Possible stream or iteration issue.',
          recommendation: 'Investigate stream health, reduce iterations, check tool calls.',
        });
      }
    }

    const costRatio = synapse.costUSD / (cursor.costUSD || 0.001);
    if (costRatio > 2) {
      const hasCacheWrite = synapse.cacheWrite > 0;
      const cacheHitRate = synapse.inputTokens > 0 ? synapse.cacheRead / (synapse.inputTokens + synapse.cacheRead) : 0;
      if (hasCacheWrite && cacheHitRate < 0.5) {
        gaps.push({
          scenario: sc.key, metric: 'cost',
          synapseValue: fmtCost(synapse.costUSD), cursorValue: fmtCost(cursor.costUSD),
          delta: '+' + ((costRatio - 1) * 100).toFixed(0) + '%', severity: 'gap',
          likelyCause: 'Cache hit rate ' + (cacheHitRate * 100).toFixed(0) + '% — not paying off.',
          recommendation: 'Check cache key stability and TTL.',
        });
      } else if (hasCacheWrite) {
        gaps.push({
          scenario: sc.key, metric: 'cost',
          synapseValue: fmtCost(synapse.costUSD), cursorValue: fmtCost(cursor.costUSD),
          delta: '+' + ((costRatio - 1) * 100).toFixed(0) + '%', severity: 'cache-priming',
          likelyCause: 'First-request cache write cost.',
          recommendation: 'Not a gap. Request #2+ will hit cache.',
        });
      } else {
        gaps.push({
          scenario: sc.key, metric: 'cost',
          synapseValue: fmtCost(synapse.costUSD), cursorValue: fmtCost(cursor.costUSD),
          delta: '+' + ((costRatio - 1) * 100).toFixed(0) + '%', severity: 'gap',
          likelyCause: 'Token inflation or routing issue.',
          recommendation: 'Reduce tool calls or check model routing.',
        });
      }
    }

    if (cursor.toolCalls > 0 && synapse.toolCalls > cursor.toolCalls * 2) {
      const extraIsReview = synapse.toolsUsed.includes('check_lint') || synapse.toolsUsed.includes('auto_review');
      gaps.push({
        scenario: sc.key, metric: 'tools',
        synapseValue: String(synapse.toolCalls), cursorValue: String(cursor.toolCalls),
        delta: '+' + ((synapse.toolCalls / cursor.toolCalls - 1) * 100).toFixed(0) + '%',
        severity: extraIsReview ? 'quality-investment' : 'gap',
        likelyCause: extraIsReview ? 'Review/diagnostics tools.' : 'Redundant tool calls.',
        recommendation: extraIsReview ? 'Quality overhead.' : 'Tune tool selection.',
      });
    }
  }

  return gaps;
}

function printGapAnalysis(gaps: GapEntry[]): void {
  if (gaps.length === 0) {
    console.log('\n  GAP ANALYSIS: No gaps found.');
    return;
  }
  console.log('\n  ' + '='.repeat(72));
  console.log('  GAP ANALYSIS');
  console.log('  ' + '='.repeat(72));
  for (const g of gaps) {
    const icon = g.severity === 'critical' ? 'CRITICAL'
      : g.severity === 'gap' ? 'GAP'
      : g.severity === 'quality-investment' ? 'OK (QUALITY)'
      : g.severity === 'cache-priming' ? 'OK (CACHE)' : 'INFO';
    console.log(`\n  [${icon}] ${g.scenario} — ${g.metric}: Synapse ${g.synapseValue} vs Cursor ${g.cursorValue} (${g.delta})`);
    console.log(`    Cause: ${g.likelyCause}`);
    console.log(`    Action: ${g.recommendation}`);
  }
  console.log('\n  ' + '='.repeat(72));
}

// ── Load existing results (for cursor-only merge) ───────────────────────────

interface RawSavedContender {
  name?: string;
  success: boolean;
  totalTimeMs: number;
  firstChunkMs: number;
  model: string;
  tier: string;
  inputTokens: number;
  outputTokens: number;
  cacheRead?: number;
  cacheWrite?: number;
  costUSD: number;
  toolCalls: number;
  toolsUsed?: string[];
  changes: number;
  filesCreated?: number;
  thinkingN?: number;
  features?: string[];
  reviewTimeMs?: number;
  thinkingTimeMs?: number;
  streamFallbackMs?: number;
  totalTimeMsLow?: number;
  totalTimeMsHigh?: number;
  firstChunkMsLow?: number;
  firstChunkMsHigh?: number;
  costUSDLow?: number;
  costUSDHigh?: number;
}

function rawContenderToSResult(raw: RawSavedContender): SResult {
  return {
    success: raw.success,
    responseText: '',
    totalTimeMs: raw.totalTimeMs,
    firstChunkMs: raw.firstChunkMs,
    model: raw.model,
    tier: raw.tier,
    inputTokens: raw.inputTokens,
    outputTokens: raw.outputTokens,
    cacheRead: raw.cacheRead ?? 0,
    cacheWrite: raw.cacheWrite ?? 0,
    costUSD: raw.costUSD,
    toolCalls: raw.toolCalls,
    toolsUsed: raw.toolsUsed ?? [],
    changes: raw.changes,
    filesCreated: raw.filesCreated ?? 0,
    thinkingN: raw.thinkingN ?? 0,
    features: raw.features ?? [],
    reviewTimeMs: raw.reviewTimeMs,
    thinkingTimeMs: raw.thinkingTimeMs,
    streamFallbackMs: raw.streamFallbackMs,
    totalTimeMsLow: raw.totalTimeMsLow,
    totalTimeMsHigh: raw.totalTimeMsHigh,
    firstChunkMsLow: raw.firstChunkMsLow,
    firstChunkMsHigh: raw.firstChunkMsHigh,
    costUSDLow: raw.costUSDLow,
    costUSDHigh: raw.costUSDHigh,
  };
}

const SCENARIO_KEYS = SCENARIOS.map((s) => s.key);

/** Comma-separated list of scenario keys to run (e.g. after a timeout). Run only these and merge into latest results. */
function getRequestedScenarioKeys(): string[] | null {
  const raw = process.env.BENCHMARK_SCENARIOS?.trim();
  if (!raw) return null;
  const keys = raw.split(',').map((k) => k.trim()).filter(Boolean);
  const valid = keys.filter((k) => SCENARIO_KEYS.includes(k));
  if (valid.length === 0) return null;
  return valid;
}

function loadLatestBenchmarkJson(): { filePath: string; payload: { scenarios: Record<string, { contenders: Record<string, RawSavedContender> }> } } {
  const dir = path.join(projectRoot, 'tests', 'integration', 'results');
  const names = fs.readdirSync(dir, { withFileTypes: true })
    .filter((f) => f.isFile() && f.name.startsWith('v2-bench-') && f.name.endsWith('.json'))
    .map((f) => f.name)
    .sort()
    .reverse();
  if (names.length === 0) throw new Error('No v2-bench-*.json found in tests/integration/results. Run the full benchmark once.');
  const filePath = path.join(dir, names[0]);
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return { filePath, payload };
}

/** Load latest benchmark file into allResults Map. Returns empty Map if no file. */
function loadLatestResultsIntoMap(): Map<string, Map<string, SResult>> {
  const dir = path.join(projectRoot, 'tests', 'integration', 'results');
  if (!fs.existsSync(dir)) return new Map();
  const names = fs.readdirSync(dir, { withFileTypes: true })
    .filter((f) => f.isFile() && f.name.startsWith('v2-bench-') && f.name.endsWith('.json'))
    .map((f) => f.name)
    .sort()
    .reverse();
  if (names.length === 0) return new Map();
  const filePath = path.join(dir, names[0]);
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as { scenarios?: Record<string, { contenders?: Record<string, RawSavedContender> }> };
  const allResults = new Map<string, Map<string, SResult>>();
  for (const sc of SCENARIOS) {
    const saved = payload.scenarios?.[sc.key]?.contenders;
    if (!saved) continue;
    const scResults = new Map<string, SResult>();
    for (const [cKey, raw] of Object.entries(saved)) {
      scResults.set(cKey, rawContenderToSResult(raw as RawSavedContender));
    }
    allResults.set(sc.key, scResults);
  }
  return allResults;
}

// ── Save Results ───────────────────────────────────────────────────────────

function saveResults(allResults: Map<string, Map<string, SResult>>, gaps: GapEntry[]): string {
  const dir = path.join(projectRoot, 'tests', 'integration', 'results');
  try { fs.mkdirSync(dir, { recursive: true }); } catch { /* exists */ }
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const fp = path.join(dir, 'v2-bench-' + ts + '.json');

  const allContenderDefs: Contender[] = [];
  const seenKeys = new Set<string>();

  const enrichedScenarios: Record<string, unknown> = {};
  for (const sc of SCENARIOS) {
    const scResults = allResults.get(sc.key);
    if (!scResults) continue;

    const scContenders = contendersForScenario(sc);
    for (const c of scContenders) {
      if (!seenKeys.has(c.key + ':' + c.model)) {
        seenKeys.add(c.key + ':' + c.model);
        allContenderDefs.push(c);
      }
    }

    const contenders: Record<string, unknown> = {};
    for (const [cKey, r] of scResults.entries()) {
      const cDef = scContenders.find((c) => c.key === cKey);
      const base: Record<string, unknown> = {
        name: cDef?.name ?? cKey,
        success: r.success,
        totalTimeMs: r.totalTimeMs,
        firstChunkMs: r.firstChunkMs,
        model: r.model,
        tier: r.tier,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        cacheRead: r.cacheRead,
        cacheWrite: r.cacheWrite,
        costUSD: r.costUSD,
        toolCalls: r.toolCalls,
        toolsUsed: r.toolsUsed,
        changes: r.changes,
        filesCreated: r.filesCreated,
        thinkingN: r.thinkingN,
        features: r.features,
        reviewTimeMs: r.reviewTimeMs,
        thinkingTimeMs: r.thinkingTimeMs,
        streamFallbackMs: r.streamFallbackMs,
      };
      if (r.totalTimeMsLow != null) base.totalTimeMsLow = r.totalTimeMsLow;
      if (r.totalTimeMsHigh != null) base.totalTimeMsHigh = r.totalTimeMsHigh;
      if (r.firstChunkMsLow != null) base.firstChunkMsLow = r.firstChunkMsLow;
      if (r.firstChunkMsHigh != null) base.firstChunkMsHigh = r.firstChunkMsHigh;
      if (r.costUSDLow != null) base.costUSDLow = r.costUSDLow;
      if (r.costUSDHigh != null) base.costUSDHigh = r.costUSDHigh;
      contenders[cKey] = base;
    }

    enrichedScenarios[sc.key] = {
      name: sc.name,
      intentMode: sc.intentMode,
      prompt: sc.prompt,
      files: sc.files,
      expectedTier: sc.expectedTier,
      contenders,
    };
  }

  const payload = {
    timestamp: new Date().toISOString(),
    runsPerPrompt: RUNS_PER_PROMPT,
    features: V2_FEATURES,
    contenderDefinitions: allContenderDefs.map((c) => ({
      key: c.key, name: c.name, runner: c.runner, model: c.model, features: c.features,
    })),
    scenarios: enrichedScenarios,
    gapAnalysis: gaps,
  };

  fs.writeFileSync(fp, JSON.stringify(payload, null, 2));

  const marketingPath = path.join(projectRoot, 'lib', 'benchmarks', 'latest-results.json');
  fs.writeFileSync(marketingPath, JSON.stringify(payload, null, 2));
  console.log('Marketing data written to: ' + marketingPath);

  return fp;
}

// ── Test ────────────────────────────────────────────────────────────────────

describe('V2 Live Benchmark (Per-Tier)', () => {
  beforeAll(() => {
    setCacheAdapter(new MemoryAdapter());
    // Always log skip flags so we can see why Cursor-only runs or is skipped (env can be lost when WSL invokes npm).
    console.log(
      `[bench] runLive=${runLive} cursorOnlyMerge=${cursorOnlyMerge} useCursorProduction=${useCursorProduction} | env: RUN_LIVE_AGENT_TESTS=${process.env.RUN_LIVE_AGENT_TESTS} BENCHMARK_CURSOR_ONLY=${process.env.BENCHMARK_CURSOR_ONLY} CURSOR_PRODUCTION=${process.env.CURSOR_PRODUCTION} CURSOR_API_KEY=${process.env.CURSOR_API_KEY ? 'set' : 'missing'}`
    );
    if (!runLive) {
      console.log(
        'Skipped. Set RUN_LIVE_AGENT_TESTS=true and ANTHROPIC_API_KEY (or for Cursor-only: BENCHMARK_CURSOR_ONLY=1 + CURSOR_API_KEY) in .env.local'
      );
    }
  });

  it.skipIf(!runLive || cursorOnlyMerge)('All tiers × contenders', async () => {
    await warmUp();
    const requestedKeys = getRequestedScenarioKeys();
    const scenariosToRun = requestedKeys
      ? SCENARIOS.filter((sc) => requestedKeys.includes(sc.key))
      : SCENARIOS;
    const allResults = requestedKeys ? loadLatestResultsIntoMap() : new Map<string, Map<string, SResult>>();

    if (requestedKeys?.length) {
      console.log('\n  BENCHMARK_SCENARIOS = ' + requestedKeys.join(', ') + ' (run only these, merge into latest)');
    }
    console.log('\n  RUNS_PER_PROMPT = ' + RUNS_PER_PROMPT + ' (set BENCHMARK_RUNS_PER_PROMPT to override)');
    if (useCursorProduction) console.log('  Cursor = PRODUCTION (Headless CLI). Set CURSOR_PRODUCTION=0 to use API simulation.\n');
    else console.log('  Cursor = API simulation. Set CURSOR_PRODUCTION=1 + CURSOR_API_KEY for production Cursor.\n');

    for (const sc of scenariosToRun) {
      const contenders = contendersForScenario(sc);

      console.log('\n' + '#'.repeat(72));
      console.log('# ' + sc.name + ' [' + sc.expectedTier + ']');
      console.log('# ' + sc.prompt.slice(0, 90) + '...');
      console.log('# Model for this tier: ' + contenders[0].model);
      console.log('#'.repeat(72));

      const scResults = new Map<string, SResult>();

      for (const contender of contenders) {
        console.log('\n  --- ' + contender.name + ' (' + RUNS_PER_PROMPT + ' runs, averaged) ---');
        const r = await runContenderAveraged(sc, contender, RUNS_PER_PROMPT);
        scResults.set(contender.key, r);
        printResult(sc, contender, r);
      }

      allResults.set(sc.key, scResults);

      const synapse = scResults.get('synapse');
      if (synapse) sc.validate(synapse);
      console.log('\n  PASS (synapse validated)');

      const partialGaps = analyzeGaps(allResults);
      saveResults(allResults, partialGaps);
      const doneThisRun = scenariosToRun.indexOf(sc) + 1;
      console.log('  [checkpoint] Saved (total scenarios: ' + allResults.size + ', this run: ' + doneThisRun + '/' + scenariosToRun.length + ')');
    }

    console.log('\n' + '='.repeat(72));
    console.log('  AGGREGATE SUMMARY');
    console.log('='.repeat(72));

    const uniqueContenderKeys = ['synapse', 'baseline', 'cursor'];
    for (const cKey of uniqueContenderKeys) {
      let tCost = 0, tTime = 0, tIn = 0, tOut = 0, tCR = 0, tCW = 0, tTools = 0, count = 0;
      for (const [, scResults] of allResults) {
        const r = scResults.get(cKey);
        if (!r) continue;
        tCost += r.costUSD; tTime += r.totalTimeMs; tIn += r.inputTokens;
        tOut += r.outputTokens; tCR += r.cacheRead; tCW += r.cacheWrite;
        tTools += r.toolCalls; count++;
      }
      const chRate = tIn > 0 ? ((tCR / (tIn + tCR)) * 100).toFixed(1) : '0.0';
      console.log('\n  ' + cKey.toUpperCase() + ':');
      console.log('  Scenarios:   ' + count);
      console.log('  Wall time:   ' + fmtMs(tTime));
      console.log('  Total cost:  ' + fmtCost(tCost));
      console.log('  Tokens:      ' + tIn + ' in / ' + tOut + ' out');
      console.log('  Cache:       ' + tCR + ' read / ' + tCW + ' write (' + chRate + '% hit)');
      console.log('  Tool calls:  ' + tTools);
    }

    console.log('\n' + '='.repeat(72));

    const gaps = analyzeGaps(allResults);
    printGapAnalysis(gaps);

    const fp = saveResults(allResults, gaps);
    console.log('\nResults: ' + fp + '\n');

    if (!requestedKeys) expect(allResults.size).toBe(SCENARIOS.length);

    // Ensure benchmarks page shows this run (including production Cursor when CURSOR_PRODUCTION=1)
    const resultsDir = path.join(projectRoot, 'tests', 'integration', 'results');
    const destPath = path.join(projectRoot, 'lib', 'benchmarks', 'latest-results.json');
    const v2Files = fs.readdirSync(resultsDir, { withFileTypes: true })
      .filter((f) => f.isFile() && f.name.startsWith('v2-bench-') && f.name.endsWith('.json'))
      .map((f) => f.name)
      .sort()
      .reverse();
    if (v2Files.length > 0) {
      const latestPath = path.join(resultsDir, v2Files[0]);
      fs.writeFileSync(destPath, fs.readFileSync(latestPath, 'utf-8'), 'utf-8');
      console.log('Benchmarks updated: ' + destPath + ' (from ' + v2Files[0] + ')');
    }
  }, 3 * 60 * 60 * 1000); // 3h — full run (Synapse + Baseline + Cursor, 6 scenarios × 3 contenders × RUNS_PER_PROMPT) can exceed 1h

  // Run when: runLive && cursorOnlyMerge && (useCursorProduction or CURSOR_API_KEY). CURSOR_PRODUCTION can be lost when WSL invokes npm.
  it.skipIf(
    !runLive ||
      !cursorOnlyMerge ||
      (!useCursorProduction && !process.env.CURSOR_API_KEY)
  )(
    'Cursor only — run Cursor (production) and merge into latest results',
    async () => {
      const { filePath, payload } = loadLatestBenchmarkJson();
      const skipCursor = process.env.CURSOR_SKIP_PRODUCTION === '1' || process.env.CURSOR_SKIP_PRODUCTION === 'true';
      const cursorOnlyRuns = RUNS_PER_PROMPT;
      console.log('\n  Loaded: ' + filePath);
      if (skipCursor) console.log('  CURSOR_SKIP_PRODUCTION=1 — keeping existing Cursor data from file (no CLI runs).\n');
      else console.log('  Cursor only: ' + cursorOnlyRuns + ' run(s) per scenario (averaged). Set BENCHMARK_RUNS_PER_PROMPT to override.\n');

      const allResults = new Map<string, Map<string, SResult>>();

      for (const sc of SCENARIOS) {
        const saved = payload.scenarios?.[sc.key];
        const scResults = new Map<string, SResult>();
        if (saved?.contenders) {
          for (const [cKey, raw] of Object.entries(saved.contenders)) {
            scResults.set(cKey, rawContenderToSResult(raw as RawSavedContender));
          }
        } else {
          console.log('  Scenario ' + sc.key + ' not in saved file; running Cursor only for this scenario.');
        }

        const cursorContender = contendersForScenario(sc).find((c) => c.key === 'cursor');
        if (!cursorContender) continue;

        if (skipCursor) {
          console.log('\n  [' + sc.key + '] Cursor skipped (CURSOR_SKIP_PRODUCTION=1)');
        } else {
          console.log('\n' + '#'.repeat(72));
          console.log('# ' + sc.name + ' [' + sc.expectedTier + '] — Cursor only');
          console.log('#'.repeat(72));
          console.log('\n  --- ' + cursorContender.name + ' (' + cursorOnlyRuns + ' runs, averaged) ---');
          const r = await runContenderAveraged(sc, cursorContender, cursorOnlyRuns);
          scResults.set('cursor', r);
          printResult(sc, cursorContender, r);
        }

        allResults.set(sc.key, scResults);

        const partialGaps = analyzeGaps(allResults);
        saveResults(allResults, partialGaps);
        console.log('  [checkpoint] Saved after ' + allResults.size + '/' + SCENARIOS.length + ' scenarios');
      }

      const gaps = analyzeGaps(allResults);
      const fp = saveResults(allResults, gaps);
      console.log('\nMerged results: ' + fp);
      console.log('Benchmarks page updated: lib/benchmarks/latest-results.json\n');
    },
    6 * 60 * 60 * 1000
  ); // 6h — 6 scenarios × RUNS_PER_PROMPT Cursor runs (e.g. 18 runs at 3 each).
});
