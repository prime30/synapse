'use client';

import type { DesignTokensResponse } from '@/hooks/useDesignTokens';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DesignHealthScoreProps {
  tokens: DesignTokensResponse;
  fileCount: number;
}

// ---------------------------------------------------------------------------
// Score breakdown (Phase 6d)
// ---------------------------------------------------------------------------

export interface ScoreBreakdown {
  coverage: number;      // 0–1, 30% weight
  tokenRichness: number;  // 0–1, 15% weight
  conformity: number;     // 0–1, 30% weight (placeholder 1.0)
  consistency: number;   // 0–1, 15% weight (placeholder 1.0)
  freshness: number;     // 0–1, 10% weight (placeholder 1.0)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface CategoryStat {
  label: string;
  count: number;
  color: string;
}

const SIX_CATEGORIES = [
  'colors',
  'fonts',
  'fontSizes',
  'spacing',
  'radii',
  'shadows',
] as const;

function computeStats(tokens: DesignTokensResponse): CategoryStat[] {
  return [
    { label: 'Colors', count: tokens.colors?.length ?? 0, color: 'bg-pink-500' },
    { label: 'Fonts', count: tokens.fonts?.length ?? 0, color: 'bg-violet-500' },
    { label: 'Font Sizes', count: tokens.fontSizes?.length ?? 0, color: 'bg-indigo-500' },
    { label: 'Spacing', count: tokens.spacing?.length ?? 0, color: 'bg-sky-500' },
    { label: 'Radii', count: tokens.radii?.length ?? 0, color: 'bg-teal-500' },
    { label: 'Shadows', count: tokens.shadows?.length ?? 0, color: 'bg-amber-500' },
  ];
}

function computeBreakdown(tokens: DesignTokensResponse): ScoreBreakdown {
  const total =
    (tokens.colors?.length ?? 0) +
    (tokens.fonts?.length ?? 0) +
    (tokens.fontSizes?.length ?? 0) +
    (tokens.spacing?.length ?? 0) +
    (tokens.radii?.length ?? 0) +
    (tokens.shadows?.length ?? 0);

  const coveredCount = SIX_CATEGORIES.filter(
    (key) => (tokens[key]?.length ?? 0) > 0,
  ).length;

  return {
    coverage: coveredCount / 6,
    tokenRichness: Math.min(total / 30, 1),
    conformity: 1.0,  // placeholder until standardization data available
    consistency: 1.0, // placeholder
    freshness: 1.0,   // placeholder
  };
}

function computeHealthScore(breakdown: ScoreBreakdown): number {
  return Math.round(
    breakdown.coverage * 30 +
    breakdown.tokenRichness * 15 +
    breakdown.conformity * 30 +
    breakdown.consistency * 15 +
    breakdown.freshness * 10,
  );
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-500 dark:text-green-400';
  if (score >= 50) return 'text-yellow-500 dark:text-yellow-400';
  return 'text-red-500 dark:text-red-400';
}

function scoreBg(score: number): string {
  if (score >= 80) return 'bg-green-500/20 border-green-500/30';
  if (score >= 50) return 'bg-yellow-500/20 border-yellow-500/30';
  return 'bg-red-500/20 border-red-500/30';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DesignHealthScore({ tokens, fileCount }: DesignHealthScoreProps) {
  const stats = computeStats(tokens);
  const total = stats.reduce((sum, s) => sum + s.count, 0);
  const breakdown = computeBreakdown(tokens);
  const score = computeHealthScore(breakdown);
  const maxCount = Math.max(...stats.map((s) => s.count), 1);

  return (
    <div className="space-y-3">
      {/* Score circle */}
      <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${scoreBg(score)}`}>
        <div className="flex flex-col items-center justify-center w-14 h-14 flex-shrink-0">
          <span className={`text-2xl font-bold tabular-nums ${scoreColor(score)}`}>
            {score}
          </span>
          <span className="text-[9px] ide-text-muted uppercase tracking-wider">
            Score
          </span>
        </div>
        <div className="min-w-0">
          <p className="text-xs ide-text">
            <span className="font-semibold">{total}</span> tokens across{' '}
            <span className="font-semibold">{fileCount}</span> files
          </p>
          <p className="text-[10px] ide-text-muted mt-0.5">
            {score >= 80
              ? 'Good design system coverage'
              : score >= 50
                ? 'Moderate coverage — add more tokens'
                : 'Low coverage — many hardcoded values'}
          </p>
        </div>
      </div>

      {/* Score breakdown */}
      <div className="space-y-1 text-[10px] ide-text-muted">
        <div className="flex justify-between">
          <span>Coverage (30%)</span>
          <span className="tabular-nums">{Math.round(breakdown.coverage * 100)}%</span>
        </div>
        <div className="flex justify-between">
          <span>Token richness (15%)</span>
          <span className="tabular-nums">{Math.round(breakdown.tokenRichness * 100)}%</span>
        </div>
        <div className="flex justify-between">
          <span>Conformity (30%)</span>
          <span className="tabular-nums">—</span>
        </div>
        <div className="flex justify-between">
          <span>Consistency (15%)</span>
          <span className="tabular-nums">—</span>
        </div>
        <div className="flex justify-between">
          <span>Freshness (10%)</span>
          <span className="tabular-nums">—</span>
        </div>
      </div>

      {/* Category bars */}
      <div className="space-y-1.5">
        {stats.map((s) => (
          <div key={s.label} className="flex items-center gap-2">
            <span className="text-[10px] ide-text-muted w-16 text-right flex-shrink-0">
              {s.label}
            </span>
            <div className="flex-1 h-2 ide-surface-inset rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${s.color} transition-all duration-300`}
                style={{ width: `${(s.count / maxCount) * 100}%` }}
              />
            </div>
            <span className="text-[10px] ide-text-muted w-6 text-right tabular-nums flex-shrink-0">
              {s.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
