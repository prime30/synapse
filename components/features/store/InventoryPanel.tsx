'use client';

import { useState, useCallback, useMemo } from 'react';
import { Package } from 'lucide-react';
import { useShopifyInventory } from '@/hooks/useShopifyInventory';

// ── Types ─────────────────────────────────────────────────────────────

interface InventoryPanelProps {
  connectionId: string;
}

// ── Loading skeleton ──────────────────────────────────────────────────

function SkeletonTable() {
  return (
    <div className="p-3 animate-pulse space-y-2">
      <div className="h-8 ide-surface-inset rounded w-full" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-6 ide-surface-inset rounded w-full" />
      ))}
    </div>
  );
}

// ── Editable cell ─────────────────────────────────────────────────────

function EditableCell({
  value,
  onSave,
}: {
  value: number;
  onSave: (quantity: number) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        const parsed = parseInt(draft, 10);
        if (!isNaN(parsed)) {
          onSave(parsed);
        }
        setIsEditing(false);
      } else if (e.key === 'Escape') {
        setDraft(String(value));
        setIsEditing(false);
      }
    },
    [draft, onSave, value],
  );

  const handleBlur = useCallback(() => {
    const parsed = parseInt(draft, 10);
    if (!isNaN(parsed) && parsed !== value) {
      onSave(parsed);
    }
    setIsEditing(false);
  }, [draft, onSave, value]);

  if (isEditing) {
    return (
      <input
        type="number"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        autoFocus
        className="w-16 px-1.5 py-0.5 text-xs ide-input border-sky-500/50 rounded outline-none focus:border-sky-500 text-center"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(String(value));
        setIsEditing(true);
      }}
      className="w-16 px-1.5 py-0.5 text-xs ide-text-2 hover:ide-text ide-hover rounded text-center transition-colors cursor-text"
      title="Click to edit"
    >
      {value}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────

export function InventoryPanel({ connectionId }: InventoryPanelProps) {
  const { products, locations, levels, isLoading, error, refetch, setLevel } =
    useShopifyInventory(connectionId);

  // Build a lookup map for levels: `${inventoryItemId}:${locationId}` -> available
  const levelMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of levels) {
      map.set(`${l.inventoryItemId}:${l.locationId}`, l.available);
    }
    return map;
  }, [levels]);

  // Flatten products into variant rows
  const rows = useMemo(() => {
    return products.flatMap((product) =>
      product.variants.map((variant) => ({
        productTitle: product.title,
        variantTitle: variant.title,
        sku: variant.sku,
        inventoryItemId: variant.inventoryItemId,
      })),
    );
  }, [products]);

  const handleSetLevel = useCallback(
    (inventoryItemId: string, locationId: string, quantity: number) => {
      setLevel(inventoryItemId, locationId, quantity);
    },
    [setLevel],
  );

  // ── Loading state ───────────────────────────────────────────────────

  if (isLoading && products.length === 0) {
    return <SkeletonTable />;
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

  // ── Empty state ─────────────────────────────────────────────────────

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center py-8 px-4 text-center">
        <Package className="h-7 w-7 mb-2 ide-text-muted" aria-hidden />
        <p className="text-sm ide-text-muted font-medium">No inventory data</p>
        <p className="text-[11px] ide-text-quiet mt-1 max-w-[240px]">
          Add products with inventory tracking in Shopify to see inventory levels here.
        </p>
      </div>
    );
  }

  // ── Inventory matrix ────────────────────────────────────────────────

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        {/* Header */}
        <thead>
          <tr className="border-b ide-border">
            <th className="text-left px-3 py-2 ide-text-muted font-medium sticky left-0 ide-surface-panel">
              Product / Variant
            </th>
            <th className="text-left px-3 py-2 ide-text-muted font-medium">
              SKU
            </th>
            {locations.map((loc) => (
              <th
                key={loc.id}
                className="text-center px-3 py-2 ide-text-muted font-medium whitespace-nowrap"
              >
                {loc.name}
              </th>
            ))}
          </tr>
        </thead>

        {/* Body */}
        <tbody className="divide-y ide-border">
          {rows.map((row) => (
            <tr
              key={row.inventoryItemId}
              className="ide-hover transition-colors"
            >
              {/* Product + variant name */}
              <td className="px-3 py-2 sticky left-0 ide-surface-panel">
                <div className="flex flex-col">
                  <span className="ide-text font-medium truncate max-w-[180px]">
                    {row.productTitle}
                  </span>
                  {row.variantTitle !== 'Default Title' && (
                    <span className="text-[10px] ide-text-muted truncate max-w-[180px]">
                      {row.variantTitle}
                    </span>
                  )}
                </div>
              </td>

              {/* SKU */}
              <td className="px-3 py-2">
                <code className="text-[10px] ide-text-muted font-mono">
                  {row.sku || '—'}
                </code>
              </td>

              {/* Quantity cells */}
              {locations.map((loc) => {
                const key = `${row.inventoryItemId}:${loc.id}`;
                const available = levelMap.get(key) ?? 0;

                return (
                  <td key={loc.id} className="px-3 py-1 text-center">
                    <EditableCell
                      value={available}
                      onSave={(qty) =>
                        handleSetLevel(row.inventoryItemId, loc.id, qty)
                      }
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
