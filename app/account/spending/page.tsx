'use client';

import { useState, useCallback } from 'react';

/* ------------------------------------------------------------------ */
/*  Toggle Switch (matches settings page pattern)                      */
/* ------------------------------------------------------------------ */

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a] dark:focus-visible:ring-offset-[#0a0a0a] ${
        checked ? 'bg-emerald-600' : 'ide-surface-inset'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transform transition-transform duration-200 ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
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
  const pct = limit && limit > 0 ? Math.min((current / limit) * 100, 100) : 0;
  const isUnlimited = limit === null;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <p className="text-lg font-semibold">
          ${current.toFixed(2)}
          {!isUnlimited && (
            <span className="ide-text-muted text-base font-normal">
              {' '}
              / ${limit!.toFixed(2)}
            </span>
          )}
        </p>
        {!isUnlimited && (
          <span className="text-sm ide-text-muted">{pct.toFixed(1)}%</span>
        )}
      </div>
      <div className="h-2 w-full rounded-full ide-surface-inset overflow-hidden">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all duration-500"
          style={{ width: isUnlimited ? '0%' : `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Mock data                                                          */
/* ------------------------------------------------------------------ */

const MODEL_DISPLAY: Record<string, string> = {
  'claude-sonnet-4-20250514': 'Claude Sonnet 4',
  'claude-3-5-haiku-20241022': 'Claude Haiku 3.5',
  'gpt-4o-mini': 'GPT-4o Mini',
};

const MOCK_BREAKDOWN = [
  {
    model: 'claude-sonnet-4-20250514',
    requests: 45,
    tokens: 234_500,
    cost: 1.82,
  },
  {
    model: 'claude-3-5-haiku-20241022',
    requests: 112,
    tokens: 89_200,
    cost: 0.04,
  },
  {
    model: 'gpt-4o-mini',
    requests: 23,
    tokens: 45_600,
    cost: 0.03,
  },
];

const MOCK_TOTAL = {
  requests: MOCK_BREAKDOWN.reduce((s, r) => s + r.requests, 0),
  tokens: MOCK_BREAKDOWN.reduce((s, r) => s + r.tokens, 0),
  cost: MOCK_BREAKDOWN.reduce((s, r) => s + r.cost, 0),
};

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function SpendingPage() {
  const [onDemandEnabled, setOnDemandEnabled] = useState(false);
  const [spendLimit, setSpendLimit] = useState('10.00');
  const [isUnlimited, setIsUnlimited] = useState(false);
  const [saved, setSaved] = useState(false);

  const currentSpend = MOCK_TOTAL.cost;
  const limitValue = isUnlimited ? null : parseFloat(spendLimit) || 0;

  const handleSave = useCallback(() => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, []);

  const handleSetUnlimited = useCallback(() => {
    setIsUnlimited(true);
    setSpendLimit('');
  }, []);

  const handleLimitChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setIsUnlimited(false);
      setSpendLimit(e.target.value);
    },
    []
  );

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* ── Heading ────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-semibold">Spending</h1>
        <p className="ide-text-muted text-sm mt-1">
          Manage your on-demand usage and spending limits.
        </p>
      </div>

      {/* ── On-Demand Card ─────────────────────────── */}
      <section className="ide-surface-panel border ide-border rounded-lg p-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-medium">On-Demand Usage</h2>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 bg-emerald-900/40 px-2 py-0.5 rounded-full">
                Recommended
              </span>
            </div>
            <p className="text-sm ide-text-muted mt-2 max-w-lg">
              Go beyond included usage limits. On-demand usage is billed in
              arrears at the end of each billing cycle.
            </p>
          </div>
        </div>

        {/* Toggle */}
        <div className="flex items-center gap-3">
          <Toggle checked={onDemandEnabled} onChange={setOnDemandEnabled} />
          <span className="text-sm ide-text-2">
            {onDemandEnabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>

        {/* Spend limit (shown when on-demand is enabled) */}
        {onDemandEnabled && (
          <div className="space-y-3 pt-2 border-t ide-border">
            <div className="flex items-center justify-between">
              <label
                htmlFor="spend-limit"
                className="text-sm font-medium ide-text"
              >
                On-Demand Spend Limit
              </label>
              <button
                onClick={handleSetUnlimited}
                className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                Set Unlimited
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 ide-text-muted text-sm">
                  $
                </span>
                <input
                  id="spend-limit"
                  type="number"
                  min="0"
                  step="0.01"
                  value={isUnlimited ? '' : spendLimit}
                  onChange={handleLimitChange}
                  placeholder={isUnlimited ? 'Unlimited' : '0.00'}
                  className="ide-input w-40 pl-7 pr-3 py-2 text-sm"
                />
              </div>
              <span className="text-sm ide-text-muted">per month</span>
            </div>

            <button
              onClick={handleSave}
              className="px-4 py-2 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-500 transition-colors"
            >
              {saved ? 'Saved!' : 'Save Limit'}
            </button>
          </div>
        )}
      </section>

      {/* ── Current Period Spending ─────────────────── */}
      <section className="ide-surface-panel border ide-border rounded-lg p-6 space-y-5">
        <h2 className="text-base font-medium">Current Period Spending</h2>

        {/* Progress */}
        <SpendProgressBar current={currentSpend} limit={limitValue} />

        {/* Breakdown table */}
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
              {MOCK_BREAKDOWN.map((row) => (
                <tr
                  key={row.model}
                  className="ide-hover transition-colors"
                >
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

              {/* Total row */}
              <tr className="font-medium">
                <td className="px-4 py-3 ide-text">Total</td>
                <td className="px-4 py-3 text-right ide-text tabular-nums">
                  {MOCK_TOTAL.requests.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right ide-text tabular-nums">
                  {MOCK_TOTAL.tokens.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right ide-text tabular-nums">
                  ${MOCK_TOTAL.cost.toFixed(2)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
