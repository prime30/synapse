'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { ArrowRight, Plug, ShoppingBag } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Mock data helpers                                                  */
/* ------------------------------------------------------------------ */

function generateMockChart(days: number) {
  const data: { date: string; requests: number }[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    data.push({
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      requests: Math.floor(Math.random() * 16),
    });
  }
  return data;
}

const MOCK_USAGE = { used: 0, total: 50 };
const MOCK_COST = 0;
const MOCK_PLAN = 'Starter';
const MOCK_RENEWAL = 'Mar 12, 2026';

/* ------------------------------------------------------------------ */
/*  Circular Progress Ring                                             */
/* ------------------------------------------------------------------ */

function ProgressRing({
  used,
  total,
}: {
  used: number;
  total: number;
}) {
  const radius = 40;
  const stroke = 6;
  const normalizedRadius = radius - stroke / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const pct = total > 0 ? used / total : 0;
  const offset = circumference - pct * circumference;

  return (
    <svg height={radius * 2} width={radius * 2} className="shrink-0">
      {/* background ring */}
      <circle
        stroke="#1f2937"
        fill="transparent"
        strokeWidth={stroke}
        r={normalizedRadius}
        cx={radius}
        cy={radius}
      />
      {/* progress ring */}
      <circle
        stroke="#10b981"
        fill="transparent"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={offset}
        r={normalizedRadius}
        cx={radius}
        cy={radius}
        style={{
          transform: 'rotate(-90deg)',
          transformOrigin: '50% 50%',
          transition: 'stroke-dashoffset 0.6s ease',
        }}
      />
      {/* center text */}
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        className="ide-text text-xs font-medium"
      >
        {used}/{total}
      </text>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Date range buttons                                                 */
/* ------------------------------------------------------------------ */

const RANGES = [
  { label: '1d', days: 1 },
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
] as const;

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function AccountOverviewPage() {
  const [range, setRange] = useState<number>(30);

  const chartData = useMemo(() => generateMockChart(range), [range]);

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* ── Heading ────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="ide-text-muted text-sm mt-1">
          A snapshot of your account activity and usage.
        </p>
      </div>

      {/* ── Stats row ──────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Agent Requests */}
        <div className="ide-surface-panel ide-border rounded-lg p-6 flex items-center gap-5">
          <ProgressRing used={MOCK_USAGE.used} total={MOCK_USAGE.total} />
          <div>
            <p className="text-sm ide-text-muted">Agent Requests</p>
            <p className="text-xl font-semibold mt-1">
              {MOCK_USAGE.used}{' '}
              <span className="ide-text-muted text-base font-normal">
                / {MOCK_USAGE.total}
              </span>
            </p>
          </div>
        </div>

        {/* Estimated Cost */}
        <div className="ide-surface-panel ide-border rounded-lg p-6 flex items-center gap-5">
          <div className="h-20 w-20 rounded-full ide-surface-inset flex items-center justify-center shrink-0">
            <span className="text-emerald-400 text-lg font-semibold">$</span>
          </div>
          <div>
            <p className="text-sm ide-text-muted">Estimated Cost</p>
            <p className="text-xl font-semibold mt-1">
              ${MOCK_COST.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {/* ── Analytics chart ────────────────────────── */}
      <div className="ide-surface-panel ide-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">Request Activity</h2>
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <button
                key={r.days}
                onClick={() => setRange(r.days)}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  range === r.days
                    ? 'ide-surface-inset ide-text'
                    : 'ide-text-muted ide-hover'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 4, right: 4, bottom: 0, left: -20 }}
            >
              <defs>
                <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="#1f2937"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tick={{ fill: '#6b7280', fontSize: 11 }}
                axisLine={{ stroke: '#1f2937' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#6b7280', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#111827',
                  border: '1px solid #1f2937',
                  borderRadius: '0.5rem',
                  fontSize: 12,
                  color: '#f3f4f6',
                }}
                labelStyle={{ color: '#9ca3af' }}
              />
              <Area
                type="monotone"
                dataKey="requests"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#areaFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Quick status ───────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Current Plan */}
        <div className="ide-surface-panel ide-border rounded-lg p-6">
          <h3 className="text-sm font-medium ide-text-muted">Current Plan</h3>
          <p className="text-xl font-semibold mt-2">{MOCK_PLAN}</p>
          <p className="text-xs ide-text-muted mt-1">
            Renews {MOCK_RENEWAL}
          </p>
          <Link
            href="/account/billing"
            className="inline-flex items-center gap-1.5 mt-4 text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            Manage <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Integrations */}
        <div className="ide-surface-panel ide-border rounded-lg p-6">
          <h3 className="text-sm font-medium ide-text-muted">Integrations</h3>
          <div className="flex items-center gap-3 mt-3">
            <div className="h-9 w-9 rounded-lg ide-surface-inset flex items-center justify-center">
              <ShoppingBag className="h-4 w-4 ide-text-muted" />
            </div>
            <div>
              <p className="text-sm font-medium">Shopify</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Plug className="h-3 w-3 ide-text-muted" />
                <span className="text-xs ide-text-muted">Not connected</span>
              </div>
            </div>
          </div>
          <Link
            href="/account/integrations"
            className="inline-flex items-center gap-1.5 mt-4 text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            Manage <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
