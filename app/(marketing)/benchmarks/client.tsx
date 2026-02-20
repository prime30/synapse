'use client';
import { Fragment, useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { GridDivider } from '@/components/marketing/grid/GridDivider';
import { GlassCard, GlowText } from '@/components/marketing/glass';
import { PixelWatermark } from '@/components/marketing/textures';
import { SynapseLogo } from '@/components/marketing/nav/SynapseLogo';
import {
  BENCHMARK_DATA,
  HEADLINE_SCENARIOS_PASSED,
  HEADLINE_SCENARIO_COUNT,
  HEADLINE_AVG_TOOL_CALLS,
  HEADLINE_CHEAPEST_COST,
  HEADLINE_CACHE_HIT_RATE,
  HEADLINE_UNIQUE_MODELS,
  HEADLINE_RUNS_PER_PROMPT,
  type BenchmarkScenario,
  type BenchmarkContender,
} from '@/lib/benchmarks/benchmark-data';

// ── Constants ───────────────────────────────────────────────────────────────

const EASE = [0.22, 1, 0.36, 1] as const;

/** Displayed runs-per-prompt: from latest-results.json when averaged, else fallback for legacy data. */
const RUNS_PER_PROMPT = HEADLINE_RUNS_PER_PROMPT ?? 3;

const SCENARIO_ICONS: Record<string, string> = {
  build: '+',
  modify: '</>',
  debug: 'BUG',
  'ask-a11y': 'A11Y',
  'code-lazy': '</>',
  'code-section': '+',
  'code-disclaimer': 'DOC',
  'ask-followup': '?',
  'trivial-color': 'CSS',
  'simple-ask': 'A11Y',
  'complex-section': '+',
  'arch-rebuild': 'ARC',
  'compound-quickview': 'MT',
  'crossfile-consistency': 'XF',
};

function iconForScenario(key: string): string {
  if (SCENARIO_ICONS[key]) return SCENARIO_ICONS[key];
  if (key.startsWith('ask')) return '?';
  if (key.startsWith('code')) return '</>';
  if (key.startsWith('debug')) return 'BUG';
  return '#';
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatMs(ms: number): string {
  if (ms === 0) return '—';
  if (ms < 1_000) return `${ms}ms`;
  return `${(ms / 1_000).toFixed(1)}s`;
}

function pctOf(value: number, max: number): number {
  if (max === 0) return 0;
  return Math.min(100, Math.max(2, (value / max) * 100));
}

function formatCost(usd: number): string {
  if (usd === 0) return '—';
  if (usd < 0.01) return `<$0.01`;
  return `$${usd.toFixed(2)}`;
}
function delta(a: number, b: number): string {
  if (a === 0 || b === 0) return '—';
  const d = ((b - a) / a) * 100;
  const sign = d > 0 ? '+' : '';
  return `${sign}${d.toFixed(0)}%`;
}

// ── Animated Counter ────────────────────────────────────────────────────────

function AnimatedStat({
  value,
  suffix,
  label,
  delay = 0,
}: {
  value: number;
  suffix: string;
  label: string;
  delay?: number;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });

  return (
    <motion.div
      ref={ref}
      className="text-center"
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: EASE }}
    >
      <div className="text-4xl md:text-5xl font-semibold text-accent tracking-tight">
        <motion.span
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 0.8, delay: delay + 0.2 }}
        >
          {value}
        </motion.span>
        <span className="text-2xl md:text-3xl">{suffix}</span>
      </div>
      <p className="mt-2 text-sm text-stone-500 dark:text-white/50">{label}</p>
    </motion.div>
  );
}

// ── Comparison Bar ──────────────────────────────────────────────────────────

function stripModel(name: string): string {
  const base = name.replace(/\s*\(.*?\)\s*$/, '').replace(/\s+v\d+$/i, '');
  if (base === 'Baseline') return 'Baseline API';
  return base;
}

const CONTENDER_ORDER: Record<string, number> = { synapse: 0, cursor: 1, baseline: 2 };

function sortContenders(contenders: BenchmarkContender[]): BenchmarkContender[] {
  return [...contenders].sort(
    (a, b) => (CONTENDER_ORDER[a.key] ?? 9) - (CONTENDER_ORDER[b.key] ?? 9),
  );
}

function ComparisonBar({
  contender,
  value,
  maxValue,
  low,
  high,
  label,
  isWinner,
  delay = 0,
}: {
  contender: BenchmarkContender;
  value: number;
  maxValue: number;
  /** Min value across runs (for range dots + line). */
  low?: number;
  /** Max value across runs (for range dots + line). */
  high?: number;
  label: string;
  isWinner: boolean;
  delay?: number;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-20px' });
  const displayName = stripModel(contender.name);

  if (!contender.success) {
    return (
      <div ref={ref} className="flex items-center gap-3 py-1.5">
        <span className="w-24 md:w-32 text-xs md:text-sm text-stone-500 dark:text-white/50 truncate">
          {displayName}
        </span>
        <div className="flex-1 relative h-7 rounded-md border-2 border-dashed border-red-300 dark:border-red-500/30 flex items-center justify-center">
          <span className="text-xs font-medium text-red-600 dark:text-red-400">
            Timed Out
          </span>
        </div>
      </div>
    );
  }

  // Reserve right side for time + WINNER badge so the bar never covers them.
  const RESERVE_RIGHT_PCT = 24;
  const fillablePct = 100 - RESERVE_RIGHT_PCT;

  const valuePct = pctOf(value, maxValue);
  const hasRange = low != null && high != null && maxValue > 0 && low <= high;
  const lowPct = hasRange ? Math.min(100, pctOf(low, maxValue)) : 0;
  const highPct = hasRange ? Math.min(100, pctOf(high, maxValue)) : 0;

  // Bar "full" width = average (value) only, so the bar end is always between the low and high dots.
  const barWidthPct = fillablePct * (valuePct / 100);

  // Position range line and dots within the fillable area so they never overlap the badge.
  const lowScaled = (lowPct / 100) * fillablePct;
  const highScaled = (highPct / 100) * fillablePct;
  const rangeWidthPct = Math.max(highScaled - lowScaled, 0.5);

  return (
    <div ref={ref} className="group py-2 rounded-md px-1 -mx-1 hover:bg-stone-50 dark:hover:bg-white/[0.04] transition-colors">
      {/* Name + value row */}
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-xs md:text-sm text-stone-500 dark:text-white/50 group-hover:text-stone-900 dark:group-hover:text-white transition-colors truncate">
          {displayName}
        </span>
        <span className="flex items-center gap-1.5 shrink-0">
          <span
            className={`text-xs font-medium tabular-nums ${
              isWinner
                ? 'text-stone-900 dark:text-white'
                : 'text-stone-500 dark:text-white/50'
            }`}
          >
            {label}
          </span>
          {isWinner && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-accent/10 text-accent border border-accent/20">
              Winner
            </span>
          )}
        </span>
      </div>
      {/* Bar track */}
      <div className="relative h-3 overflow-visible">
        <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-px bg-stone-200 dark:bg-white/10" />
        <motion.div
          className={`absolute top-1/2 -translate-y-1/2 left-0 h-[3px] rounded-full ${
            isWinner
              ? 'bg-accent group-hover:bg-accent-hover'
              : 'bg-stone-300 dark:bg-white/20 group-hover:bg-stone-400 dark:group-hover:bg-white/30'
          }`}
          initial={{ width: 0 }}
          animate={inView ? { width: `${barWidthPct}%` } : {}}
          transition={{ duration: 0.8, delay, ease: EASE }}
        />
        <motion.span
          className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rounded-full border-2 z-10 ${
            isWinner
              ? 'bg-accent border-accent group-hover:border-accent-hover'
              : 'bg-stone-400 dark:bg-white/30 border-stone-400 dark:border-white/30'
          }`}
          initial={{ left: '0%', opacity: 0 }}
          animate={inView ? { left: `${barWidthPct}%`, opacity: 1 } : {}}
          transition={{ duration: 0.8, delay, ease: EASE }}
        />
        {hasRange && (
          <>
            <div
              className="absolute top-1/2 -translate-y-1/2 h-px bg-stone-400 dark:bg-white/30 pointer-events-none z-[5]"
              style={{ left: `${lowScaled}%`, width: `${rangeWidthPct}%` }}
              aria-hidden
            />
            <span
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-stone-500 dark:bg-white/50 pointer-events-none z-[5]"
              style={{ left: `${lowScaled}%` }}
              aria-hidden
            />
            <span
              className="absolute top-1/2 -translate-y-1/2 translate-x-1/2 w-1.5 h-1.5 rounded-full bg-stone-500 dark:bg-white/50 pointer-events-none z-[5]"
              style={{ left: `${highScaled}%` }}
              aria-hidden
            />
          </>
        )}
      </div>
      <span className="sr-only">
        {contender.name}: {label}
        {hasRange ? ` (range ${low}–${high})` : ''}
      </span>
    </div>
  );
}

// ── Segment Bar (horizontal bar filled with vertical line segments) ──────────

const SEGMENT_COUNT = 24;

function SegmentBar({
  contender,
  value,
  maxValue,
  label,
  isWinner,
  delay = 0,
}: {
  contender: BenchmarkContender;
  value: number;
  maxValue: number;
  low?: number;
  high?: number;
  label: string;
  isWinner: boolean;
  delay?: number;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-20px' });
  const displayName = stripModel(contender.name);

  const fillPct = maxValue > 0 ? Math.min(100, (value / maxValue) * 100) : 0;
  const litSegments = Math.round((fillPct / 100) * SEGMENT_COUNT);

  if (!contender.success) {
    return (
      <div ref={ref} className="group py-2">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <span className="text-xs text-stone-500 dark:text-white/50 truncate">{displayName}</span>
          <span className="text-[10px] text-red-500 dark:text-red-400 font-medium">Timed Out</span>
        </div>
        <div className="flex gap-[2px]">
          {Array.from({ length: SEGMENT_COUNT }).map((_, i) => (
            <div key={i} className="flex-1 h-6 rounded-sm border border-dashed border-red-300/30 dark:border-red-500/15" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className="group py-2">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-xs text-stone-500 dark:text-white/50 group-hover:text-stone-900 dark:group-hover:text-white transition-colors truncate">
          {displayName}
        </span>
        <span className="flex items-center gap-1.5 shrink-0">
          <span
            className={`text-xs font-medium tabular-nums ${
              isWinner ? 'text-stone-900 dark:text-white' : 'text-stone-500 dark:text-white/50'
            }`}
          >
            {label}
          </span>
          {isWinner && (
            <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider bg-accent/10 text-accent border border-accent/20">
              Winner
            </span>
          )}
        </span>
      </div>
      <div className="flex gap-[2px]">
        {Array.from({ length: SEGMENT_COUNT }).map((_, i) => {
          const isLit = i < litSegments;
          return (
            <motion.div
              key={i}
              className={`flex-1 h-6 rounded-sm ${
                isLit
                  ? isWinner
                    ? 'bg-accent group-hover:bg-accent-hover'
                    : 'bg-stone-400 dark:bg-white/25 group-hover:bg-stone-500 dark:group-hover:bg-white/35'
                  : 'bg-stone-100 dark:bg-white/[0.04]'
              }`}
              initial={{ opacity: 0, scaleY: 0 }}
              animate={inView ? { opacity: 1, scaleY: 1 } : {}}
              transition={{
                duration: 0.15,
                delay: isLit ? delay + i * 0.03 : delay + 0.2,
                ease: EASE,
              }}
              style={{ transformOrigin: 'bottom' }}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── Metric Group (one metric across all contenders) ─────────────────────────

function MetricGroup({
  title,
  scenario,
  getValue,
  formatValue,
  getLow,
  getHigh,
  lowerIsBetter,
  noWinner = false,
  delay = 0,
}: {
  title: string;
  scenario: BenchmarkScenario;
  getValue: (c: BenchmarkContender) => number;
  formatValue: (c: BenchmarkContender) => string;
  getLow?: (c: BenchmarkContender) => number | undefined;
  getHigh?: (c: BenchmarkContender) => number | undefined;
  lowerIsBetter: boolean;
  noWinner?: boolean;
  delay?: number;
}) {
  const successContenders = scenario.contenders.filter((c) => c.success);
  const values = successContenders.map(getValue);
  const bestValue = lowerIsBetter ? Math.min(...values) : Math.max(...values);
  const maxValue = Math.max(...values);

  if (noWinner) {
    return (
      <div className="mb-4 mt-2 pt-3 border-t border-dashed border-stone-200 dark:border-white/5">
        <h4 className="text-[10px] font-medium uppercase tracking-wider text-stone-300 dark:text-white/20 mb-1.5">
          {title}
        </h4>
        <div className="flex flex-wrap gap-x-6 gap-y-0.5">
          {sortContenders(scenario.contenders).map((c) => (
            <span key={c.name} className="text-[11px] text-stone-400 dark:text-white/30">
              {stripModel(c.name)}{' '}
              <span className="font-mono">{c.success ? formatValue(c) : '—'}</span>
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-white/30 mb-3">
        {title}
      </h4>
      <div
        role="img"
        aria-label={`${title} comparison: ${scenario.contenders
          .map((c) => `${c.name} ${formatValue(c)}`)
          .join(', ')}`}
      >
        {sortContenders(scenario.contenders).map((c, i) => (
          <SegmentBar
            key={c.name}
            contender={c}
            value={getValue(c)}
            maxValue={maxValue}
            low={getLow?.(c)}
            high={getHigh?.(c)}
            label={formatValue(c)}
            isWinner={c.success && getValue(c) === bestValue}
            delay={delay + i * 0.1}
          />
        ))}
      </div>
    </div>
  );
}

// ── Delta Badge ─────────────────────────────────────────────────────────────

function DeltaBadge({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive: boolean;
}) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
        positive
          ? 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-500/20 hover:bg-green-100 dark:hover:bg-green-500/15'
          : 'bg-stone-100 dark:bg-white/5 text-stone-600 dark:text-white/50 border border-stone-200 dark:border-white/10 hover:bg-stone-200 dark:hover:bg-white/10'
      }`}
    >
      <span className="text-stone-400 dark:text-white/30">{label}</span>
      <span>{value}</span>
    </div>
  );
}

// ── Tool Pills ──────────────────────────────────────────────────────────────

function ToolPills({ tools }: { tools: string[] }) {
  if (tools.length === 0) return <span className="text-[11px] text-stone-400 dark:text-white/30">No tools used</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {tools.map((tool) => (
        <span
          key={tool}
          className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-stone-100 dark:bg-white/5 text-stone-600 dark:text-gray-400 border border-stone-200 dark:border-white/10 hover:bg-stone-200 dark:hover:bg-white/10 hover:text-stone-900 dark:hover:text-white transition-colors truncate max-w-[10rem]"
        >
          {tool}
        </span>
      ))}
    </div>
  );
}

// ── Scenario Card ───────────────────────────────────────────────────────────

function ScenarioCard({
  scenario,
  index,
}: {
  scenario: BenchmarkScenario;
  index: number;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  const synapseContenders = scenario.contenders.filter((c) => c.key === 'synapse' || c.name.includes('Synapse'));
  const otherContenders = scenario.contenders.filter((c) => c.key !== 'synapse' && !c.name.includes('Synapse'));
  const bestSynapse = [...synapseContenders].filter((c) => c.success).sort((a, b) => a.totalTimeMs - b.totalTimeMs)[0];
  const bestOther = [...otherContenders].filter((c) => c.success).sort((a, b) => a.totalTimeMs - b.totalTimeMs)[0];
  const cheapest = [...scenario.contenders].filter((c) => c.success && c.estimatedCostUSD > 0).sort((a, b) => a.estimatedCostUSD - b.estimatedCostUSD)[0];

  const timeDelta = bestSynapse && bestOther ? delta(bestOther.totalTimeMs, bestSynapse.totalTimeMs) : '—';
  const isTimeFaster = bestSynapse && bestOther && bestSynapse.totalTimeMs < bestOther.totalTimeMs;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay: index * 0.15, ease: EASE }}
    >
      <GlassCard theme="light" padding="lg" hoverGlow className="border border-stone-200 dark:border-white/5">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-stone-100 dark:bg-white/5 text-sm font-mono font-bold text-stone-600 dark:text-gray-400 border border-stone-200 dark:border-white/10">
                {iconForScenario(scenario.key)}
              </span>
              <h3 className="text-lg font-semibold text-stone-900 dark:text-white">
                {scenario.name}
              </h3>
            </div>
            <p className="text-sm text-stone-500 dark:text-white/50 max-w-lg">
              {scenario.description}
            </p>
          </div>
        </div>

        {/* Prompt */}
        <div className="mb-6 p-3 rounded-lg bg-stone-50 dark:bg-white/[0.02] border border-stone-200 dark:border-white/5">
          <p className="text-xs font-mono text-stone-600 dark:text-gray-400 leading-relaxed">
            &quot;{scenario.prompt}&quot;
          </p>
        </div>

        {/* Comparison bars */}
        <MetricGroup
          title="Total Time"
          scenario={scenario}
          getValue={(c) => c.totalTimeMs}
          formatValue={(c) => (c.success ? formatMs(c.totalTimeMs) : 'Timed Out')}
          getLow={(c) => c.totalTimeMsLow}
          getHigh={(c) => c.totalTimeMsHigh}
          lowerIsBetter
          delay={index * 0.1}
        />

        <MetricGroup
          title="Time to First Chunk"
          scenario={scenario}
          getValue={(c) => c.timeToFirstChunkMs}
          formatValue={(c) => (c.success ? formatMs(c.timeToFirstChunkMs) : '—')}
          getLow={(c) => c.timeToFirstChunkMsLow}
          getHigh={(c) => c.timeToFirstChunkMsHigh}
          lowerIsBetter
          delay={index * 0.1 + 0.15}
        />

        <MetricGroup
          title="Tool Calls"
          scenario={scenario}
          getValue={(c) => c.toolCallCount}
          formatValue={(c) => String(c.toolCallCount)}
          lowerIsBetter
          delay={index * 0.1 + 0.3}
        />

        <MetricGroup
          title="Estimated Cost"
          scenario={scenario}
          getValue={(c) => c.estimatedCostUSD}
          formatValue={(c) => (c.success ? formatCost(c.estimatedCostUSD) : '—')}
          getLow={(c) => c.estimatedCostUSDLow}
          getHigh={(c) => c.estimatedCostUSDHigh}
          lowerIsBetter
          delay={index * 0.1 + 0.35}
        />

        {scenario.contenders.some((c) => c.changesProduced > 0 || c.filesCreated > 0) && (
          <div className="mb-4 mt-2 pt-3 border-t border-dashed border-stone-200 dark:border-white/5">
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              {sortContenders(scenario.contenders).map((c) => {
                const edits = c.changesProduced - c.filesCreated;
                const parts = [
                  edits > 0 ? `${edits} edit${edits !== 1 ? 's' : ''}` : null,
                  c.filesCreated > 0 ? `${c.filesCreated} new file${c.filesCreated !== 1 ? 's' : ''}` : null,
                ].filter(Boolean);
                return (
                  <span key={c.name} className="text-[11px] text-stone-400 dark:text-white/30">
                    {stripModel(c.name)}{' '}
                    <span className="font-mono">
                      {c.success ? (parts.length > 0 ? parts.join(', ') : '0 changes') : '—'}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Delta badges */}
        <div className="flex flex-wrap gap-2 mt-4 mb-5">
          {bestSynapse && (bestSynapse.reviewTimeMs || bestSynapse.thinkingTimeMs) && (
            <DeltaBadge
              label="Includes:"
              value={[
                bestSynapse.reviewTimeMs ? `${formatMs(bestSynapse.reviewTimeMs)} review` : '',
                bestSynapse.thinkingTimeMs ? `${formatMs(bestSynapse.thinkingTimeMs)} thinking` : '',
              ].filter(Boolean).join(' + ')}
              positive={false}
            />
          )}
          {bestOther && (
            <DeltaBadge
              label="Synapse vs Alt:"
              value={timeDelta}
              positive={!!isTimeFaster}
            />
          )}
          {cheapest && (
            <DeltaBadge
              label="Cheapest:"
              value={`${cheapest.name} ${formatCost(cheapest.estimatedCostUSD)}`}
              positive
            />
          )}
          {bestSynapse?.success && bestOther?.success && (
            <DeltaBadge
              label="Synapse vs Alt cost:"
              value={delta(bestOther.estimatedCostUSD, bestSynapse.estimatedCostUSD)}
              positive={bestSynapse.estimatedCostUSD < bestOther.estimatedCostUSD}
            />
          )}
          {bestSynapse?.success && bestSynapse.tier && (
            <DeltaBadge
              label="Tier:"
              value={bestSynapse.tier}
              positive={false}
            />
          )}
        </div>

        {/* Tool sequences */}
        <div className="border-t border-stone-200 dark:border-white/5 pt-4 space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-white/30">
            Tools Used
          </h4>
          {sortContenders(scenario.contenders).map((c) => (
            <div key={c.name} className="space-y-1">
              <span className="text-xs text-stone-500 dark:text-white/50 font-medium">
                {stripModel(c.name)}
              </span>
              <ToolPills tools={c.toolsUsed} />
            </div>
          ))}
        </div>
      </GlassCard>
    </motion.div>
  );
}

// ── Synapse Flow Diagram ─────────────────────────────────────────────────────

/** Specialists the PM can delegate to (run_specialist). Same set per tier; model differs. */
const SPECIALIST_ROLES: { name: string; specialty: string }[] = [
  { name: 'Liquid', specialty: 'templates' },
  { name: 'CSS', specialty: 'styling' },
  { name: 'JavaScript', specialty: 'logic' },
  { name: 'JSON', specialty: 'schema' },
];

const FLOW_TIERS = [
  {
    tier: 'TRIVIAL / SIMPLE',
    color: 'border-green-400 dark:border-green-500/40',
    dotColor: 'bg-green-500',
    pm: 'Haiku 4.5',
    specialist: null,
    reviewer: 'Skip',
    specialists: [],
    note: 'Solo agent path — fast single-pass edits, no specialist delegation',
  },
  {
    tier: 'COMPLEX',
    color: 'border-amber-400 dark:border-amber-500/40',
    dotColor: 'bg-amber-500',
    pm: 'Sonnet 4.6',
    specialist: 'Opus 4.6',
    reviewer: 'Opus 4.6',
    specialists: SPECIALIST_ROLES,
    note: 'Extended thinking, PTC sandbox, auto-review gate',
  },
  {
    tier: 'ARCHITECTURAL',
    color: 'border-red-400 dark:border-red-500/40',
    dotColor: 'bg-red-500',
    pm: 'Sonnet 4.6',
    specialist: 'Opus 4.6',
    reviewer: 'Opus 4.6',
    specialists: SPECIALIST_ROLES,
    note: 'Full file indexing, deep review, max thinking budget',
  },
];

function SynapseFlowDiagram() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <div className="mb-16">
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 16 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.5, ease: EASE }}
      >
        <h3 className="text-lg font-semibold text-stone-900 dark:text-white mb-2">
          Multi-Agent Decision Flow
        </h3>
        <p className="text-sm text-stone-500 dark:text-white/50 mb-8 max-w-2xl">
          Every request flows through a four-stage pipeline. The classifier determines
          complexity, then the system branches to the optimal model combination per tier.
        </p>

        {/* Classifier entry point */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={inView ? { opacity: 1, scale: 1 } : {}}
          transition={{ duration: 0.4, ease: EASE }}
          className="flex justify-center mb-2"
        >
          <div className="inline-flex items-center gap-3 px-5 py-3 rounded-xl bg-accent/5 dark:bg-accent/10 border border-accent/20 dark:border-accent/20 hover:bg-accent/10 dark:hover:bg-accent/15 transition-colors">
            <span className="w-8 h-8 rounded-lg bg-accent/10 dark:bg-accent/20 flex items-center justify-center text-sm font-mono font-bold text-accent dark:text-accent">
              C
            </span>
            <div>
              <span className="text-sm font-semibold text-stone-900 dark:text-white">
                Classifier
              </span>
              <span className="ml-2 px-2 py-0.5 text-[10px] font-mono rounded bg-accent/10 dark:bg-accent/15 text-accent border border-accent/20 dark:border-accent/20">
                Haiku 4.5
              </span>
            </div>
          </div>
        </motion.div>

        {/* Branching arrow */}
        <div className="flex justify-center mb-2">
          <div className="w-px h-6 bg-stone-300 dark:bg-white/15" />
        </div>
        <div className="flex justify-center mb-4">
          <span className="text-[10px] font-mono uppercase tracking-wider text-stone-400 dark:text-white/30">
            routes by complexity
          </span>
        </div>

        {/* Tier branches */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {FLOW_TIERS.map((t, i) => (
            <motion.div
              key={t.tier}
              initial={{ opacity: 0, y: 12 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.4, delay: 0.2 + i * 0.1, ease: EASE }}
              className={`relative p-4 rounded-xl bg-white dark:bg-white/[0.03] border-l-4 ${t.color} border border-stone-200 dark:border-white/5 hover:bg-stone-50 dark:hover:bg-white/[0.05] transition-colors`}
            >
              <div className="flex items-center gap-2 mb-3">
                <span className={`w-2.5 h-2.5 rounded-full ${t.dotColor}`} />
                <span className="text-xs font-bold uppercase tracking-wider text-stone-900 dark:text-white">
                  {t.tier}
                </span>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-stone-500 dark:text-white/40">
                    {t.specialists.length > 0 ? 'Orchestrator' : 'Solo Agent'}
                  </span>
                  <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-stone-100 dark:bg-white/5 text-stone-600 dark:text-gray-400 border border-stone-200 dark:border-white/10">
                    {t.pm}
                  </span>
                </div>
                {t.specialists.length > 0 ? (
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[11px] text-stone-500 dark:text-white/40 shrink-0">
                    Specialists
                  </span>
                  <div className="text-right min-w-0">
                    <div className="flex flex-wrap gap-x-1.5 gap-y-1 justify-end">
                      {t.specialists.map((s) => (
                        <span
                          key={s.name}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded bg-stone-100 dark:bg-white/5 text-stone-600 dark:text-gray-400 border border-stone-200 dark:border-white/10"
                          title={`${s.name}: ${s.specialty}`}
                        >
                          <span className="font-medium">{s.name}</span>
                          <span className="text-stone-400 dark:text-white/30">({s.specialty})</span>
                        </span>
                      ))}
                    </div>
                    <span className="mt-1 inline-block px-1.5 py-0.5 text-[10px] font-mono rounded bg-stone-100 dark:bg-white/5 text-stone-600 dark:text-gray-400 border border-stone-200 dark:border-white/10">
                      {t.specialist}
                    </span>
                  </div>
                </div>
                ) : (
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-stone-500 dark:text-white/40">
                    Specialists
                  </span>
                  <span className="text-[10px] text-stone-300 dark:text-white/20 italic">
                    not used
                  </span>
                </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-stone-500 dark:text-white/40">
                    Reviewer
                  </span>
                  {t.reviewer === 'Skip' ? (
                    <span className="text-[10px] text-stone-300 dark:text-white/20 italic">
                      skipped
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-stone-100 dark:bg-white/5 text-stone-600 dark:text-gray-400 border border-stone-200 dark:border-white/10">
                      {t.reviewer}
                    </span>
                  )}
                </div>
              </div>

              <p className="mt-3 pt-2 border-t border-stone-100 dark:border-white/5 text-[10px] text-stone-400 dark:text-white/30 leading-relaxed">
                {t.note}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Cursor comparison callout */}
        <div className="p-3 rounded-lg bg-stone-50 dark:bg-white/[0.02] border border-stone-200 dark:border-white/5">
          <div className="flex items-start gap-3">
            <span className="text-xs text-stone-400 dark:text-white/30 font-semibold uppercase tracking-wider shrink-0 pt-0.5">
              vs Cursor
            </span>
            <p className="text-xs text-stone-500 dark:text-white/50 leading-relaxed">
              Cursor uses a single generic assistant model for all tasks. No classification
              step, no tier-aware routing, no specialist delegation, and no automated review gate.
              Every request pays the same cost regardless of complexity.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ── Tier Capabilities Section ────────────────────────────────────────────────

const TIER_DATA = [
  {
    tier: 'TRIVIAL',
    color: 'bg-green-500',
    pm: 'Haiku 4.5',
    specialist: '—',
    reviewer: '—',
    specialists: [],
    features: ['Solo agent path', '1 iteration', 'Minimal context', 'Prompt caching'],
    example: 'Change a color value, update text content',
  },
  {
    tier: 'SIMPLE',
    color: 'bg-accent',
    pm: 'Haiku 4.5',
    specialist: '—',
    reviewer: '—',
    specialists: [],
    features: ['Solo agent path', '2 iterations', 'Smart context selection', 'Prompt caching'],
    example: 'Accessibility audit, add a CSS class',
  },
  {
    tier: 'COMPLEX',
    color: 'bg-amber-500',
    pm: 'Sonnet 4.6',
    specialist: 'Opus 4.6',
    reviewer: 'Opus 4.6',
    specialists: SPECIALIST_ROLES,
    features: ['Extended thinking', 'PTC sandbox', 'Auto-review gate', 'Context editing', 'Prompt caching'],
    example: 'Build a new section with schema',
  },
  {
    tier: 'ARCHITECTURAL',
    color: 'bg-red-500',
    pm: 'Sonnet 4.6',
    specialist: 'Opus 4.6',
    reviewer: 'Opus 4.6',
    specialists: SPECIALIST_ROLES,
    features: ['Extended thinking (high)', 'PTC sandbox', 'Auto-review gate', 'Context editing', 'Full file indexing', 'Prompt caching'],
    example: 'Rebuild a template from scratch',
  },
];

function TierCapabilitiesSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <div className="mb-16">
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 16 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.5, ease: EASE }}
      >
        <h3 className="text-lg font-semibold text-stone-900 dark:text-white mb-2">
          Intelligent Model Routing
        </h3>
        <p className="text-sm text-stone-500 dark:text-white/50 mb-6 max-w-2xl">
          Each request is classified by complexity and routed to the right models.
          Simple tasks use fast, cheap models. Complex tasks unlock Opus-level
          reasoning, extended thinking, and automated code review.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 dark:border-white/10">
                <th className="text-left py-3 pr-4 text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-white/30">
                  Tier
                </th>
                <th className="text-left py-3 px-3 text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-white/30">
                  Orchestrator
                </th>
                <th className="text-left py-3 px-3 text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-white/30">
                  Specialists
                </th>
                <th className="text-left py-3 px-3 text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-white/30">
                  Reviewer
                </th>
                <th className="text-left py-3 pl-3 text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-white/30">
                  Capabilities
                </th>
              </tr>
            </thead>
            <tbody>
              {TIER_DATA.map((t, i) => (
                <motion.tr
                  key={t.tier}
                  className="border-b border-stone-100 dark:border-white/5 hover:bg-stone-50 dark:hover:bg-white/[0.03] transition-colors"
                  initial={{ opacity: 0, x: -8 }}
                  animate={inView ? { opacity: 1, x: 0 } : {}}
                  transition={{ duration: 0.3, delay: i * 0.08, ease: EASE }}
                >
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${t.color}`} />
                      <span className="font-semibold text-stone-900 dark:text-white text-xs tracking-wider">
                        {t.tier}
                      </span>
                    </div>
                    <p className="text-[10px] text-stone-400 dark:text-white/30 mt-0.5 pl-4">
                      {t.example}
                    </p>
                  </td>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-stone-100 dark:bg-white/5 text-stone-600 dark:text-gray-400 border border-stone-200 dark:border-white/10">
                      {t.pm}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    {t.specialists.length > 0 ? (
                    <div className="flex flex-col gap-1">
                      <div className="flex flex-wrap gap-1">
                        {t.specialists.map((s) => (
                          <span
                            key={s.name}
                            className="text-[10px] text-stone-600 dark:text-gray-400"
                            title={`${s.name}: ${s.specialty}`}
                          >
                            {s.name} <span className="text-stone-400 dark:text-white/30">({s.specialty})</span>
                          </span>
                        ))}
                      </div>
                      <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-stone-100 dark:bg-white/5 text-stone-600 dark:text-gray-400 border border-stone-200 dark:border-white/10 w-fit">
                        {t.specialist}
                      </span>
                    </div>
                    ) : (
                      <span className="text-stone-300 dark:text-white/20">&mdash;</span>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    {t.reviewer === '—' ? (
                      <span className="text-stone-300 dark:text-white/20">&mdash;</span>
                    ) : (
                      <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-stone-100 dark:bg-white/5 text-stone-600 dark:text-gray-400 border border-stone-200 dark:border-white/10 whitespace-nowrap">
                        {t.reviewer}
                      </span>
                    )}
                  </td>
                  <td className="py-3 pl-3">
                    <div className="flex flex-wrap gap-1">
                      {t.features.map((f) => (
                        <span
                          key={f}
                          className="px-1.5 py-0.5 text-[10px] rounded bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 hover:border-accent/30 transition-colors"
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}

// ── Feature Matrix Section ───────────────────────────────────────────────────

const FEATURE_GROUPS = [
  {
    category: 'Intelligence',
    features: [
      { name: 'Complexity classification', synapse: true, cursor: false },
      { name: 'Tier-aware model routing', synapse: true, cursor: false },
      { name: 'Extended thinking (Sonnet/Opus)', synapse: true, cursor: false },
      { name: 'Programmatic tool calling (PTC)', synapse: true, cursor: false },
      { name: 'Specialist agent delegation', synapse: true, cursor: false },
    ],
  },
  {
    category: 'Quality',
    features: [
      { name: 'Automated code review gate', synapse: true, cursor: false },
      { name: 'Cross-file consistency checks', synapse: true, cursor: false },
      { name: 'Hallucination reduction', synapse: true, cursor: false },
      { name: 'Change-set validation', synapse: true, cursor: false },
    ],
  },
  {
    category: 'Performance',
    features: [
      { name: 'Prompt caching (85%+ hit rate)', synapse: true, cursor: false },
      { name: 'Fast-edit path for simple tasks', synapse: true, cursor: false },
      { name: 'Adaptive context window management', synapse: true, cursor: false },
      { name: 'Multi-provider fallback (Gemini)', synapse: true, cursor: false },
      { name: 'Streaming with push-based delivery', synapse: true, cursor: true },
    ],
  },
  {
    category: 'Cost',
    features: [
      { name: 'Use cheapest model per task', synapse: true, cursor: false },
      { name: 'Iteration limits by complexity', synapse: true, cursor: false },
      { name: 'Cache-first token strategy', synapse: true, cursor: false },
    ],
  },
  {
    category: 'Editor & workflow (Cursor today — we’re closing the gap)',
    features: [
      { name: 'Inline completions (Tab / ghost text)', synapse: true, cursor: true },
      { name: 'Codebase semantic search (@codebase)', synapse: true, cursor: true },
      { name: 'Scoped apply & post-apply validation', synapse: true, cursor: true },
      { name: 'Run terminal commands in-agent', synapse: true, cursor: true },
      { name: 'Checkpoints / in-session revert', synapse: true, cursor: true },
      { name: 'Parallel agents (2x–4x subagents / specialists)', synapse: true, cursor: true },
      { name: 'Native browser / preview for testing', synapse: true, cursor: true },
      { name: 'Lint / diagnostics + fix pass (review agent + post-edit gate)', synapse: true, cursor: true },
      { name: 'Full desktop IDE (VS Code, extensions, debugger)', synapse: false, cursor: true, synapsePlanned: true },
      { name: 'Local theme dev server in same window', synapse: false, cursor: true, synapsePlanned: true },
    ],
  },
];

function FeatureComparisonSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <section className="py-16 md:py-24">
      <div className="max-w-5xl mx-auto px-6 md:px-8 lg:px-10">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 16 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, ease: EASE }}
        >
          <span className="section-badge">ARCHITECTURE</span>
          <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 dark:text-white mt-4 mb-10">
            How Synapse Agents Work
          </h2>

          <SynapseFlowDiagram />
          <TierCapabilitiesSection />

          {/* Feature matrix */}
          <h3 className="text-lg font-semibold text-stone-900 dark:text-white mb-2">
            Capability Matrix
          </h3>
          <p className="text-sm text-stone-500 dark:text-white/50 mb-6 max-w-2xl">
            Side-by-side comparison of architectural capabilities between Synapse
            and Cursor (production). Where Cursor leads today, we’re
            closing the gap — capabilities marked <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-500/10 dark:bg-amber-500/10 border border-amber-500/20">Planned</span> are on our roadmap.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 dark:border-white/10">
                  <th className="text-left py-3 pr-4 text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-white/30">
                    Capability
                  </th>
                  <th className="text-center py-3 px-4 text-xs font-semibold uppercase tracking-wider text-accent">
                    Synapse
                  </th>
                  <th className="text-center py-3 px-4 text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-white/30">
                    Cursor (production)
                  </th>
                </tr>
              </thead>
              <tbody>
                {FEATURE_GROUPS.map((group) => (
                  <Fragment key={group.category}>
                    <tr>
                      <td
                        colSpan={3}
                        className="pt-5 pb-2 text-[10px] font-bold uppercase tracking-widest text-stone-400 dark:text-white/25"
                      >
                        {group.category}
                      </td>
                    </tr>
                    {group.features.map((f) => (
                      <tr
                        key={f.name}
                        className="border-b border-stone-100 dark:border-white/5 hover:bg-stone-50 dark:hover:bg-white/[0.03] transition-colors"
                      >
                        <td className="py-2.5 pr-4 text-stone-600 dark:text-gray-400">
                          {f.name}
                        </td>
                        <td className="text-center py-2.5 px-4">
                          {f.synapse ? (
                            <span className="text-accent font-bold">&#10003;</span>
                          ) : 'synapsePlanned' in f && f.synapsePlanned ? (
                            <span className="text-[10px] font-medium uppercase tracking-wider text-amber-600 dark:text-amber-400" title="On our roadmap">Planned</span>
                          ) : (
                            <span className="text-stone-300 dark:text-white/20">&mdash;</span>
                          )}
                        </td>
                        <td className="text-center py-2.5 px-4">
                          {f.cursor ? (
                            <span className="text-accent font-bold">&#10003;</span>
                          ) : (
                            <span className="text-stone-300 dark:text-white/20">&mdash;</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-[11px] text-stone-400 dark:text-white/30">
            Source: <code className="px-1 py-0.5 rounded bg-stone-100 dark:bg-white/5 text-stone-600 dark:text-gray-400">.cursor/plans/cursor-like-features-plan.md</code> and product roadmap.
          </p>
        </motion.div>
      </div>
    </section>
  );
}

// ── Methodology Section ─────────────────────────────────────────────────────

function MethodologySection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <section className="py-16 md:py-24">
      <div className="max-w-4xl mx-auto px-6 md:px-8 lg:px-10">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 16 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, ease: EASE }}
        >
          <span className="section-badge">METHODOLOGY</span>
          <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 dark:text-white mt-4 mb-6">
            How We Measured
          </h2>

          <div className="space-y-4 text-sm text-stone-600 dark:text-gray-400 leading-relaxed">
            <p>
              All tests ran against real Shopify Liquid theme files from a
              production T4S theme. Each contender received the same prompt,
              file context, tool definitions, and temperature setting (0.7).
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
              <div className="p-4 rounded-lg bg-stone-50 dark:bg-white/[0.02] border border-stone-200 dark:border-white/5 hover:bg-stone-100 dark:hover:bg-white/[0.04] transition-colors">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-white/30 mb-2">
                  Contenders
                </h4>
                <ul className="space-y-1.5 text-sm">
                  <li>
                    <span className="font-medium text-stone-900 dark:text-white">Synapse</span>{' '}
                    — Single-stream tool-calling agent with tier-aware model routing, auto-review, and cost intelligence
                  </li>
                  <li>
                    <span className="font-medium text-stone-900 dark:text-white">Cursor (production)</span>{' '}
                    — Cursor run via Headless CLI with the same prompts and theme context as Synapse
                  </li>
                </ul>
              </div>

              <div className="p-4 rounded-lg bg-stone-50 dark:bg-white/[0.02] border border-stone-200 dark:border-white/5 hover:bg-stone-100 dark:hover:bg-white/[0.04] transition-colors">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-400 dark:text-white/30 mb-2">
                  Environment
                </h4>
                <ul className="space-y-1.5 text-sm">
                  <li>
                    <span className="text-stone-400 dark:text-white/30">Models:</span>{' '}
                    Claude Haiku 4.5, Claude Sonnet 4.6, Claude Opus 4.6
                  </li>
                  <li>
                    <span className="text-stone-400 dark:text-white/30">Date:</span>{' '}
                    February 18, 2026
                  </li>
                  <li>
                    <span className="text-stone-400 dark:text-white/30">Timeout:</span>{' '}
                    180s per contender
                  </li>
                </ul>
              </div>
            </div>

            <p className="mt-4 text-xs text-stone-400 dark:text-white/30">
              {HEADLINE_RUNS_PER_PROMPT != null ? (
                <>
                  Results are averaged over {HEADLINE_RUNS_PER_PROMPT} runs per scenario per contender.
                  LLMs are non-deterministic; variance in timing and tokens is normal.
                </>
              ) : (
                <>
                  Results represent a single snapshot, not a statistical average. For production benchmarks,
                  run the v2-live-benchmark test with BENCHMARK_RUNS_PER_PROMPT=3 to get averaged scores.
                </>
              )}{' '}
              Run on February 18, 2026.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ── Verdict / Winner Summary ─────────────────────────────────────────────────

interface MetricResult {
  metric: string;
  synapseValue: number;
  cursorValue: number;
  synapseFormatted: string;
  cursorFormatted: string;
  winner: 'synapse' | 'cursor' | 'tie';
  lowerIsBetter: boolean;
  advantage: string;
}

interface ScenarioVerdict {
  name: string;
  key: string;
  model: string;
  tier: string;
  metrics: MetricResult[];
  synapseWins: number;
  cursorWins: number;
  overallWinner: 'synapse' | 'cursor' | 'tie';
}

function computeAdvantage(a: number, b: number, lowerIsBetter: boolean): string {
  if (a === 0 || b === 0) return '';
  const ratio = lowerIsBetter ? b / a : a / b;
  if (ratio >= 2) return `${ratio.toFixed(0)}x`;
  const pct = Math.abs(((b - a) / b) * 100);
  return `${pct.toFixed(0)}%`;
}

function buildVerdicts(): ScenarioVerdict[] {
  return BENCHMARK_DATA.scenarios.map((sc) => {
    const syn = sc.contenders.find((c) => c.key === 'synapse');
    const cur = sc.contenders.find((c) => c.key === 'cursor');
    if (!syn?.success || !cur?.success) return null;

    const raw: { metric: string; sv: number; cv: number; sf: string; cf: string; lower: boolean }[] = [
      { metric: 'Total Time', sv: syn.totalTimeMs, cv: cur.totalTimeMs, sf: formatMs(syn.totalTimeMs), cf: formatMs(cur.totalTimeMs), lower: true },
      { metric: 'Time to First Chunk', sv: syn.timeToFirstChunkMs, cv: cur.timeToFirstChunkMs, sf: formatMs(syn.timeToFirstChunkMs), cf: formatMs(cur.timeToFirstChunkMs), lower: true },
      { metric: 'Cost', sv: syn.estimatedCostUSD, cv: cur.estimatedCostUSD, sf: formatCost(syn.estimatedCostUSD), cf: formatCost(cur.estimatedCostUSD), lower: true },
      { metric: 'Tool Calls', sv: syn.toolCallCount, cv: cur.toolCallCount, sf: String(syn.toolCallCount), cf: String(cur.toolCallCount), lower: true },
    ];

    const metrics: MetricResult[] = raw.map((r) => {
      const synBetter = r.lower ? r.sv < r.cv : r.sv > r.cv;
      const curBetter = r.lower ? r.cv < r.sv : r.cv > r.sv;
      const winner: 'synapse' | 'cursor' | 'tie' = synBetter ? 'synapse' : curBetter ? 'cursor' : 'tie';
      const advVal = winner === 'synapse'
        ? computeAdvantage(r.sv, r.cv, r.lower)
        : winner === 'cursor'
          ? computeAdvantage(r.cv, r.sv, r.lower)
          : '';
      return {
        metric: r.metric,
        synapseValue: r.sv,
        cursorValue: r.cv,
        synapseFormatted: r.sf,
        cursorFormatted: r.cf,
        winner,
        lowerIsBetter: r.lower,
        advantage: advVal,
      };
    });

    const synapseWins = metrics.filter((m) => m.winner === 'synapse').length;
    const cursorWins = metrics.filter((m) => m.winner === 'cursor').length;

    return {
      name: sc.name,
      key: sc.key,
      model: syn.model.replace('claude-', '').replace(/-\d{8}$/, ''),
      tier: syn.tier ?? '',
      metrics,
      synapseWins,
      cursorWins,
      overallWinner: synapseWins > cursorWins ? 'synapse' : cursorWins > synapseWins ? 'cursor' : 'tie',
    };
  }).filter((v): v is ScenarioVerdict => v !== null);
}

function VerdictSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const verdicts = buildVerdicts();

  const totalSynapseWins = verdicts.reduce((n, v) => n + (v.overallWinner === 'synapse' ? 1 : 0), 0);
  const totalCursorWins = verdicts.reduce((n, v) => n + (v.overallWinner === 'cursor' ? 1 : 0), 0);
  const overallWinner = totalSynapseWins >= totalCursorWins ? 'Synapse' : 'Cursor (production)';

  return (
    <section className="py-16 md:py-24">
      <div className="max-w-5xl mx-auto px-6 md:px-8 lg:px-10">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, ease: EASE }}
        >
          {/* Overall winner banner */}
          <div className="text-center mb-12">
            <span className="section-badge">VERDICT</span>
            <h2 className="mt-4 text-2xl md:text-3xl font-semibold text-stone-900 dark:text-white">
              {overallWinner} wins {totalSynapseWins}/{verdicts.length} scenarios
            </h2>
            <p className="mt-2 text-sm text-stone-500 dark:text-white/50 max-w-xl mx-auto">
              Both agents used the exact same model per tier. The difference is
              architecture: orchestration, routing, caching, and review.
            </p>
          </div>

          {/* Scenario verdict cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {verdicts.map((v, i) => (
              <motion.div
                key={v.key}
                initial={{ opacity: 0, y: 12 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.4, delay: i * 0.1, ease: EASE }}
                className={`p-5 rounded-xl border transition-colors ${
                  v.overallWinner === 'synapse'
                    ? 'bg-accent/[0.03] dark:bg-accent/[0.05] border-accent/20 dark:border-accent/15 hover:bg-accent/[0.07] dark:hover:bg-accent/[0.10] hover:border-accent/30 dark:hover:border-accent/25'
                    : v.overallWinner === 'cursor'
                      ? 'bg-stone-50 dark:bg-white/[0.02] border-stone-200 dark:border-white/10 hover:bg-stone-100 dark:hover:bg-white/[0.04] hover:border-stone-300 dark:hover:border-white/15'
                      : 'bg-transparent border-stone-200/60 dark:border-white/5 hover:bg-stone-50 dark:hover:bg-white/[0.02] hover:border-stone-200 dark:hover:border-white/10'
                }`}
              >
                {/* Card header */}
                <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-stone-900 dark:text-white leading-snug">
                      {v.name}
                    </h4>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] font-mono text-stone-400 dark:text-white/30">
                        {v.tier}
                      </span>
                      <span className="text-[10px] text-stone-300 dark:text-white/15">|</span>
                      <span className="text-[10px] font-mono text-stone-400 dark:text-white/30 truncate">
                        {v.model}
                      </span>
                    </div>
                  </div>
                  {v.overallWinner !== 'tie' && (
                    <span
                      className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold transition-colors whitespace-nowrap ${
                        v.overallWinner === 'synapse'
                          ? 'bg-accent/10 text-accent hover:bg-accent/20'
                          : 'bg-stone-200 dark:bg-white/10 text-stone-600 dark:text-gray-400 hover:bg-stone-300 dark:hover:bg-white/15'
                      }`}
                    >
                      {v.overallWinner === 'synapse' ? 'Synapse wins' : 'Cursor wins'}
                    </span>
                  )}
                </div>

                {/* Metric rows */}
                <div className="space-y-2">
                  {v.metrics.map((m) => (
                    <div key={m.metric} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                      <span className="text-stone-500 dark:text-white/40 w-full sm:w-auto sm:min-w-[7rem] shrink-0">
                        {m.metric}
                      </span>
                      <span
                        className={`font-mono tabular-nums ${
                          m.winner === 'synapse'
                            ? 'text-accent font-semibold'
                            : 'text-stone-500 dark:text-white/40'
                        }`}
                      >
                        {m.synapseFormatted}
                      </span>
                      <span className="text-stone-300 dark:text-white/15">vs</span>
                      <span
                        className={`font-mono tabular-nums ${
                          m.winner === 'cursor'
                            ? 'text-stone-900 dark:text-white font-semibold'
                            : 'text-stone-500 dark:text-white/40'
                        }`}
                      >
                        {m.cursorFormatted}
                      </span>
                      {m.advantage && (
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap transition-colors ${
                            m.winner === 'synapse'
                              ? 'bg-accent/10 text-accent hover:bg-accent/20'
                              : 'bg-stone-100 dark:bg-white/5 text-stone-500 dark:text-white/40 hover:bg-stone-200 dark:hover:bg-white/10'
                          }`}
                        >
                          {m.advantage} {m.winner === 'synapse' ? 'better' : 'behind'}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Why section */}
                <div className="mt-3 pt-3 border-t border-stone-100 dark:border-white/5">
                  {v.metrics.filter((m) => m.winner === 'synapse' && m.advantage).length > 0 && (
                    <p className="text-[11px] text-stone-500 dark:text-white/40 leading-relaxed">
                      <span className="text-accent font-medium">Synapse advantage: </span>
                      {v.metrics
                        .filter((m) => m.winner === 'synapse' && m.advantage)
                        .map((m) => `${m.advantage} ${m.lowerIsBetter ? 'lower' : 'higher'} ${m.metric.toLowerCase()}`)
                        .join(', ')}
                    </p>
                  )}
                  {v.metrics.filter((m) => m.winner === 'cursor' && m.advantage).length > 0 && (
                    <p className="text-[11px] text-stone-500 dark:text-white/40 leading-relaxed mt-1">
                      <span className="text-stone-600 dark:text-gray-400 font-medium">Cursor (production) advantage: </span>
                      {v.metrics
                        .filter((m) => m.winner === 'cursor' && m.advantage)
                        .map((m) => `${m.advantage} ${m.lowerIsBetter ? 'lower' : 'higher'} ${m.metric.toLowerCase()}`)
                        .join(', ')}
                    </p>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ── Honest Analysis Section ──────────────────────────────────────────────────

interface AnalysisPoint {
  title: string;
  detail: string;
  type: 'win' | 'loss' | 'caveat';
}

function buildAnalysisPoints(): AnalysisPoint[] {
  const verdicts = buildVerdicts();
  const points: AnalysisPoint[] = [];

  const totalSynapseWins = verdicts.reduce((n, v) => n + (v.overallWinner === 'synapse' ? 1 : 0), 0);
  const totalCursorWins = verdicts.reduce((n, v) => n + (v.overallWinner === 'cursor' ? 1 : 0), 0);

  // Aggregate cost advantage
  const costPairs = verdicts.map((v) => {
    const sc = v.metrics.find((m) => m.metric === 'Cost');
    return sc ? { syn: sc.synapseValue, cur: sc.cursorValue } : null;
  }).filter((p): p is { syn: number; cur: number } => p !== null && p.syn > 0 && p.cur > 0);

  if (costPairs.length > 0) {
    const avgSynCost = costPairs.reduce((s, p) => s + p.syn, 0) / costPairs.length;
    const avgCurCost = costPairs.reduce((s, p) => s + p.cur, 0) / costPairs.length;
    const costRatio = avgCurCost / avgSynCost;
    if (costRatio > 2) {
      points.push({
        title: `${costRatio.toFixed(0)}x cheaper on average`,
        detail: `Tier routing + prompt caching means Synapse uses the cheapest model that can handle the task. Avg cost: ${formatCost(avgSynCost)} vs ${formatCost(avgCurCost)}.`,
        type: 'win',
      });
    }
  }

  // Speed advantage
  const timePairs = verdicts.map((v) => {
    const sc = v.metrics.find((m) => m.metric === 'Total Time');
    return sc ? { syn: sc.synapseValue, cur: sc.cursorValue, name: v.name } : null;
  }).filter((p): p is { syn: number; cur: number; name: string } => p !== null);

  const fasterCount = timePairs.filter((p) => p.syn < p.cur).length;
  if (fasterCount >= verdicts.length / 2) {
    const avgSpeedUp = timePairs
      .filter((p) => p.syn < p.cur)
      .reduce((s, p) => s + p.cur / p.syn, 0) / fasterCount;
    points.push({
      title: `Faster in ${fasterCount}/${timePairs.length} scenarios`,
      detail: `Average ${avgSpeedUp.toFixed(1)}x faster when Synapse wins on time. Fast-edit path and iteration limits keep trivial tasks under 3s.`,
      type: 'win',
    });
  }

  // Tool efficiency
  const toolPairs = verdicts.map((v) => {
    const sc = v.metrics.find((m) => m.metric === 'Tool Calls');
    return sc ? { syn: sc.synapseValue, cur: sc.cursorValue } : null;
  }).filter((p): p is { syn: number; cur: number } => p !== null);

  if (toolPairs.length > 0) {
    const avgSynTools = toolPairs.reduce((s, p) => s + p.syn, 0) / toolPairs.length;
    const avgCurTools = toolPairs.reduce((s, p) => s + p.cur, 0) / toolPairs.length;
    if (avgSynTools < avgCurTools) {
      points.push({
        title: `${((1 - avgSynTools / avgCurTools) * 100).toFixed(0)}% fewer tool calls`,
        detail: `Context pre-loading and smart file selection mean fewer round trips. Avg: ${avgSynTools.toFixed(1)} vs ${avgCurTools.toFixed(1)} calls.`,
        type: 'win',
      });
    }
  }

  // Quality / review gate
  if (totalSynapseWins > totalCursorWins) {
    points.push({
      title: 'Automated review gate catches errors',
      detail: 'COMPLEX and ARCHITECTURAL tasks pass through Opus 4.6 deep review. TRIVIAL/SIMPLE skip review for speed. Cursor has no equivalent review step.',
      type: 'win',
    });
  }

  // Honest weaknesses
  const cursorTTFCWins = verdicts.filter((v) => {
    const m = v.metrics.find((m) => m.metric === 'Time to First Chunk');
    return m && m.winner === 'cursor';
  });
  if (cursorTTFCWins.length > 0) {
    points.push({
      title: `Cursor faster TTFC in ${cursorTTFCWins.length} scenario${cursorTTFCWins.length > 1 ? 's' : ''}`,
      detail: 'Synapse\'s classification step adds 0.5-1s before the first token. For simple tasks where Cursor skips straight to generation, Cursor starts streaming sooner.',
      type: 'loss',
    });
  }

  const cursorTimeWins = timePairs.filter((p) => p.cur < p.syn);
  if (cursorTimeWins.length > 0) {
    points.push({
      title: `Cursor faster total time in ${cursorTimeWins.length} scenario${cursorTimeWins.length > 1 ? 's' : ''}`,
      detail: `${cursorTimeWins.map((p) => p.name).join(', ')}. Generic prompts sometimes complete faster for straightforward tasks.`,
      type: 'loss',
    });
  }

  const cursorContender = BENCHMARK_DATA.scenarios[0]?.contenders.find((c) => c.key === 'cursor');
  const cursorIsProduction = cursorContender?.features?.includes('cursor-production') ?? false;
  if (cursorIsProduction) {
    points.push({
      title: 'Cursor (production)',
      detail: 'The Cursor contender was run via Cursor Headless CLI so values are from production Cursor.',
      type: 'caveat',
    });
  } else {
    points.push({
      title: 'Include Cursor (production) in the benchmark',
      detail: 'To compare against Cursor (production), run the benchmark with CURSOR_PRODUCTION=1 and set CURSOR_API_KEY in .env.',
      type: 'caveat',
    });
  }

  if (HEADLINE_RUNS_PER_PROMPT != null && HEADLINE_RUNS_PER_PROMPT > 1) {
    points.push({
      title: 'Averaged results',
      detail: `Scores are averaged over ${HEADLINE_RUNS_PER_PROMPT} runs per scenario per contender. Latency and model load still vary; averages reduce but don't eliminate variance.`,
      type: 'caveat',
    });
  } else {
    points.push({
      title: 'Single-run variability',
      detail: 'Latency, model load, and prompt complexity vary per run. Results represent one snapshot, not a statistical average. Run the v2-live-benchmark test with BENCHMARK_RUNS_PER_PROMPT=3 to get averaged scores.',
      type: 'caveat',
    });
  }

  return points;
}

function HonestAnalysisSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  const points = buildAnalysisPoints();

  const wins = points.filter((p) => p.type === 'win');
  const losses = points.filter((p) => p.type === 'loss');
  const caveats = points.filter((p) => p.type === 'caveat');

  return (
    <section className="py-16 md:py-24">
      <div className="max-w-5xl mx-auto px-6 md:px-8 lg:px-10">
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 16 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, ease: EASE }}
        >
          <span className="section-badge">ANALYSIS</span>
          <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 dark:text-white mt-4 mb-3">
            Honest Breakdown
          </h2>
          <p className="text-sm text-stone-500 dark:text-white/50 mb-10 max-w-2xl">
            Data-driven wins and losses. No cherry-picking.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Wins */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-widest text-accent mb-4">
                Where Synapse Wins
              </h3>
              <div className="space-y-4">
                {wins.map((p) => (
                  <motion.div
                    key={p.title}
                    initial={{ opacity: 0, x: -8 }}
                    animate={inView ? { opacity: 1, x: 0 } : {}}
                    transition={{ duration: 0.3, ease: EASE }}
                    className="p-3 rounded-lg bg-accent/[0.04] border border-accent/15 hover:bg-accent/[0.06] hover:border-accent/25 transition-colors"
                  >
                    <h4 className="text-sm font-semibold text-stone-900 dark:text-white mb-1">
                      {p.title}
                    </h4>
                    <p className="text-[11px] text-stone-500 dark:text-white/40 leading-relaxed">
                      {p.detail}
                    </p>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Losses */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-widest text-stone-500 dark:text-white/40 mb-4">
                Where Cursor (production) Wins
              </h3>
              <div className="space-y-4">
                {losses.length === 0 ? (
                  <div className="p-3 rounded-lg bg-stone-50 dark:bg-white/[0.02] border border-stone-200 dark:border-white/5">
                    <p className="text-[11px] text-stone-400 dark:text-white/30 italic">
                      No scenarios where Cursor (production) outperformed Synapse in this run.
                    </p>
                  </div>
                ) : (
                  losses.map((p) => (
                    <motion.div
                      key={p.title}
                      initial={{ opacity: 0, x: -8 }}
                      animate={inView ? { opacity: 1, x: 0 } : {}}
                      transition={{ duration: 0.3, ease: EASE }}
                      className="p-3 rounded-lg bg-stone-50 dark:bg-white/[0.02] border border-stone-200 dark:border-white/10 hover:bg-stone-100 dark:hover:bg-white/[0.04] hover:border-stone-300 dark:hover:border-white/15 transition-colors"
                    >
                      <h4 className="text-sm font-semibold text-stone-900 dark:text-white mb-1">
                        {p.title}
                      </h4>
                      <p className="text-[11px] text-stone-500 dark:text-white/40 leading-relaxed">
                        {p.detail}
                      </p>
                    </motion.div>
                  ))
                )}
              </div>
            </div>

            {/* Caveats */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-widest text-stone-400 dark:text-white/30 mb-4">
                Caveats
              </h3>
              <div className="space-y-4">
                {caveats.map((p) => (
                  <motion.div
                    key={p.title}
                    initial={{ opacity: 0, x: -8 }}
                    animate={inView ? { opacity: 1, x: 0 } : {}}
                    transition={{ duration: 0.3, ease: EASE }}
                    className="p-3 rounded-lg bg-stone-50 dark:bg-white/[0.02] border border-dashed border-stone-200 dark:border-white/10 hover:bg-stone-100 dark:hover:bg-white/[0.04] transition-colors"
                  >
                    <h4 className="text-sm font-semibold text-stone-900 dark:text-white mb-1">
                      {p.title}
                    </h4>
                    <p className="text-[11px] text-stone-500 dark:text-white/40 leading-relaxed">
                      {p.detail}
                    </p>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ── Embeddable Benchmark Sections ────────────────────────────────────────────

function BenchmarkHero() {
  const heroRef = useRef(null);
  const heroInView = useInView(heroRef, { once: true, margin: '-40px' });

  return (
    <section id="benchmarks" className="pt-16 md:pt-24 pb-16 md:pb-20 scroll-mt-20">
      <div className="max-w-5xl mx-auto px-6 md:px-8 lg:px-10 text-center">
        <motion.div
          ref={heroRef}
          initial={{ opacity: 0, y: 24 }}
          animate={heroInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, ease: EASE }}
        >
          <span className="section-badge">PERFORMANCE</span>

          <h2 className="mt-6 text-3xl md:text-4xl font-semibold text-stone-900 dark:text-white tracking-[-0.02em] leading-tight">
            AI Agent{' '}
            <GlowText as="span" color="accent" className="inline">
              Performance
            </GlowText>{' '}
            Benchmarks
          </h2>

          <p className="mt-4 text-stone-600 dark:text-gray-400 max-w-2xl mx-auto text-base md:text-lg">
            {HEADLINE_SCENARIO_COUNT} real-world prompts
            {HEADLINE_RUNS_PER_PROMPT != null && HEADLINE_RUNS_PER_PROMPT > 1
              ? ` · ${HEADLINE_RUNS_PER_PROMPT} runs averaged`
              : ''}{' '}
            · {HEADLINE_UNIQUE_MODELS} models · 1 clear winner.
          </p>
        </motion.div>

        {/* Headline stats: methodology */}
        <div className={`grid gap-8 mt-12 ${HEADLINE_RUNS_PER_PROMPT != null && HEADLINE_RUNS_PER_PROMPT > 1 ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2 md:grid-cols-3'}`}>
          <AnimatedStat
            value={HEADLINE_SCENARIO_COUNT}
            suffix=""
            label="real-world prompts"
            delay={0.2}
          />
          {HEADLINE_RUNS_PER_PROMPT != null && HEADLINE_RUNS_PER_PROMPT > 1 && (
            <AnimatedStat
              value={HEADLINE_RUNS_PER_PROMPT}
              suffix=""
              label="runs averaged"
              delay={0.35}
            />
          )}
          <AnimatedStat
            value={HEADLINE_UNIQUE_MODELS}
            suffix=""
            label="models run"
            delay={0.5}
          />
          <AnimatedStat
            value={1}
            suffix=""
            label="clear winner"
            delay={0.65}
          />
        </div>
      </div>
    </section>
  );
}

function BenchmarkScenarios() {
  return (
    <section className="py-16 md:py-24">
      <div className="max-w-5xl mx-auto px-6 md:px-8 lg:px-10 space-y-10">
        {BENCHMARK_DATA.scenarios.map((scenario, i) => (
          <ScenarioCard key={scenario.key} scenario={scenario} index={i} />
        ))}
      </div>
    </section>
  );
}

/**
 * Bottom section: "1 Clear Winner" with Synapse pixel watermark and animated logo.
 */
function ClearWinnerSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <section
      ref={ref}
      className="relative overflow-hidden py-20 md:py-28 bg-stone-50 dark:bg-stone-950/50"
    >
      <PixelWatermark opacity={0.035} />
      <div className="relative z-10 max-w-5xl mx-auto px-6 md:px-8 lg:px-10 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, ease: EASE }}
          className="flex flex-col items-center gap-8"
        >
          <h2 className="text-2xl md:text-3xl font-semibold text-stone-900 dark:text-white tracking-[-0.02em]">
            1 Clear Winner
          </h2>
          <SynapseLogo className="text-2xl md:text-3xl text-stone-900 dark:text-white" />
        </motion.div>
      </div>
    </section>
  );
}

/**
 * All benchmark content as embeddable sections.
 * Designed to be dropped into any page without its own Navbar/Footer.
 */
export function BenchmarkSections() {
  return (
    <>
      <BenchmarkHero />
      <GridDivider />
      <VerdictSection />
      <GridDivider />
      <HonestAnalysisSection />
      <GridDivider />
      <BenchmarkScenarios />
      <GridDivider />
      <FeatureComparisonSection />
      <GridDivider />
      <MethodologySection />
      <GridDivider />
      <ClearWinnerSection />
    </>
  );
}
