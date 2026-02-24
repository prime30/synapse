'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Save, X } from 'lucide-react';
import type { ShopifyMetafield } from '@/hooks/useMetafields';
import { METAFIELD_TYPES, METAFIELD_TYPE_LABELS, type MetafieldType } from '@/hooks/useMetafields';

// ── Props ───────────────────────────────────────────────────────────────────────

export interface MetafieldFormProps {
  /** If editing, pass the existing metafield. Omit for create mode. */
  metafield?: ShopifyMetafield;
  /** Called when the user saves the form. */
  onSave: (data: {
    namespace: string;
    key: string;
    value: string;
    type: string;
    id?: number;
  }) => void;
  /** Called when the user cancels. */
  onCancel: () => void;
  /** Show a loading indicator on Save button. */
  isSaving?: boolean;
}

// ── Type-aware value input ──────────────────────────────────────────────────────

interface ValueInputProps {
  type: string;
  value: string;
  onChange: (value: string) => void;
}

function ValueInput({ type, value, onChange }: ValueInputProps) {
  const baseClasses =
    'w-full rounded-md px-3 py-2 text-sm ide-input';

  switch (type) {
    case 'single_line_text_field':
      return (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter text…"
          className={baseClasses}
        />
      );

    case 'multi_line_text_field':
      return (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter text…"
          rows={4}
          className={baseClasses + ' resize-y'}
        />
      );

    case 'number_integer':
      return (
        <input
          type="number"
          step={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
          className={baseClasses}
        />
      );

    case 'number_decimal':
      return (
        <input
          type="number"
          step={0.01}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0.00"
          className={baseClasses}
        />
      );

    case 'boolean':
      return (
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <button
            type="button"
            role="switch"
            aria-checked={value === 'true'}
            onClick={() => onChange(value === 'true' ? 'false' : 'true')}
            className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-stone-200 dark:focus:ring-offset-[oklch(0.145_0_0)] ${
              value === 'true' ? 'bg-sky-500' : 'bg-stone-400 dark:bg-stone-600'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform duration-200 ${
                value === 'true' ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
          <span className="text-sm ide-text-2">
            {value === 'true' ? 'True' : 'False'}
          </span>
        </label>
      );

    case 'date':
      return (
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={baseClasses}
        />
      );

    case 'date_time':
      return (
        <input
          type="datetime-local"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={baseClasses}
        />
      );

    case 'color': {
      // Ensure a valid hex for the color picker, default to black
      const hexValue = /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000';
      return (
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={hexValue}
            onChange={(e) => onChange(e.target.value)}
            className="h-10 w-10 cursor-pointer rounded border ide-border bg-transparent p-0.5"
          />
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="#000000"
            pattern="^#[0-9a-fA-F]{6}$"
            className={baseClasses + ' flex-1'}
          />
        </div>
      );
    }

    case 'json':
    case 'rich_text_field':
      return (
        <div>
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={type === 'json' ? '{\n  "key": "value"\n}' : 'Enter rich text JSON…'}
            rows={6}
            className={baseClasses + ' resize-y font-mono text-xs'}
          />
          {type === 'json' && (
            <p className="mt-1 text-xs ide-text-muted">
              Must be valid JSON
            </p>
          )}
        </div>
      );

    case 'url':
      return (
        <input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://example.com"
          className={baseClasses}
        />
      );

    case 'money': {
      // Money is stored as JSON: { "amount": "10.00", "currency_code": "USD" }
      let amount = '';
      let currency = 'USD';
      try {
        const parsed = JSON.parse(value);
        amount = parsed.amount ?? '';
        currency = parsed.currency_code ?? 'USD';
      } catch {
        amount = value;
      }
      const updateMoney = (field: 'amount' | 'currency_code', v: string) => {
        const obj = { amount, currency_code: currency };
        if (field === 'amount') obj.amount = v;
        else obj.currency_code = v;
        onChange(JSON.stringify(obj));
      };
      return (
        <div className="flex items-center gap-2">
          <input
            type="number"
            step={0.01}
            value={amount}
            onChange={(e) => updateMoney('amount', e.target.value)}
            placeholder="0.00"
            className={baseClasses + ' flex-1'}
          />
          <input
            type="text"
            value={currency}
            onChange={(e) => updateMoney('currency_code', e.target.value.toUpperCase())}
            placeholder="USD"
            maxLength={3}
            className={baseClasses + ' w-20 text-center uppercase'}
          />
        </div>
      );
    }

    case 'rating': {
      // Rating is stored as JSON: { "value": "4.0", "scale_min": "1.0", "scale_max": "5.0" }
      let ratingVal = '';
      try {
        const parsed = JSON.parse(value);
        ratingVal = parsed.value ?? '';
      } catch {
        ratingVal = value;
      }
      return (
        <input
          type="number"
          step={0.1}
          min={0}
          max={5}
          value={ratingVal}
          onChange={(e) => {
            try {
              const existing = JSON.parse(value);
              onChange(JSON.stringify({ ...existing, value: e.target.value }));
            } catch {
              onChange(
                JSON.stringify({
                  value: e.target.value,
                  scale_min: '1.0',
                  scale_max: '5.0',
                })
              );
            }
          }}
          placeholder="0.0"
          className={baseClasses}
        />
      );
    }

    case 'weight':
    case 'dimension':
    case 'volume': {
      // These are stored as JSON: { "value": 10, "unit": "kg" }
      let numVal = '';
      let unit = '';
      try {
        const parsed = JSON.parse(value);
        numVal = String(parsed.value ?? '');
        unit = parsed.unit ?? '';
      } catch {
        numVal = value;
      }
      const unitPlaceholder =
        type === 'weight' ? 'kg' : type === 'dimension' ? 'cm' : 'ml';
      return (
        <div className="flex items-center gap-2">
          <input
            type="number"
            step={0.01}
            value={numVal}
            onChange={(e) =>
              onChange(JSON.stringify({ value: Number(e.target.value), unit: unit || unitPlaceholder }))
            }
            placeholder="0"
            className={baseClasses + ' flex-1'}
          />
          <input
            type="text"
            value={unit}
            onChange={(e) =>
              onChange(JSON.stringify({ value: Number(numVal) || 0, unit: e.target.value }))
            }
            placeholder={unitPlaceholder}
            className={baseClasses + ' w-20 text-center'}
          />
        </div>
      );
    }

    default:
      return (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter value…"
          className={baseClasses}
        />
      );
  }
}

// ── Form Component ──────────────────────────────────────────────────────────────

export function MetafieldForm({
  metafield,
  onSave,
  onCancel,
  isSaving = false,
}: MetafieldFormProps) {
  const isEditing = !!metafield;

  const [namespace, setNamespace] = useState(metafield?.namespace ?? 'custom');
  const [key, setKey] = useState(metafield?.key ?? '');
  const [type, setType] = useState<string>(metafield?.type ?? 'single_line_text_field');
  const [value, setValue] = useState(metafield?.value ?? '');

  // Reset form when metafield prop changes
  const metafieldId = metafield?.id;
  const metafieldNamespace = metafield?.namespace;
  const metafieldKey = metafield?.key;
  const metafieldType = metafield?.type;
  const metafieldValue = metafield?.value;

  useEffect(() => {
    // Sync form state from external prop when the metafield identity changes
    const raf = requestAnimationFrame(() => {
      setNamespace(metafieldNamespace ?? 'custom');
      setKey(metafieldKey ?? '');
      setType(metafieldType ?? 'single_line_text_field');
      setValue(metafieldValue ?? '');
    });
    return () => cancelAnimationFrame(raf);
  }, [metafieldId, metafieldNamespace, metafieldKey, metafieldType, metafieldValue]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!namespace.trim() || !key.trim()) return;

      onSave({
        namespace: namespace.trim(),
        key: key.trim(),
        value,
        type,
        ...(isEditing && metafield ? { id: metafield.id } : {}),
      });
    },
    [namespace, key, value, type, isEditing, metafield, onSave]
  );

  const inputClasses =
    'w-full rounded-md px-3 py-2 text-sm ide-input';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h3 className="text-lg font-semibold ide-text">
        {isEditing ? 'Edit Metafield' : 'Create Metafield'}
      </h3>

      {/* Namespace */}
      <div>
        <label className="mb-1 block text-sm font-medium ide-text-2">
          Namespace
        </label>
        {isEditing ? (
          <p className="rounded-md border ide-border ide-surface-panel px-3 py-2 text-sm ide-text-muted">
            {namespace}
          </p>
        ) : (
          <input
            type="text"
            value={namespace}
            onChange={(e) => setNamespace(e.target.value)}
            placeholder="custom"
            required
            className={inputClasses}
          />
        )}
      </div>

      {/* Key */}
      <div>
        <label className="mb-1 block text-sm font-medium ide-text-2">
          Key
        </label>
        {isEditing ? (
          <p className="rounded-md border ide-border ide-surface-panel px-3 py-2 text-sm ide-text-muted">
            {key}
          </p>
        ) : (
          <input
            type="text"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="my_field"
            required
            className={inputClasses}
          />
        )}
      </div>

      {/* Type */}
      <div>
        <label className="mb-1 block text-sm font-medium ide-text-2">
          Type
        </label>
        {isEditing ? (
          <p className="rounded-md border ide-border ide-surface-panel px-3 py-2 text-sm ide-text-muted">
            {METAFIELD_TYPE_LABELS[type as MetafieldType] ?? type}
          </p>
        ) : (
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              // Reset value when type changes to avoid stale state
              setValue('');
            }}
            className={inputClasses}
          >
            {METAFIELD_TYPES.map((t) => (
              <option key={t} value={t}>
                {METAFIELD_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Value (type-aware) */}
      <div>
        <label className="mb-1 block text-sm font-medium ide-text-2">
          Value
        </label>
        <ValueInput type={type} value={value} onChange={setValue} />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 border-t ide-border pt-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          className="inline-flex items-center gap-1.5 rounded-md border ide-border px-3 py-1.5 text-sm ide-text-2 ide-hover disabled:opacity-50 transition-colors"
        >
          <X className="h-4 w-4" />
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSaving || !namespace.trim() || !key.trim()}
          className="inline-flex items-center gap-1.5 rounded-md bg-sky-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50 transition-colors"
        >
          <Save className="h-4 w-4" />
          {isSaving ? 'Saving…' : isEditing ? 'Update' : 'Create'}
        </button>
      </div>
    </form>
  );
}
