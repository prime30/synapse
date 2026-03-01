'use client';

import { useEffect, useMemo, useState } from 'react';
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
/*  Chart data helper                                                  */
/* ------------------------------------------------------------------ */

function generateEmptyChart(days: number) {
  const data: { date: string; requests: number }[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    data.push({
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      requests: 0,
    });
  }
  return data;
}

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
        stroke="oklch(0.279 0.012 256)"
        fill="transparent"
        strokeWidth={stroke}
        r={normalizedRadius}
        cx={radius}
        cy={radius}
      />
      {/* progress ring */}
      <circle
        stroke="oklch(0.696 0.17 162)"
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState({ used: 0, total: 50 });
  const [cost, setCost] = useState(0);
  const [plan, setPlan] = useState('Starter');
  const [renewal, setRenewal] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/billing/subscription');
        if (!res.ok) throw new Error('Failed to load');
        const data = await res.json();
        if (cancelled) return;
        const sub = data.data ?? data;

        const breakdown: { requests: number; cost: number }[] = sub.usageBreakdown ?? [];
        const totalRequests = breakdown.reduce((s, r) => s + r.requests, 0);
        const totalCost = breakdown.reduce((s, r) => s + r.cost, 0);

        setUsage({ used: totalRequests, total: sub.planLimits?.requests ?? 50 });
        setCost(totalCost);

        const planName = sub.plan ?? 'starter';
        setPlan(planName.charAt(0).toUpperCase() + planName.slice(1));

        const renewDate = new Date();
        renewDate.setDate(renewDate.getDate() + 30);
        setRenewal(
          renewDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        );
      } catch {
        if (!cancelled) setError('Failed to load account data.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const chartData = useMemo(() => generateEmptyChart(range), [range]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 bg-stone-200 dark:bg-white/10 rounded" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="h-32 bg-stone-200 dark:bg-white/10 rounded-lg" />
            <div className="h-32 bg-stone-200 dark:bg-white/10 rounded-lg" />
          </div>
          <div className="h-64 bg-stone-200 dark:bg-white/10 rounded-lg" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-5xl mx-auto space-y-3">
        <p className="text-red-500">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="text-sm text-accent hover:opacity-80 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

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
          <ProgressRing used={usage.used} total={usage.total} />
          <div>
            <p className="text-sm ide-text-muted">Agent Requests</p>
            <p className="text-xl font-semibold mt-1">
              {usage.used}{' '}
              <span className="ide-text-muted text-base font-normal">
                / {usage.total}
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
              ${cost.toFixed(2)}
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
                  <stop offset="0%" stopColor="oklch(0.696 0.17 162)" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="oklch(0.696 0.17 162)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="oklch(0.279 0.012 256)"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tick={{ fill: 'oklch(0.551 0.014 264)', fontSize: 11 }}
                axisLine={{ stroke: 'oklch(0.279 0.012 256)' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: 'oklch(0.551 0.014 264)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'oklch(0.21 0.012 264)',
                  border: '1px solid oklch(0.279 0.012 256)',
                  borderRadius: '0.5rem',
                  fontSize: 12,
                  color: 'oklch(0.967 0.003 264)',
                }}
                labelStyle={{ color: 'oklch(0.702 0.015 264)' }}
              />
              <Area
                type="monotone"
                dataKey="requests"
                stroke="oklch(0.696 0.17 162)"
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
          <p className="text-xl font-semibold mt-2">{plan}</p>
          {renewal && (
            <p className="text-xs ide-text-muted mt-1">
              Renews {renewal}
            </p>
          )}
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
