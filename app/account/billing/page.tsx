'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ExternalLink, ChevronDown } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Constants & mock data                                              */
/* ------------------------------------------------------------------ */

const MODEL_DISPLAY: Record<string, string> = {
  'claude-sonnet-4-20250514': 'Claude Sonnet 4',
  'claude-3-5-haiku-20241022': 'Claude Haiku 3.5',
  'gpt-4o-mini': 'GPT-4o Mini',
};

const MOCK_PLAN = {
  name: 'Pro',
  status: 'active' as const,
  renewsAt: 'Mar 9, 2026',
  price: 49.0,
  includedRequests: 500,
};

const MOCK_INCLUDED_USAGE = [
  { model: 'claude-sonnet-4-20250514', tokens: 456_789, cost: 3.42 },
  { model: 'claude-3-5-haiku-20241022', tokens: 123_456, cost: 0.06 },
  { model: 'gpt-4o-mini', tokens: 78_901, cost: 0.05 },
];

const MOCK_INCLUDED_TOTAL = {
  tokens: MOCK_INCLUDED_USAGE.reduce((s, r) => s + r.tokens, 0),
  cost: MOCK_INCLUDED_USAGE.reduce((s, r) => s + r.cost, 0),
};

const MOCK_ONDEMAND_USAGE = [
  {
    model: 'claude-sonnet-4-20250514',
    tokens: 89_012,
    unitCost: '$0.10/req',
    qty: 12,
    total: 1.2,
  },
];

const MOCK_ONDEMAND_TOTAL = MOCK_ONDEMAND_USAGE.reduce(
  (s, r) => s + r.total,
  0
);

const MOCK_SPEND_LIMIT = 10.0;

const BILLING_CYCLES = [
  { label: 'Feb 2026', value: '2026-02' },
  { label: 'Jan 2026', value: '2026-01' },
  { label: 'Dec 2025', value: '2025-12' },
];

/* ------------------------------------------------------------------ */
/*  Status Badge                                                       */
/* ------------------------------------------------------------------ */

const STATUS_STYLES: Record<string, { dot: string; text: string; bg: string }> =
  {
    active: {
      dot: 'bg-emerald-400',
      text: 'text-emerald-400',
      bg: 'bg-emerald-900/40',
    },
    past_due: {
      dot: 'bg-yellow-400',
      text: 'text-yellow-400',
      bg: 'bg-yellow-900/40',
    },
    canceled: {
      dot: 'bg-red-400',
      text: 'text-red-400',
      bg: 'bg-red-900/40',
    },
  };

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.active;
  const label = status
    .replace('_', ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${s.text} ${s.bg}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Progress Bar                                                       */
/* ------------------------------------------------------------------ */

function SpendProgressBar({
  current,
  limit,
}: {
  current: number;
  limit: number;
}) {
  const pct = limit > 0 ? Math.min((current / limit) * 100, 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <p className="text-lg font-semibold ide-text">
          ${current.toFixed(2)}
          <span className="ide-text-muted text-base font-normal">
            {' '}
            / ${limit.toFixed(2)}
          </span>
        </p>
        <span className="text-sm ide-text-muted">{pct.toFixed(0)}%</span>
      </div>
      <div className="h-2 w-full rounded-full ide-surface-inset overflow-hidden">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function BillingPage() {
  const [cycle, setCycle] = useState(BILLING_CYCLES[0].value);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* ── Heading + Manage button ────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Billing &amp; Invoices</h1>
        </div>
        <Link
          href="/account/billing"
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-500 transition-colors shrink-0"
        >
          Manage Subscription
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* ── Current Plan Card ──────────────────────── */}
      <section className="ide-surface-panel border ide-border rounded-lg p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-base font-medium">
            Current Plan:{' '}
            <span className="text-emerald-400">{MOCK_PLAN.name}</span>
          </h2>
          <StatusBadge status={MOCK_PLAN.status} />
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm ide-text-muted">
          <span>Renews: {MOCK_PLAN.renewsAt}</span>
          <span className="ide-text-quiet">·</span>
          <span>${MOCK_PLAN.price.toFixed(2)} / month</span>
          <span className="ide-text-quiet">·</span>
          <span>{MOCK_PLAN.includedRequests} included requests</span>
        </div>
      </section>

      {/* ── Included Usage ─────────────────────────── */}
      <section className="ide-surface-panel border ide-border rounded-lg p-6 space-y-4">
        <div>
          <h2 className="text-base font-medium">Included Usage</h2>
          <p className="text-xs ide-text-muted mt-1">
            Period: Jan 28, 2026 – Feb 28, 2026
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b ide-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium ide-text-muted uppercase tracking-wider">
                  Item
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium ide-text-muted uppercase tracking-wider">
                  Tokens
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium ide-text-muted uppercase tracking-wider">
                  Cost
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium ide-text-muted uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 dark:divide-white/10">
              {MOCK_INCLUDED_USAGE.map((row) => (
                <tr
                  key={row.model}
                  className="ide-hover transition-colors"
                >
                  <td className="px-4 py-3 ide-text-2 whitespace-nowrap">
                    {MODEL_DISPLAY[row.model] ?? row.model}
                  </td>
                  <td className="px-4 py-3 text-right ide-text-2 tabular-nums">
                    {row.tokens.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right ide-text-2 tabular-nums">
                    ${row.cost.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-sky-500 dark:text-sky-400 ide-active px-2 py-0.5 rounded-full">
                      Included
                    </span>
                  </td>
                </tr>
              ))}

              {/* Total row */}
              <tr className="font-medium">
                <td className="px-4 py-3 ide-text">Total</td>
                <td className="px-4 py-3 text-right ide-text tabular-nums">
                  {MOCK_INCLUDED_TOTAL.tokens.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right ide-text tabular-nums">
                  ${MOCK_INCLUDED_TOTAL.cost.toFixed(2)}
                </td>
                <td className="px-4 py-3" />
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ── On-Demand Usage ────────────────────────── */}
      <section className="ide-surface-panel border ide-border rounded-lg p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-medium">On-Demand Usage</h2>

          {/* Cycle selector */}
          <div className="relative">
            <select
              value={cycle}
              onChange={(e) => setCycle(e.target.value)}
              className="ide-input appearance-none text-xs rounded-md pl-3 pr-8 py-1.5 cursor-pointer"
            >
              {BILLING_CYCLES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 ide-text-muted" />
          </div>
        </div>

        {/* Progress bar */}
        <SpendProgressBar
          current={MOCK_ONDEMAND_TOTAL}
          limit={MOCK_SPEND_LIMIT}
        />

        {/* Detailed breakdown */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b ide-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium ide-text-muted uppercase tracking-wider">
                  Type
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium ide-text-muted uppercase tracking-wider">
                  Tokens
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium ide-text-muted uppercase tracking-wider">
                  Unit Cost
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium ide-text-muted uppercase tracking-wider">
                  Qty
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium ide-text-muted uppercase tracking-wider">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 dark:divide-white/10">
              {MOCK_ONDEMAND_USAGE.map((row) => (
                <tr
                  key={row.model}
                  className="ide-hover transition-colors"
                >
                  <td className="px-4 py-3 ide-text-2 whitespace-nowrap">
                    {MODEL_DISPLAY[row.model] ?? row.model}
                  </td>
                  <td className="px-4 py-3 text-right ide-text-2 tabular-nums">
                    {row.tokens.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right ide-text-2 tabular-nums">
                    {row.unitCost}
                  </td>
                  <td className="px-4 py-3 text-right ide-text-2 tabular-nums">
                    {row.qty}
                  </td>
                  <td className="px-4 py-3 text-right ide-text-2 tabular-nums">
                    ${row.total.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
