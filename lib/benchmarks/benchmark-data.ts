/**
 * Benchmark data for the marketing /benchmarks page.
 *
 * Loads results from latest-results.json (written by the v2-live-benchmark
 * test) and transforms them into the shape the UI expects. Every time the
 * benchmark test runs, latest-results.json is overwritten so the marketing
 * page always reflects the latest run after a rebuild.
 *
 * Supports both the legacy flat format and the new contenders-per-scenario format.
 */

import latestResults from './latest-results.json';

// -- Types --

export interface BenchmarkContender {
  key: string;
  name: string;
  model: string;
  success: boolean;
  totalTimeMs: number;
  timeToFirstChunkMs: number;
  toolCallCount: number;
  toolsUsed: string[];
  changesProduced: number;
  filesCreated: number;
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheWrite: number;
  estimatedCostUSD: number;
  tier?: string;
  features: string[];
  reviewTimeMs?: number;
  thinkingTimeMs?: number;
  streamFallbackMs?: number;
  error?: string;
  /** Min/max across runs (when averaged). Shown as dots + line on comparison bars. */
  totalTimeMsLow?: number;
  totalTimeMsHigh?: number;
  timeToFirstChunkMsLow?: number;
  timeToFirstChunkMsHigh?: number;
  estimatedCostUSDLow?: number;
  estimatedCostUSDHigh?: number;
}

export interface BenchmarkScenario {
  key: string;
  name: string;
  description: string;
  prompt: string;
  contenders: BenchmarkContender[];
}

export interface GapEntry {
  scenario: string;
  metric: string;
  synapseValue: string;
  cursorValue: string;
  delta: string;
  severity: string;
  likelyCause: string;
  recommendation: string;
}

export interface ContenderDefinition {
  key: string;
  name: string;
  runner: string;
  model: string;
  features: string[];
}

export interface BenchmarkData {
  timestamp: string;
  /** Number of runs per (scenario, contender) that were averaged. Undefined for legacy single-run data. */
  runsPerPrompt?: number;
  features: string[];
  contenderDefinitions: ContenderDefinition[];
  scenarios: BenchmarkScenario[];
  gapAnalysis: GapEntry[];
}

// -- Intent-mode to description mapping --

const MODE_DESCRIPTIONS: Record<string, string> = {
  ask: 'Knowledge question answered using file context and tool exploration.',
  code: 'Code generation or modification task with file changes.',
  debug: 'Diagnostic investigation to identify and fix a bug.',
};

// -- Raw types from latest-results.json --

interface RawContenderResult {
  name?: string;
  success: boolean;
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
  filesCreated?: number;
  thinkingN: number;
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

interface RawScenario {
  name: string;
  intentMode: string;
  prompt: string;
  files: string[];
  contenders?: Record<string, RawContenderResult>;
  // Legacy flat fields
  success?: boolean;
  responseText?: string;
  totalTimeMs?: number;
  firstChunkMs?: number;
  model?: string;
  tier?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheRead?: number;
  cacheWrite?: number;
  costUSD?: number;
  toolCalls?: number;
  toolsUsed?: string[];
  changes?: number;
  thinkingN?: number;
  baseline?: RawContenderResult;
}

// -- Helpers --

function isSynapse(c: BenchmarkContender): boolean {
  return c.key === 'synapse' || c.name.includes('Synapse');
}

function mapContender(key: string, c: RawContenderResult, fallbackFeatures?: string[]): BenchmarkContender {
  return {
    key,
    name: c.name ?? key,
    model: c.model,
    success: c.success,
    totalTimeMs: c.totalTimeMs,
    timeToFirstChunkMs: c.firstChunkMs,
    toolCallCount: c.toolCalls,
    toolsUsed: c.toolsUsed ?? [],
    changesProduced: c.changes,
    filesCreated: c.filesCreated ?? 0,
    inputTokens: c.inputTokens,
    outputTokens: c.outputTokens,
    cacheRead: c.cacheRead ?? 0,
    cacheWrite: c.cacheWrite ?? 0,
    estimatedCostUSD: c.costUSD,
    tier: c.tier,
    features: c.features ?? fallbackFeatures ?? [],
    reviewTimeMs: c.reviewTimeMs,
    thinkingTimeMs: c.thinkingTimeMs,
    streamFallbackMs: c.streamFallbackMs,
    totalTimeMsLow: c.totalTimeMsLow,
    totalTimeMsHigh: c.totalTimeMsHigh,
    timeToFirstChunkMsLow: c.firstChunkMsLow,
    timeToFirstChunkMsHigh: c.firstChunkMsHigh,
    estimatedCostUSDLow: c.costUSDLow,
    estimatedCostUSDHigh: c.costUSDHigh,
  };
}

// -- Transform latest-results.json into BenchmarkData --

function buildBenchmarkData(): BenchmarkData {
  const raw = latestResults as {
    timestamp: string;
    runsPerPrompt?: number;
    features?: string[];
    contenderDefinitions?: ContenderDefinition[];
    scenarios: Record<string, RawScenario>;
    gapAnalysis?: GapEntry[];
  };

  const scenarios: BenchmarkScenario[] = Object.entries(raw.scenarios).map(
    ([key, sc]) => {
      const contenders: BenchmarkContender[] = [];

      if (sc.contenders && typeof sc.contenders === 'object' && !Array.isArray(sc.contenders)) {
        // New format: contenders object per scenario
        for (const [cKey, c] of Object.entries(sc.contenders)) {
          contenders.push(mapContender(cKey, c));
        }
      } else {
        // Legacy flat format (backward compat with old latest-results.json)
        const legacy = sc as any;
        contenders.push({
          key: 'synapse',
          name: 'Synapse',
          model: legacy.model ?? 'unknown',
          success: legacy.success ?? false,
          totalTimeMs: legacy.totalTimeMs ?? 0,
          timeToFirstChunkMs: legacy.firstChunkMs ?? 0,
          toolCallCount: legacy.toolCalls ?? 0,
          toolsUsed: legacy.toolsUsed ?? [],
          changesProduced: legacy.changes ?? 0,
          filesCreated: legacy.filesCreated ?? 0,
          inputTokens: legacy.inputTokens ?? 0,
          outputTokens: legacy.outputTokens ?? 0,
          cacheRead: legacy.cacheRead ?? 0,
          cacheWrite: legacy.cacheWrite ?? 0,
          estimatedCostUSD: legacy.costUSD ?? 0,
          tier: legacy.tier,
          features: raw.features ?? [],
        });

        if (legacy.baseline) {
          contenders.push(mapContender('baseline', legacy.baseline));
        }
      }

      return {
        key,
        name: sc.name,
        description:
          MODE_DESCRIPTIONS[sc.intentMode] ??
          'Benchmark scenario against real Shopify theme files.',
        prompt: sc.prompt,
        contenders,
      };
    },
  );

  return {
    timestamp: raw.timestamp,
    runsPerPrompt: raw.runsPerPrompt,
    features: raw.features ?? [],
    contenderDefinitions: raw.contenderDefinitions ?? [],
    scenarios,
    gapAnalysis: raw.gapAnalysis ?? [],
  };
}

export const BENCHMARK_DATA: BenchmarkData = buildBenchmarkData();

// -- Derived headline stats --

export const HEADLINE_SCENARIOS_PASSED = BENCHMARK_DATA.scenarios.filter((s) =>
  s.contenders.find((c) => isSynapse(c))?.success,
).length;

export const HEADLINE_SCENARIO_COUNT = BENCHMARK_DATA.scenarios.length;

export const HEADLINE_AVG_TOOL_CALLS = (() => {
  const syns = BENCHMARK_DATA.scenarios
    .map((s) => s.contenders.find((c) => isSynapse(c)))
    .filter((c): c is BenchmarkContender => !!c?.success);
  if (syns.length === 0) return 0;
  return Math.round(
    syns.reduce((sum, c) => sum + c.toolCallCount, 0) / syns.length,
  );
})();

export const HEADLINE_SYNAPSE_TIMEOUTS = BENCHMARK_DATA.scenarios.reduce(
  (n, s) => {
    const syn = s.contenders.find((c) => isSynapse(c));
    return n + (syn && !syn.success ? 1 : 0);
  },
  0,
);

export const HEADLINE_CHEAPEST_COST = (() => {
  let min = Infinity;
  for (const s of BENCHMARK_DATA.scenarios) {
    for (const c of s.contenders) {
      if (c.success && c.estimatedCostUSD > 0 && c.estimatedCostUSD < min) {
        min = c.estimatedCostUSD;
      }
    }
  }
  return min === Infinity ? 0 : min;
})();

export const HEADLINE_CACHE_HIT_RATE = (() => {
  let totalIn = 0;
  let totalCacheRead = 0;
  for (const s of BENCHMARK_DATA.scenarios) {
    const syn = s.contenders.find((c) => isSynapse(c));
    if (syn?.success) {
      totalIn += syn.inputTokens;
      totalCacheRead += syn.cacheRead;
    }
  }
  const denom = totalIn + totalCacheRead;
  return denom > 0 ? Math.round((totalCacheRead / denom) * 100) : 0;
})();

/** Number of unique models run across all contenders (for hero copy). */
export const HEADLINE_UNIQUE_MODELS = (() => {
  const models = new Set<string>();
  for (const s of BENCHMARK_DATA.scenarios) {
    for (const c of s.contenders) {
      if (c.model) models.add(c.model);
    }
  }
  return models.size;
})();

/** Runs per prompt used for this benchmark (from v2-live-benchmark). Undefined for legacy single-run data. */
export const HEADLINE_RUNS_PER_PROMPT = BENCHMARK_DATA.runsPerPrompt;

export const HEADLINE_FEATURES = BENCHMARK_DATA.features;
