'use client';

import { useMemo, useState } from 'react';
import {
  Gauge,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  FileImage,
  Code,
  Zap,
} from 'lucide-react';
import {
  analyzeThemePerformance,
  type PerformanceCategory,
  type PerformanceFinding,
  type PerformanceReport,
} from '@/lib/quality/theme-performance';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PerformanceDashboardProps {
  files: { path: string; content: string; size: number }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CATEGORY_META: Record<
  PerformanceCategory,
  { label: string; icon: React.ReactNode }
> = {
  'asset-weight': { label: 'Asset Weight', icon: <Code className="w-4 h-4" /> },
  'render-blocking': { label: 'Render Blocking', icon: <Zap className="w-4 h-4" /> },
  'image-optimization': { label: 'Image Optimization', icon: <FileImage className="w-4 h-4" /> },
  'liquid-complexity': { label: 'Liquid Complexity', icon: <Code className="w-4 h-4" /> },
  'network-requests': { label: 'Network Requests', icon: <Gauge className="w-4 h-4" /> },
};

function scoreColor(score: number): string {
  if (score >= 70) return 'text-green-400';
  if (score >= 40) return 'text-yellow-400';
  return 'text-red-400';
}

function scoreBg(score: number): string {
  if (score >= 70) return 'bg-green-500';
  if (score >= 40) return 'bg-yellow-500';
  return 'bg-red-500';
}

function scoreRingColor(score: number): string {
  if (score >= 70) return 'stroke-green-400';
  if (score >= 40) return 'stroke-yellow-400';
  return 'stroke-red-400';
}

function scoreLabel(score: number): string {
  if (score >= 70) return 'Good';
  if (score >= 40) return 'Needs Work';
  return 'Poor';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ScoreGauge({ score }: { score: number }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center w-32 h-32">
      <svg className="w-32 h-32 -rotate-90" viewBox="0 0 128 128">
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          className="text-gray-800"
        />
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={`${scoreRingColor(score)} transition-all duration-700`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-3xl font-bold tabular-nums ${scoreColor(score)}`}>
          {score}
        </span>
        <span className="text-[10px] text-gray-400 uppercase tracking-wider">
          {scoreLabel(score)}
        </span>
      </div>
    </div>
  );
}

function CategoryRow({
  category,
  score,
  findings,
}: {
  category: PerformanceCategory;
  score: number;
  findings: PerformanceFinding[];
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = CATEGORY_META[category];

  return (
    <div className="border border-gray-800 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-800/50 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
        )}
        <span className="text-gray-400 flex-shrink-0">{meta.icon}</span>
        <span className="text-xs font-medium text-gray-200 flex-1 text-left">
          {meta.label}
        </span>
        <span className={`text-xs font-semibold tabular-nums ${scoreColor(score)}`}>
          {score}
        </span>
        <div className="w-20 h-1.5 bg-gray-800 rounded-full overflow-hidden flex-shrink-0">
          <div
            className={`h-full rounded-full ${scoreBg(score)} transition-all duration-500`}
            style={{ width: `${score}%` }}
          />
        </div>
      </button>

      {expanded && findings.length > 0 && (
        <div className="border-t border-gray-800 divide-y divide-gray-800/60">
          {findings.map((f, i) => (
            <div key={`${f.rule}-${i}`} className="px-4 py-2 flex items-start gap-2">
              {f.score >= 70 ? (
                <CheckCircle className="w-3.5 h-3.5 text-green-500 mt-0.5 flex-shrink-0" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 mt-0.5 flex-shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs text-gray-300">{f.message}</p>
                {f.recommendation && (
                  <p className="text-[11px] text-gray-500 mt-0.5">{f.recommendation}</p>
                )}
                {f.file && (
                  <p className="text-[10px] text-gray-600 mt-0.5 font-mono truncate">
                    {f.file}
                  </p>
                )}
              </div>
              <span
                className={`text-[10px] font-semibold tabular-nums flex-shrink-0 ${scoreColor(f.score)}`}
              >
                {f.score}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PerformanceDashboard({ files }: PerformanceDashboardProps) {
  const report: PerformanceReport = useMemo(
    () => analyzeThemePerformance(files),
    [files],
  );

  // Group findings by category
  const findingsByCategory = useMemo(() => {
    const map = new Map<PerformanceCategory, PerformanceFinding[]>();
    for (const f of report.findings) {
      const list = map.get(f.category) ?? [];
      list.push(f);
      map.set(f.category, list);
    }
    return map;
  }, [report]);

  const categories = (
    Object.keys(CATEGORY_META) as PerformanceCategory[]
  ).filter((c) => c !== 'network-requests'); // hide placeholder category

  return (
    <div className="flex flex-col h-full bg-gray-900 text-gray-100">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <Gauge className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-200">Performance</h2>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Score gauge */}
        <div className="flex flex-col items-center gap-2">
          <ScoreGauge score={report.overallScore} />
          <p className="text-[10px] text-gray-500">
            Analyzed {files.length} files &middot;{' '}
            {new Date(report.analyzedAt).toLocaleTimeString()}
          </p>
        </div>

        {/* Category breakdown */}
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider px-1">
            Category Breakdown
          </h3>
          {categories.map((cat) => (
            <CategoryRow
              key={cat}
              category={cat}
              score={report.categoryScores[cat]}
              findings={findingsByCategory.get(cat) ?? []}
            />
          ))}
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-2 pt-2">
          {[
            {
              label: 'Findings',
              value: report.findings.length,
              color: 'text-gray-300',
            },
            {
              label: 'Issues',
              value: report.findings.filter((f) => f.score < 70).length,
              color: 'text-yellow-400',
            },
            {
              label: 'Passed',
              value: report.findings.filter((f) => f.score >= 70).length,
              color: 'text-green-400',
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="text-center px-2 py-2 rounded-lg bg-gray-800/50 border border-gray-800"
            >
              <p className={`text-lg font-bold tabular-nums ${stat.color}`}>
                {stat.value}
              </p>
              <p className="text-[10px] text-gray-500">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
