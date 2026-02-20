'use client';

import { useState, useEffect, useCallback } from 'react';
import { ExternalLink } from 'lucide-react';
/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const PLAN_NAMES: Record<string, string> = {
  starter: 'Starter',
  pro: 'Pro',
  team: 'Team',
  agency: 'Agency',
};

const MODEL_DISPLAY: Record<string, string> = {
  'claude-sonnet-4-6': 'Claude Sonnet 4.6',
  'claude-opus-4-6': 'Claude Opus 4.6',
  'claude-haiku-4-5-20251001': 'Claude Haiku 4.5',
  'gpt-4o-mini': 'GPT-4o Mini',
};

/* ------------------------------------------------------------------ */
/*  Status Badge                                                       */
/* ------------------------------------------------------------------ */

const STATUS_STYLES: Record<string, { dot: string; text: string; bg: string }> =
  {
    active: {
      dot: 'bg-accent',
      text: 'text-accent',
      bg: 'bg-accent/20',
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
  limit: number | null;
}) {
  const isUnlimited = limit === null || limit <= 0;
  const pct = !isUnlimited && limit > 0 ? Math.min((current / limit) * 100, 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <p className="text-lg font-semibold ide-text">
          ${current.toFixed(2)}
          {!isUnlimited && (
            <span className="ide-text-muted text-base font-normal">
              {' '}
              / ${limit!.toFixed(2)}
            </span>
          )}
        </p>
        {!isUnlimited && (
          <span className="text-sm ide-text-muted">{pct.toFixed(0)}%</span>
        )}
      </div>
      <div className="h-2 w-full rounded-full ide-surface-inset overflow-hidden">
        <div
          className="h-full rounded-full bg-accent transition-all duration-500"
          style={{ width: isUnlimited ? '0%' : `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

type PlanId = 'starter' | 'pro' | 'team' | 'agency';

interface SubscriptionData {
  plan: PlanId;
  status: string;
  includedRequests: number;
  usedRequests: number;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  onDemandEnabled: boolean;
  onDemandLimitCents: number | null;
  overageCostCents?: number;
  overageChargeCents?: number;
  usageBreakdown?: { model: string; requests: number; tokens: number; cost: number }[];
  priceMonthly?: number;
}

export default function BillingPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [sub, setSub] = useState<SubscriptionData | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/billing/subscription');
        if (!res.ok) throw new Error('Failed to load');
        const json = await res.json();
        if (cancelled) return;
        setSub(json.data ?? json);
      } catch {
        if (!cancelled) setError('Failed to load subscription.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleManageSubscription = useCallback(async () => {
    setPortalLoading(true);
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to open portal');
      const json = await res.json();
      const url = json.data?.url ?? json.url;
      if (url) window.location.href = url;
    } catch {
      setError('Failed to open billing portal.');
    } finally {
      setPortalLoading(false);
    }
  }, []);

  const hasSubscription = sub?.status && sub.status !== 'canceled' && sub.plan !== 'starter';
  const planName = sub ? PLAN_NAMES[sub.plan] ?? sub.plan : 'Starter';
  const priceMonthly = sub?.priceMonthly ?? 0;
  const renewsAt = sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;
  const periodLabel = sub?.currentPeriodStart && sub?.currentPeriodEnd
    ? `${new Date(sub.currentPeriodStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} – ${new Date(sub.currentPeriodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    : null;
  const includedUsage = sub?.usageBreakdown ?? [];
  const includedTotal = { tokens: includedUsage.reduce((s, r) => s + r.tokens, 0), cost: includedUsage.reduce((s, r) => s + r.cost, 0) };
  const overageTotal = (sub?.overageChargeCents ?? 0) / 100;
  const spendLimit = sub?.onDemandLimitCents != null && sub.onDemandLimitCents > 0
    ? sub.onDemandLimitCents / 100
    : null;

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 bg-stone-200 dark:bg-white/10 rounded" />
          <div className="h-48 bg-stone-200 dark:bg-white/10 rounded-lg" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto space-y-3">
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
    <div className="max-w-4xl mx-auto space-y-8">
      {/* ── Heading + Manage button ────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Billing &amp; Invoices</h1>
        </div>
        <button
          onClick={handleManageSubscription}
          disabled={portalLoading || !hasSubscription}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-md bg-accent text-white hover:bg-accent-hover transition-colors shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {portalLoading ? 'Opening...' : 'Manage Subscription'}
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Current Plan Card ──────────────────────── */}
      <section className="ide-surface-panel border ide-border rounded-lg p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-base font-medium">
            Current Plan:{' '}
            <span className="text-accent">{planName}</span>
          </h2>
          <StatusBadge status={sub?.status ?? 'active'} />
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm ide-text-muted">
          {renewsAt && <span>Renews: {renewsAt}</span>}
          {renewsAt && <span className="ide-text-quiet">·</span>}
          <span>${priceMonthly.toFixed(2)} / month</span>
          <span className="ide-text-quiet">·</span>
          <span>{sub?.includedRequests ?? 0} included requests</span>
        </div>
      </section>

      {/* ── Period Usage ───────────────────────────── */}
      <section className="ide-surface-panel border ide-border rounded-lg p-6 space-y-4">
        <div>
          <h2 className="text-base font-medium">Period Usage</h2>
          <p className="text-xs ide-text-muted mt-1">
            {periodLabel ?? 'Current period'}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b ide-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium ide-text-muted uppercase tracking-wider">
                  Model
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium ide-text-muted uppercase tracking-wider">
                  Requests
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium ide-text-muted uppercase tracking-wider">
                  Tokens
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium ide-text-muted uppercase tracking-wider">
                  Cost
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200 dark:divide-white/10">
              {includedUsage.map((row) => (
                <tr key={row.model} className="ide-hover transition-colors">
                  <td className="px-4 py-3 ide-text-2 whitespace-nowrap">
                    {MODEL_DISPLAY[row.model] ?? row.model}
                  </td>
                  <td className="px-4 py-3 text-right ide-text-2 tabular-nums">
                    {row.requests.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right ide-text-2 tabular-nums">
                    {row.tokens.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right ide-text-2 tabular-nums">
                    ${row.cost.toFixed(2)}
                  </td>
                </tr>
              ))}

              <tr className="font-medium">
                <td className="px-4 py-3 ide-text">Total</td>
                <td className="px-4 py-3 text-right ide-text tabular-nums">
                  {includedUsage.reduce((s, r) => s + r.requests, 0).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right ide-text tabular-nums">
                  {includedTotal.tokens.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right ide-text tabular-nums">
                  ${includedTotal.cost.toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ── On-Demand Usage ────────────────────────── */}
      <section className="ide-surface-panel border ide-border rounded-lg p-6 space-y-5">
        <h2 className="text-base font-medium">On-Demand Usage</h2>

        <SpendProgressBar
          current={overageTotal}
          limit={spendLimit}
        />

        <p className="text-sm ide-text-muted">
          {sub?.usedRequests ?? 0} of {sub?.includedRequests ?? 0} included
          requests used this period.
          {overageTotal > 0 && (
            <> Overage billed: ${overageTotal.toFixed(2)}</>
          )}
        </p>
      </section>
    </div>
  );
}
