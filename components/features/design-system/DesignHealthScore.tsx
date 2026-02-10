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
// Helpers
// ---------------------------------------------------------------------------

interface CategoryStat {
  label: string;
  count: number;
  color: string;
}

function computeStats(tokens: DesignTokensResponse): CategoryStat[] {
  return [
    { label: 'Colors', count: tokens.colors.length, color: 'bg-pink-500' },
    { label: 'Fonts', count: tokens.fonts.length, color: 'bg-violet-500' },
    { label: 'Font Sizes', count: tokens.fontSizes.length, color: 'bg-indigo-500' },
    { label: 'Spacing', count: tokens.spacing.length, color: 'bg-blue-500' },
    { label: 'Radii', count: tokens.radii.length, color: 'bg-teal-500' },
    { label: 'Shadows', count: tokens.shadows.length, color: 'bg-amber-500' },
  ];
}

function computeHealthScore(tokens: DesignTokensResponse): number {
  const total =
    tokens.colors.length +
    tokens.fonts.length +
    tokens.fontSizes.length +
    tokens.spacing.length +
    tokens.radii.length +
    tokens.shadows.length;

  if (total === 0) return 0;

  // Categories that have at least 1 token count as "covered"
  const coveredCategories = [
    tokens.colors.length,
    tokens.fonts.length,
    tokens.fontSizes.length,
    tokens.spacing.length,
    tokens.radii.length,
    tokens.shadows.length,
  ].filter((c) => c > 0).length;

  // Score based on: category coverage (60%) + token richness (40%)
  const categoryCoverage = coveredCategories / 6;
  const richness = Math.min(total / 30, 1); // 30+ tokens = max richness
  return Math.round(categoryCoverage * 60 + richness * 40);
}

function scoreColor(score: number): string {
  if (score >= 70) return 'text-green-400';
  if (score >= 40) return 'text-yellow-400';
  return 'text-red-400';
}

function scoreBg(score: number): string {
  if (score >= 70) return 'bg-green-500/20 border-green-500/30';
  if (score >= 40) return 'bg-yellow-500/20 border-yellow-500/30';
  return 'bg-red-500/20 border-red-500/30';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DesignHealthScore({ tokens, fileCount }: DesignHealthScoreProps) {
  const stats = computeStats(tokens);
  const total = stats.reduce((sum, s) => sum + s.count, 0);
  const score = computeHealthScore(tokens);
  const maxCount = Math.max(...stats.map((s) => s.count), 1);

  return (
    <div className="space-y-3">
      {/* Score circle */}
      <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${scoreBg(score)}`}>
        <div className="flex flex-col items-center justify-center w-14 h-14 flex-shrink-0">
          <span className={`text-2xl font-bold tabular-nums ${scoreColor(score)}`}>
            {score}
          </span>
          <span className="text-[9px] text-gray-400 uppercase tracking-wider">
            Score
          </span>
        </div>
        <div className="min-w-0">
          <p className="text-xs text-gray-300">
            <span className="font-semibold">{total}</span> tokens across{' '}
            <span className="font-semibold">{fileCount}</span> files
          </p>
          <p className="text-[10px] text-gray-500 mt-0.5">
            {score >= 70
              ? 'Good design system coverage'
              : score >= 40
                ? 'Moderate coverage — add more tokens'
                : 'Low coverage — many hardcoded values'}
          </p>
        </div>
      </div>

      {/* Category bars */}
      <div className="space-y-1.5">
        {stats.map((s) => (
          <div key={s.label} className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500 w-16 text-right flex-shrink-0">
              {s.label}
            </span>
            <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${s.color} transition-all duration-300`}
                style={{ width: `${(s.count / maxCount) * 100}%` }}
              />
            </div>
            <span className="text-[10px] text-gray-500 w-6 text-right tabular-nums flex-shrink-0">
              {s.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
