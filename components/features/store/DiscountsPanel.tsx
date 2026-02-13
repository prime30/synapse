'use client';

import { useState, useCallback } from 'react';
import { useShopifyDiscounts } from '@/hooks/useShopifyDiscounts';

// ── Types ─────────────────────────────────────────────────────────────

interface DiscountsPanelProps {
  connectionId: string;
}

// ── Loading skeleton ──────────────────────────────────────────────────

function SkeletonRule() {
  return (
    <div className="px-3 py-3 animate-pulse space-y-2">
      <div className="h-4 ide-surface-inset rounded w-40" />
      <div className="flex gap-2">
        <div className="h-3 ide-surface-inset rounded w-16" />
        <div className="h-3 ide-surface-inset rounded w-24" />
      </div>
    </div>
  );
}

// ── Create discount form ──────────────────────────────────────────────

function CreateDiscountForm({
  onSubmit,
  onCancel,
  isLoading,
}: {
  onSubmit: (data: {
    title: string;
    value_type: 'fixed_amount' | 'percentage';
    value: string;
    code: string;
  }) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [title, setTitle] = useState('');
  const [valueType, setValueType] = useState<'fixed_amount' | 'percentage'>('percentage');
  const [value, setValue] = useState('');
  const [code, setCode] = useState('');

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!title.trim() || !value.trim()) return;
      onSubmit({ title: title.trim(), value_type: valueType, value, code: code.trim() });
    },
    [title, valueType, value, code, onSubmit],
  );

  return (
    <form onSubmit={handleSubmit} className="px-3 py-3 border-b ide-border ide-surface-panel space-y-2.5">
      <div className="text-xs ide-text-2 font-medium mb-1">New Discount</div>

      {/* Title */}
      <input
        type="text"
        placeholder="Discount title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full px-2.5 py-1.5 text-xs rounded-md ide-input"
      />

      {/* Value type + value */}
      <div className="flex gap-2">
        <select
          value={valueType}
          onChange={(e) => setValueType(e.target.value as 'fixed_amount' | 'percentage')}
          className="px-2 py-1.5 text-xs rounded-md ide-input"
        >
          <option value="percentage">Percentage (%)</option>
          <option value="fixed_amount">Fixed Amount ($)</option>
        </select>
        <input
          type="text"
          placeholder={valueType === 'percentage' ? '10' : '5.00'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="flex-1 px-2.5 py-1.5 text-xs rounded-md ide-input"
        />
      </div>

      {/* Code */}
      <input
        type="text"
        placeholder="Discount code (e.g. SAVE10)"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        className="w-full px-2.5 py-1.5 text-xs rounded-md ide-input font-mono"
      />

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={isLoading || !title.trim() || !value.trim()}
          className="px-3 py-1.5 text-xs font-medium rounded-md bg-sky-500 text-white hover:bg-sky-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Creating...' : 'Create'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-xs font-medium rounded-md ide-surface-panel ide-text-muted hover:ide-text border ide-border transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Price rule row ────────────────────────────────────────────────────

function PriceRuleRow({
  rule,
  onDelete,
}: {
  rule: {
    id: string;
    title: string;
    value_type: string;
    value: string;
    target_type: string;
    target_selection: string;
    starts_at: string;
    ends_at: string | null;
  };
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const valueDisplay =
    rule.value_type === 'percentage'
      ? `${Math.abs(parseFloat(rule.value))}%`
      : `$${Math.abs(parseFloat(rule.value)).toFixed(2)}`;

  const targetDisplay =
    rule.target_type === 'shipping_line' ? 'Shipping' : 'Line Items';

  return (
    <div className="border-b ide-border last:border-b-0">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 ide-hover transition-colors">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="shrink-0"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`ide-text-muted transition-transform ${expanded ? 'rotate-90' : ''}`}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm ide-text font-medium truncate">{rule.title}</span>
            <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium text-purple-400 bg-purple-400/10">
              {valueDisplay}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[10px] ide-text-quiet mt-0.5">
            <span>{targetDisplay} ({rule.target_selection})</span>
            <span>·</span>
            <span>
              {new Date(rule.starts_at).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              })}
              {rule.ends_at
                ? ` — ${new Date(rule.ends_at).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })}`
                : ' — No end'}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onDelete(rule.id)}
          className="shrink-0 p-1 rounded ide-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
          title="Delete discount"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>

      {/* Expanded codes area */}
      {expanded && (
        <div className="px-6 pb-3">
          <div className="text-[10px] ide-text-muted mb-1.5">Discount Codes</div>
          <div className="ide-surface-panel rounded-md px-3 py-2 text-[11px] ide-text-muted italic">
            Discount code details load on demand. Use the Shopify Admin to manage codes for this rule.
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────

export function DiscountsPanel({ connectionId }: DiscountsPanelProps) {
  const { priceRules, isLoading, error, refetch, createDiscount, deleteDiscount } =
    useShopifyDiscounts(connectionId);
  const [showForm, setShowForm] = useState(false);

  const handleCreate = useCallback(
    async (data: {
      title: string;
      value_type: 'fixed_amount' | 'percentage';
      value: string;
      code: string;
    }) => {
      await createDiscount({
        title: data.title,
        value_type: data.value_type,
        value: `-${data.value}`,
        target_type: 'line_item',
        target_selection: 'all',
        starts_at: new Date().toISOString(),
      });
      setShowForm(false);
    },
    [createDiscount],
  );

  const handleDelete = useCallback(
    (ruleId: string) => {
      deleteDiscount(ruleId);
    },
    [deleteDiscount],
  );

  // ── Loading state ───────────────────────────────────────────────────

  if (isLoading && priceRules.length === 0) {
    return (
      <div className="divide-y ide-border">
        <SkeletonRule />
        <SkeletonRule />
        <SkeletonRule />
      </div>
    );
  }

  // ── Error state ─────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="flex flex-col items-center py-8 px-4 text-center">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-red-400 mb-2"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <p className="text-sm text-red-400 mb-1">{error}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="text-xs ide-text-muted hover:ide-text underline transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // ── Discounts list ──────────────────────────────────────────────────

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b ide-border">
        <span className="text-[11px] ide-text-muted">
          {priceRules.length} rule{priceRules.length !== 1 ? 's' : ''}
        </span>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="px-2.5 py-1 text-[11px] font-medium rounded-md ide-active text-sky-500 dark:text-sky-400 hover:bg-sky-500/20 border border-sky-500/30 transition-colors"
        >
          {showForm ? 'Cancel' : 'Create Discount'}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <CreateDiscountForm
          onSubmit={handleCreate}
          onCancel={() => setShowForm(false)}
          isLoading={isLoading}
        />
      )}

      {/* Empty state */}
      {priceRules.length === 0 && !showForm && (
        <div className="flex flex-col items-center py-8 px-4 text-center">
          <span className="text-2xl mb-2">🏷️</span>
          <p className="text-sm ide-text-muted font-medium">No discounts</p>
          <p className="text-[11px] ide-text-quiet mt-1 max-w-[240px]">
            Create a discount to offer special pricing to your customers.
          </p>
        </div>
      )}

      {/* Rules list */}
      {priceRules.length > 0 && (
        <div>
          {priceRules.map((rule) => (
            <PriceRuleRow key={rule.id} rule={rule} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
