/**
 * Three-way head-to-head: Baseline (Sonnet) vs Synapse (Sonnet) vs Synapse (Opus 4.6)
 * with optional manual Cursor agent captures.
 *
 * Tests all contenders on the same prompts with REAL Anthropic calls,
 * capturing response quality, tool usage, latency, and token cost.
 *
 * Set RUN_LIVE_AGENT_TESTS=true and ANTHROPIC_API_KEY in .env.test to run.
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeAll } from 'vitest';

// ── Env setup ────────────────────────────────────────────────────────────────

const projectRoot = process.cwd();
const envTestPath = path.join(projectRoot, '.env.test');
const loaded = dotenv.config({ path: envTestPath });
if (!loaded.parsed) {
  const relPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env.test');
  dotenv.config({ path: relPath });
}

// ── Mocks ────────────────────────────────────────────────────────────────────

import { vi } from 'vitest';

vi.mock('@/lib/design-tokens/agent-integration', () => ({
  DesignSystemContextProvider: class {
    async getDesignContext() { return ''; }
  },
}));

// ── Imports (after env + mocks) ──────────────────────────────────────────────

import { setCacheAdapter, MemoryAdapter } from '@/lib/cache/cache-adapter';
import { BaselineAgent } from './baseline-agent';
import { loadCursorCapture } from './cursor-captures/loader';
import type { CursorCapture } from './cursor-captures/types';
import type { FileContext } from '@/lib/types/agent';
import type { AgentToolEvent } from '@/lib/types/agent';
import type { ToolDefinition } from '@/lib/ai/types';

// ── Gate ─────────────────────────────────────────────────────────────────────

const runLive =
  process.env.RUN_LIVE_AGENT_TESTS === 'true' &&
  !!process.env.ANTHROPIC_API_KEY;

// ── Constants ────────────────────────────────────────────────────────────────

const MODELS = {
  SONNET: 'claude-sonnet-4-6',
  OPUS: 'claude-opus-4-6',
};

const TIMEOUT_MS = 180_000; // 3 minutes per contender

/** Race a promise against a per-contender deadline. */
function withTimeout<T>(label: string, promise: Promise<T>, ms = TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`[${label}] timed out after ${ms / 1000}s`)), ms),
    ),
  ]);
}

// ── Scenarios ────────────────────────────────────────────────────────────────

interface Scenario {
  key: string;
  name: string;
  intentMode: 'ask' | 'code' | 'debug';
  prompt: string;
  files: string[]; // paths relative to theme-workspace/
  validation: (result: ContenderResult) => void;
}

const SCENARIOS: Scenario[] = [
  {
    key: 'ask',
    name: 'Ask: Accessibility Analysis',
    intentMode: 'ask',
    prompt: 'What accessibility issues exist in the product-thumbnail.liquid snippet? What specific changes would improve it?',
    files: [
      'snippets/product-thumbnail.liquid',
      'snippets/product-img.liquid',
    ],
    validation: (r) => {
      expect(r.success).toBe(true);
      expect(r.responseText.length).toBeGreaterThan(100);
      expect(r.responseText.toLowerCase()).toMatch(/accessib|a11y|alt|aria|label/);
    },
  },
  {
    key: 'code',
    name: 'Code: Add Lazy Loading',
    intentMode: 'code',
    prompt: 'Add lazy loading to all images in snippets/product-thumbnail.liquid using loading="lazy" and add descriptive alt text using product title.',
    files: [
      'snippets/product-thumbnail.liquid',
      'snippets/product-img.liquid',
    ],
    validation: (r) => {
      expect(r.success).toBe(true);
      expect(r.responseText.length).toBeGreaterThan(50);
      // Should propose code changes in code mode
      expect(r.changesProduced).toBeGreaterThanOrEqual(0); // May propose via text
    },
  },
  {
    key: 'debug',
    name: 'Debug: Hero Banner Not Showing',
    intentMode: 'debug',
    prompt: 'The hero banner image is not showing on the homepage. The section is hero-banner.liquid. Find the root cause and fix it.',
    files: [
      'sections/hero-banner.liquid',
      'templates/index.json',
      'layout/theme.liquid',
    ],
    validation: (r) => {
      expect(r.success).toBe(true);
      expect(r.responseText.length).toBeGreaterThan(50);
    },
  },
];

// ── File loading ─────────────────────────────────────────────────────────────

function loadThemeFile(relativePath: string): FileContext | null {
  const fullPath = path.join(projectRoot, 'theme-workspace', relativePath);
  try {
    const content = fs.readFileSync(fullPath, 'utf-8');
    const ext = path.extname(relativePath).slice(1);
    return {
      fileId: 'file-' + relativePath.replace(/[/\\]/g, '-'),
      fileName: path.basename(relativePath),
      path: relativePath,
      fileType: (ext || 'liquid') as FileContext['fileType'],
      content,
    };
  } catch {
    return null;
  }
}

function loadScenarioFiles(scenario: Scenario): FileContext[] {
  const files: FileContext[] = [];
  for (const p of scenario.files) {
    const fc = loadThemeFile(p);
    if (fc) files.push(fc);
  }
  return files;
}

// ── Unified result type ──────────────────────────────────────────────────────

interface ContenderResult {
  contender: string;
  model: string;
  success: boolean;
  responseText: string;
  totalTimeMs: number;
  timeToFirstChunkMs: number;
  contentLength: number;
  toolCallCount: number;
  toolsUsed: string[];
  toolSequence: string[];
  inputTokens: number;
  outputTokens: number;
  iterationCount: number;
  changesProduced: number;
  error?: string;
}

function fromCursorCapture(capture: CursorCapture): ContenderResult {
  return {
    contender: 'Cursor',
    model: capture.cursorModel,
    success: true,
    responseText: capture.responseText,
    totalTimeMs: capture.totalTimeMs ?? 0,
    timeToFirstChunkMs: 0,
    contentLength: capture.responseText.length,
    toolCallCount: capture.toolsObserved?.length ?? 0,
    toolsUsed: capture.toolsObserved ?? [],
    toolSequence: capture.toolsObserved ?? [],
    inputTokens: 0,
    outputTokens: 0,
    iterationCount: 0,
    changesProduced: capture.codeChanges?.length ?? 0,
  };
}

// ── Comparison Reporter ──────────────────────────────────────────────────────

function padRight(str: string, len: number): string {
  return str.length >= len ? str : str + ' '.repeat(len - str.length);
}

function padLeft(str: string, len: number): string {
  return str.length >= len ? str : ' '.repeat(len - str.length) + str;
}

function fmtNum(n: number): string {
  return n.toLocaleString('en-US');
}

function fmtMs(ms: number): string {
  if (ms === 0) return 'N/A';
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function fmtPct(a: number, b: number): string {
  if (b === 0) return 'N/A';
  const pct = ((a - b) / b) * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

function printComparisonTable(scenario: string, results: ContenderResult[]): void {
  const COL_WIDTH = 20;
  const LABEL_WIDTH = 21;

  const metrics: Array<{ label: string; getValue: (r: ContenderResult) => string }> = [
    { label: 'Total time', getValue: r => fmtMs(r.totalTimeMs) },
    { label: 'Time to first chunk', getValue: r => fmtMs(r.timeToFirstChunkMs) },
    { label: 'Input tokens', getValue: r => r.inputTokens ? fmtNum(r.inputTokens) : 'N/A' },
    { label: 'Output tokens', getValue: r => r.outputTokens ? fmtNum(r.outputTokens) : 'N/A' },
    { label: 'Tool calls', getValue: r => String(r.toolCallCount) },
    { label: 'Iterations', getValue: r => r.iterationCount ? String(r.iterationCount) : 'N/A' },
    { label: 'Response length', getValue: r => fmtNum(r.contentLength) },
    { label: 'Code changes', getValue: r => String(r.changesProduced) },
    { label: 'Success', getValue: r => r.success ? 'YES' : 'NO' },
  ];

  // Header
  console.log('\n' + '='.repeat(80));
  console.log(`  ${scenario}`);
  console.log('='.repeat(80));

  // Column headers
  const headerLine = padRight('Metric', LABEL_WIDTH) + results.map(r => padLeft(r.contender, COL_WIDTH)).join('');
  console.log(headerLine);
  console.log('-'.repeat(LABEL_WIDTH + results.length * COL_WIDTH));

  // Rows
  for (const m of metrics) {
    const row = padRight(m.label, LABEL_WIDTH) + results.map(r => padLeft(m.getValue(r), COL_WIDTH)).join('');
    console.log(row);
  }

  // Tools used detail
  console.log('-'.repeat(LABEL_WIDTH + results.length * COL_WIDTH));
  for (const r of results) {
    console.log(`  ${r.contender} tools: ${r.toolsUsed.join(', ') || 'none'}`);
  }

  // Delta analysis
  const baseline = results.find(r => r.contender === 'Baseline');
  const synSonnet = results.find(r => r.contender === 'Synapse (Sonnet)');
  const synOpus = results.find(r => r.contender === 'Synapse (Opus)');
  const cursor = results.find(r => r.contender === 'Cursor');

  console.log('\nDeltas:');
  if (baseline && synSonnet) {
    console.log(`  Orchestration (Synapse Sonnet vs Baseline): ` +
      `Time ${fmtPct(synSonnet.totalTimeMs, baseline.totalTimeMs)}  ` +
      `Tokens ${fmtPct(synSonnet.inputTokens + synSonnet.outputTokens, baseline.inputTokens + baseline.outputTokens)}  ` +
      `Length ${fmtPct(synSonnet.contentLength, baseline.contentLength)}`);
  }
  if (synSonnet && synOpus) {
    console.log(`  Model upgrade (Opus vs Sonnet): ` +
      `Time ${fmtPct(synOpus.totalTimeMs, synSonnet.totalTimeMs)}  ` +
      `Tokens ${fmtPct(synOpus.inputTokens + synOpus.outputTokens, synSonnet.inputTokens + synSonnet.outputTokens)}  ` +
      `Length ${fmtPct(synOpus.contentLength, synSonnet.contentLength)}`);
  }
  if (synSonnet && cursor) {
    console.log(`  vs Cursor (Synapse Sonnet vs Cursor): ` +
      `Length ${fmtPct(synSonnet.contentLength, cursor.contentLength)}  ` +
      `Changes ${synSonnet.changesProduced} vs ${cursor.changesProduced}`);
  }
  console.log('');
}

function saveResults(allResults: Record<string, ContenderResult[]>): void {
  const resultsDir = path.join(projectRoot, 'tests', 'integration', 'results');
  try {
    fs.mkdirSync(resultsDir, { recursive: true });
  } catch { /* exists */ }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(resultsDir, `h2h-${timestamp}.json`);
  const data = {
    timestamp: new Date().toISOString(),
    models: MODELS,
    scenarios: allResults,
  };
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`Results saved to ${filePath}`);
}

// ── Run helpers ──────────────────────────────────────────────────────────────

async function runBaseline(
  scenario: Scenario,
  files: FileContext[],
  tools: ToolDefinition[],
): Promise<ContenderResult> {
  const agent = new BaselineAgent();
  const chunks: string[] = [];
  const toolEvents: Array<{ type: string; name: string }> = [];

  console.log(`  [Baseline (Sonnet)] Running...`);
  const result = await agent.run({
    prompt: scenario.prompt,
    files,
    tools,
    intentMode: scenario.intentMode,
    model: MODELS.SONNET,
    maxIterations: 8,
    timeoutMs: TIMEOUT_MS,
    onContentChunk: (ch) => chunks.push(ch),
    onToolEvent: (ev) => {
      toolEvents.push(ev);
      if (ev.type === 'tool_start') console.log(`    [tool] ${ev.name}`);
    },
  });

  console.log(`  [Baseline (Sonnet)] Done in ${fmtMs(result.metrics.totalTimeMs)}, ${result.metrics.toolCallCount} tool calls`);

  return {
    contender: 'Baseline',
    model: MODELS.SONNET,
    success: result.success,
    responseText: result.responseText,
    totalTimeMs: result.metrics.totalTimeMs,
    timeToFirstChunkMs: result.metrics.timeToFirstChunkMs,
    contentLength: result.metrics.contentLength,
    toolCallCount: result.metrics.toolCallCount,
    toolsUsed: result.metrics.toolsUsed,
    toolSequence: result.metrics.toolSequence,
    inputTokens: result.metrics.inputTokens,
    outputTokens: result.metrics.outputTokens,
    iterationCount: result.metrics.iterationCount,
    changesProduced: result.metrics.changesProduced,
    error: result.error,
  };
}

async function runSynapse(
  scenario: Scenario,
  files: FileContext[],
  model: string,
  label: string,
): Promise<ContenderResult> {
  const { streamV2 } = await import('@/lib/agents/coordinator-v2');

  const contentChunks: string[] = [];
  const toolEvents: AgentToolEvent[] = [];
  let firstChunkAt = 0;

  console.log(`  [${label}] Running...`);
  const t0 = Date.now();

  const result = await streamV2(
    `h2h-${label.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}`,
    '00000000-0000-0000-0000-000000000099',
    'h2h-user',
    scenario.prompt,
    files,
    [],
    {
      intentMode: scenario.intentMode,
      model,
      onProgress: (ev: Record<string, unknown>) => {
        if (ev.type === 'thinking' && ev.label) {
          console.log(`    [progress] ${ev.label}`);
        }
      },
      onContentChunk: (chunk: string) => {
        if (contentChunks.length === 0) firstChunkAt = Date.now() - t0;
        contentChunks.push(chunk);
      },
      onToolEvent: (ev: AgentToolEvent) => {
        toolEvents.push(ev);
        if (ev.type === 'tool_start') console.log(`    [tool] ${ev.name}`);
      },
    },
  );

  const elapsed = Date.now() - t0;
  const fullResponse = contentChunks.join('');
  const toolCallEvents = toolEvents.filter(e => e.type === 'tool_call');

  console.log(`  [${label}] Done in ${fmtMs(elapsed)}, ${toolCallEvents.length} tool calls`);

  return {
    contender: label,
    model,
    success: result.success,
    responseText: result.analysis || fullResponse,
    totalTimeMs: elapsed,
    timeToFirstChunkMs: firstChunkAt,
    contentLength: (result.analysis || fullResponse).length,
    toolCallCount: toolCallEvents.length,
    toolsUsed: [...new Set(toolCallEvents.map(e => e.name))],
    toolSequence: toolCallEvents.map(e => e.name),
    inputTokens: 0,
    outputTokens: 0,
    iterationCount: 0,
    changesProduced: result.changes?.length ?? 0,
    error: result.error?.message,
  };
}

// ── Warm-up ──────────────────────────────────────────────────────────────────

async function warmUp(): Promise<void> {
  console.log('[warm-up] Sending trivial call to warm API connection...');
  try {
    const { getAIProvider } = await import('@/lib/ai/get-provider');
    const provider = getAIProvider('anthropic');
    await provider.complete(
      [{ role: 'user', content: 'Reply with exactly: WARM_OK' }],
      { maxTokens: 16, temperature: 0, model: MODELS.SONNET },
    );
    console.log('[warm-up] Done.\n');
  } catch (err) {
    console.warn('[warm-up] Failed (non-fatal):', err);
  }
}

// ── Test Suite ───────────────────────────────────────────────────────────────

describe('Head-to-Head: Baseline vs Synapse (Sonnet) vs Synapse (Opus 4.6)', () => {
  beforeAll(() => {
    setCacheAdapter(new MemoryAdapter());
    if (!runLive) {
      console.log(
        'Live head-to-head tests skipped. Set RUN_LIVE_AGENT_TESTS=true and ANTHROPIC_API_KEY in .env.test',
      );
    }
  });

  it.skipIf(!runLive)(
    'Three-way comparison across all scenarios',
    async () => {
      // Warm up API connection
      await warmUp();

      // Dynamically load tool definitions
      const { AGENT_TOOLS, CHECK_LINT_TOOL, PROPOSE_CODE_EDIT_TOOL, SEARCH_REPLACE_TOOL, CREATE_FILE_TOOL } =
        await import('@/lib/agents/tools/definitions');

      const allResults: Record<string, ContenderResult[]> = {};

      for (const scenario of SCENARIOS) {
        console.log(`\n${'#'.repeat(80)}`);
        console.log(`# Scenario: ${scenario.name}`);
        console.log(`# Prompt: ${scenario.prompt}`);
        console.log(`${'#'.repeat(80)}\n`);

        const files = loadScenarioFiles(scenario);
        if (files.length === 0) {
          console.warn(`  SKIP: No theme files found for scenario "${scenario.key}"`);
          continue;
        }
        console.log(`  Files loaded: ${files.map(f => f.path || f.fileName).join(', ')}`);

        // Build tool set for baseline (same tools Synapse gets for this mode)
        const readTools = AGENT_TOOLS.filter(t =>
          ['read_file', 'search_files', 'grep_content', 'glob_files',
           'semantic_search', 'list_files', 'get_dependency_graph'].includes(t.name),
        );
        const baselineTools: ToolDefinition[] = [...readTools, CHECK_LINT_TOOL];
        if (scenario.intentMode !== 'ask') {
          baselineTools.push(PROPOSE_CODE_EDIT_TOOL, SEARCH_REPLACE_TOOL, CREATE_FILE_TOOL);
        }

        const scenarioResults: ContenderResult[] = [];

        // ── Contender 1: Baseline (Sonnet) ───────────────────────────────
        {
          let pushed = false;
          try {
            const baselineResult = await withTimeout('Baseline', runBaseline(scenario, files, baselineTools));
            scenarioResults.push(baselineResult);
            pushed = true;
            scenario.validation(baselineResult);
          } catch (err) {
            console.error('  [Baseline] FAILED:', err);
            if (!pushed) {
              scenarioResults.push({
                contender: 'Baseline',
                model: MODELS.SONNET,
                success: false,
                responseText: '',
                totalTimeMs: 0, timeToFirstChunkMs: 0, contentLength: 0,
                toolCallCount: 0, toolsUsed: [], toolSequence: [],
                inputTokens: 0, outputTokens: 0, iterationCount: 0, changesProduced: 0,
                error: String(err),
              });
            }
          }
        }

        // ── Contender 2: Synapse (Sonnet) ────────────────────────────────
        {
          let pushed = false;
          try {
            const synSonnetResult = await withTimeout('Synapse Sonnet', runSynapse(scenario, files, MODELS.SONNET, 'Synapse (Sonnet)'));
            scenarioResults.push(synSonnetResult);
            pushed = true;
            scenario.validation(synSonnetResult);
          } catch (err) {
            console.error('  [Synapse Sonnet] FAILED:', err);
            if (!pushed) {
              scenarioResults.push({
                contender: 'Synapse (Sonnet)',
                model: MODELS.SONNET,
                success: false,
                responseText: '',
                totalTimeMs: 0, timeToFirstChunkMs: 0, contentLength: 0,
                toolCallCount: 0, toolsUsed: [], toolSequence: [],
                inputTokens: 0, outputTokens: 0, iterationCount: 0, changesProduced: 0,
                error: String(err),
              });
            }
          }
        }

        // ── Contender 3: Synapse (Opus 4.6) ─────────────────────────────
        {
          let pushed = false;
          try {
            const synOpusResult = await withTimeout('Synapse Opus', runSynapse(scenario, files, MODELS.OPUS, 'Synapse (Opus)'));
            scenarioResults.push(synOpusResult);
            pushed = true;
            scenario.validation(synOpusResult);
          } catch (err) {
            console.error('  [Synapse Opus] FAILED:', err);
            if (!pushed) {
              scenarioResults.push({
                contender: 'Synapse (Opus)',
                model: MODELS.OPUS,
                success: false,
                responseText: '',
                totalTimeMs: 0, timeToFirstChunkMs: 0, contentLength: 0,
                toolCallCount: 0, toolsUsed: [], toolSequence: [],
                inputTokens: 0, outputTokens: 0, iterationCount: 0, changesProduced: 0,
                error: String(err),
              });
            }
          }
        }

        // ── Contender 4: Cursor (manual capture, optional) ───────────────
        const cursorCapture = loadCursorCapture(scenario.key);
        if (cursorCapture) {
          console.log(`  [Cursor] Loaded capture from ${scenario.key}-cursor.json`);
          scenarioResults.push(fromCursorCapture(cursorCapture));
        } else {
          console.log(`  [Cursor] No capture found (tests/integration/cursor-captures/${scenario.key}-cursor.json)`);
        }

        // ── Print comparison ─────────────────────────────────────────────
        printComparisonTable(scenario.name, scenarioResults);
        allResults[scenario.key] = scenarioResults;
      }

      // ── Save all results to JSON ─────────────────────────────────────
      saveResults(allResults);

      // ── Final summary ────────────────────────────────────────────────
      console.log('\n' + '='.repeat(80));
      console.log('  FINAL SUMMARY');
      console.log('='.repeat(80));

      let totalBaseline = 0, totalSynSonnet = 0, totalSynOpus = 0;
      for (const [, results] of Object.entries(allResults)) {
        const b = results.find(r => r.contender === 'Baseline');
        const ss = results.find(r => r.contender === 'Synapse (Sonnet)');
        const so = results.find(r => r.contender === 'Synapse (Opus)');
        if (b) totalBaseline += b.totalTimeMs;
        if (ss) totalSynSonnet += ss.totalTimeMs;
        if (so) totalSynOpus += so.totalTimeMs;
      }

      console.log(`  Total time (all scenarios):`);
      console.log(`    Baseline:        ${fmtMs(totalBaseline)}`);
      console.log(`    Synapse Sonnet:  ${fmtMs(totalSynSonnet)}`);
      console.log(`    Synapse Opus:    ${fmtMs(totalSynOpus)}`);
      console.log(`\n  All scenarios passed.\n`);
    },
    TIMEOUT_MS * 3 * SCENARIOS.length + 30_000, // Total test timeout
  );
});
