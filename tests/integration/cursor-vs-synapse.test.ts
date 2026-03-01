/**
 * Head-to-head: Cursor agent vs Synapse agent on the same prompt.
 *
 * Tests the V2 pipeline (streamV2)
 * with REAL Anthropic calls against a theme analysis prompt, capturing:
 *   - Response quality (text length, relevance)
 *   - Timing (total time, time to first chunk)
 *   - Token usage (input/output tokens per agent)
 *   - Estimated cost (USD per request)
 *   - Tool usage (which tools were called)
 *   - Tier classification (v2 only)
 *
 * Set RUN_LIVE_AGENT_TESTS=true and ANTHROPIC_API_KEY in .env.test to run.
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const projectRoot = process.cwd();
const relativeToFile = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../.env.test',
);
const loaded = dotenv.config({ path: path.join(projectRoot, '.env.test') });
if (!loaded.parsed && projectRoot !== path.dirname(relativeToFile)) {
  dotenv.config({ path: relativeToFile });
}

import { describe, it, expect, beforeAll, vi } from 'vitest';

vi.mock('@/lib/design-tokens/agent-integration', () => ({
  DesignSystemContextProvider: class {
    async getDesignContext() {
      return '';
    }
  },
}));

import { setCacheAdapter, MemoryAdapter } from '@/lib/cache/cache-adapter';
import type { FileContext } from '@/lib/types/agent';

// ── Cost estimation ──────────────────────────────────────────────────────────

/** Approximate cost per 1M tokens (USD), as of early 2026. */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-6':                  { input: 15.0,  output: 75.0 },
  'claude-sonnet-4-6':                { input: 3.0,   output: 15.0 },
  'claude-haiku-4-5-20251001':        { input: 0.80,  output: 4.0 },
  'gpt-4o':                           { input: 2.50,  output: 10.0 },
  'gpt-4o-mini':                      { input: 0.15,  output: 0.60 },
  'gemini-2.0-flash':                 { input: 0.10,  output: 0.40 },
  'gemini-2.0-flash-lite':            { input: 0.075, output: 0.30 },
};

function estimateCostUSD(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = MODEL_PRICING[model] ?? { input: 3.0, output: 15.0 };
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

function formatCost(usd: number): string {
  if (usd < 0.001) return `$${(usd * 100).toFixed(4)}c`;
  return `$${usd.toFixed(4)}`;
}

// ── Theme file loading ───────────────────────────────────────────────────────

const runLive =
  process.env.RUN_LIVE_AGENT_TESTS === 'true' &&
  !!process.env.ANTHROPIC_API_KEY;

const PROMPT =
  'What accessibility issues exist in the product-thumbnail.liquid snippet? What specific changes would improve it?';

function loadThemeFile(relativePath: string): FileContext | null {
  const fullPath = path.join(projectRoot, 'theme-workspace', relativePath);
  try {
    const content = fs.readFileSync(fullPath, 'utf-8');
    const ext = path.extname(relativePath).slice(1);
    return {
      fileId: 'file-' + relativePath.replace(/[/\\]/g, '-'),
      fileName: path.basename(relativePath),
      path: relativePath,
      fileType: (ext || 'liquid') as 'liquid' | 'javascript' | 'css' | 'other',
      content,
    };
  } catch {
    return null;
  }
}

function loadThemeFiles(): FileContext[] {
  const paths = [
    'snippets/product-thumbnail.liquid',
    'snippets/product-img.liquid',
  ];
  const files: FileContext[] = [];
  for (const p of paths) {
    const fc = loadThemeFile(p);
    if (fc) files.push(fc);
  }
  return files;
}

// ── Scorecard ────────────────────────────────────────────────────────────────

interface PipelineScore {
  pipeline: string;
  success: boolean;
  totalTimeMs: number;
  firstChunkMs: number;
  responseChars: number;
  changesCount: number;
  toolCallsCount: number;
  toolsUsed: string[];
  inputTokens: number;
  outputTokens: number;
  estimatedCostUSD: number;
  tier?: string;
  model?: string;
}

const scores: PipelineScore[] = [];

function printScorecard() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║                    PERFORMANCE SCORECARD                            ║');
  console.log('╠══════════════════════════════════════════════════════════════════════╣');

  for (const s of scores) {
    console.log(`║ Pipeline: ${s.pipeline.padEnd(56)}║`);
    console.log(`║   Success:          ${String(s.success).padEnd(46)}║`);
    console.log(`║   Total time:       ${(s.totalTimeMs + 'ms').padEnd(46)}║`);
    console.log(`║   First chunk:      ${(s.firstChunkMs + 'ms').padEnd(46)}║`);
    console.log(`║   Response:         ${(s.responseChars + ' chars').padEnd(46)}║`);
    console.log(`║   Changes:          ${String(s.changesCount).padEnd(46)}║`);
    console.log(`║   Tool calls:       ${String(s.toolCallsCount).padEnd(46)}║`);
    console.log(`║   Tools used:       ${(s.toolsUsed.join(', ') || 'none').padEnd(46)}║`);
    console.log(`║   Input tokens:     ${String(s.inputTokens).padEnd(46)}║`);
    console.log(`║   Output tokens:    ${String(s.outputTokens).padEnd(46)}║`);
    console.log(`║   Estimated cost:   ${formatCost(s.estimatedCostUSD).padEnd(46)}║`);
    if (s.tier) console.log(`║   Tier:             ${s.tier.padEnd(46)}║`);
    if (s.model) console.log(`║   Model:            ${s.model.padEnd(46)}║`);
    console.log('╠──────────────────────────────────────────────────────────────────────╣');
  }

  if (scores.length >= 2) {
    const fastest = scores.reduce((a, b) => a.totalTimeMs < b.totalTimeMs ? a : b);
    const cheapest = scores.reduce((a, b) => a.estimatedCostUSD < b.estimatedCostUSD ? a : b);
    const quickestFirst = scores.reduce((a, b) => a.firstChunkMs < b.firstChunkMs ? a : b);
    console.log(`║ 🏆 Fastest total:    ${fastest.pipeline.padEnd(46)}║`);
    console.log(`║ 🏆 Cheapest:         ${cheapest.pipeline.padEnd(46)}║`);
    console.log(`║ 🏆 Fastest first:    ${quickestFirst.pipeline.padEnd(46)}║`);
  }

  console.log('╚══════════════════════════════════════════════════════════════════════╝\n');
}

function writeResultsJson() {
  const resultsDir = path.join(projectRoot, 'tests', 'integration', 'results');
  if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(resultsDir, `h2h-${ts}.json`);

  const json = {
    timestamp: new Date().toISOString(),
    prompt: PROMPT,
    scores: scores.map((s) => ({
      pipeline: s.pipeline,
      success: s.success,
      totalTimeMs: s.totalTimeMs,
      timeToFirstChunkMs: s.firstChunkMs,
      responseLength: s.responseChars,
      changesProduced: s.changesCount,
      toolCallCount: s.toolCallsCount,
      toolsUsed: s.toolsUsed,
      inputTokens: s.inputTokens,
      outputTokens: s.outputTokens,
      estimatedCostUSD: s.estimatedCostUSD,
      tier: s.tier,
      model: s.model,
    })),
  };

  fs.writeFileSync(filePath, JSON.stringify(json, null, 2), 'utf-8');
  console.log(`Results written to: ${filePath}`);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Cursor vs Synapse: head-to-head', () => {
  beforeAll(() => {
    setCacheAdapter(new MemoryAdapter());
    if (!runLive) {
      console.log(
        'Live head-to-head test skipped. Set RUN_LIVE_AGENT_TESTS=true and ANTHROPIC_API_KEY in .env.test',
      );
    }
  });

  it.skipIf(!runLive)(
    'Pipeline 3: streamV2 (v2 architecture) — live Anthropic',
    async () => {
      const { streamV2 } = await import('@/lib/agents/coordinator-v2');
      const files = loadThemeFiles();

      const contentChunks: string[] = [];
      const toolEvents: Array<{ type: string; name: string; id: string }> = [];
      const progressEvents: Array<Record<string, unknown>> = [];
      let firstChunkAt = 0;

      console.log('\n========================================');
      console.log('PIPELINE 3: streamV2 (v2 architecture)');
      console.log('Prompt:', PROMPT);
      console.log('Files in context:', files.length);
      console.log('========================================\n');

      const t0 = Date.now();

      const result = await streamV2(
        'h2h-v2-' + Date.now(),
        '00000000-0000-0000-0000-000000000099',
        'h2h-user',
        PROMPT,
        files,
        [],
        {
          intentMode: 'ask',
          onProgress: (ev) => {
            progressEvents.push(ev);
            if (ev.type === 'thinking') console.log('[progress]', ev.label);
          },
          onContentChunk: (chunk) => {
            if (contentChunks.length === 0) firstChunkAt = Date.now() - t0;
            contentChunks.push(chunk);
          },
          onToolEvent: (ev) => {
            toolEvents.push(ev);
            if (ev.type === 'tool_start') console.log('[tool_start]', ev.name);
            if (ev.type === 'tool_call') console.log('[tool_call]', ev.name);
          },
        },
      );

      const elapsed = Date.now() - t0;
      const fullResponse = contentChunks.join('');
      const toolNames = [...new Set(toolEvents.filter(e => e.type === 'tool_call').map(e => e.name))];

      // Extract usage from v2 result
      const v2Usage = result.usage;
      const totalInput = v2Usage?.totalInputTokens ?? 0;
      const totalOutput = v2Usage?.totalOutputTokens ?? 0;
      const v2Model = v2Usage?.model ?? 'unknown';
      const v2Tier = v2Usage?.tier ?? 'unknown';
      const cost = estimateCostUSD(v2Model, totalInput, totalOutput);

      scores.push({
        pipeline: 'streamV2 (v2 architecture)',
        success: result.success,
        totalTimeMs: elapsed,
        firstChunkMs: firstChunkAt,
        responseChars: fullResponse.length,
        changesCount: result.changes?.length ?? 0,
        toolCallsCount: toolEvents.filter(e => e.type === 'tool_call').length,
        toolsUsed: toolNames,
        inputTokens: totalInput,
        outputTokens: totalOutput,
        estimatedCostUSD: cost,
        tier: v2Tier,
        model: v2Model,
      });

      console.log('\n--- Cost Breakdown (v2) ---');
      console.log(`  Tier: ${v2Tier}`);
      console.log(`  Model: ${v2Model}`);
      console.log(`  Provider: ${v2Usage?.provider ?? 'unknown'}`);
      console.log(`  Tokens: ${totalInput}in / ${totalOutput}out`);
      console.log(`  Cost: ${formatCost(cost)}`);
      console.log('---');
      console.log('Time to first chunk:', firstChunkAt, 'ms');
      console.log('Response (first 1000 chars):');
      console.log(fullResponse.slice(0, 1000));
      console.log('========================================\n');

      expect(result.success).toBe(true);
      expect(fullResponse.length).toBeGreaterThan(50);
      expect(fullResponse.toLowerCase()).toMatch(/accessib|a11y|alt|aria|label/);
    },
    300_000,
  );

  it.skipIf(!runLive)(
    'Print final scorecard and write results JSON',
    () => {
      printScorecard();
      writeResultsJson();
      // At least one pipeline should have run
      expect(scores.length).toBeGreaterThan(0);
    },
  );
});
