'use client';

import { useState, useCallback, useMemo } from 'react';
import type { SchemaSetting } from '@/hooks/useSchemaParser';

// ── Types ────────────────────────────────────────────────────────────

interface SchemaBuilderInlineProps {
  settings: SchemaSetting[];
  onAddSetting: (setting: SchemaSetting) => void;
  onRemoveSetting: (id: string) => void;
  onReorder: (from: number, to: number) => void;
}

// ── Constants ────────────────────────────────────────────────────────

const SETTING_TYPES = [
  'text',
  'textarea',
  'number',
  'range',
  'select',
  'checkbox',
  'color',
  'image_picker',
  'url',
  'richtext',
  'font_picker',
  'collection',
  'product',
] as const;

const TYPE_ICONS: Record<string, string> = {
  text: 'T',
  textarea: '¶',
  number: '#',
  range: '↔',
  select: '▾',
  checkbox: '☑',
  color: '◆',
  image_picker: '◻',
  url: '🔗',
  richtext: '≡',
  font_picker: 'Aa',
  collection: '◈',
  product: '◇',
};

type ConditionOperator = 'equals' | 'not_equals';

interface DependencyRule {
  settingId: string;
  operator: ConditionOperator;
  value: string;
}

interface NewSettingForm {
  type: (typeof SETTING_TYPES)[number];
  id: string;
  label: string;
  dependency: DependencyRule | null;
}

const EMPTY_FORM: NewSettingForm = {
  type: 'text',
  id: '',
  label: '',
  dependency: null,
};

// ── Helpers ──────────────────────────────────────────────────────────

function formatType(type: string): string {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Component ────────────────────────────────────────────────────────

export function SchemaBuilderInline({
  settings,
  onAddSetting,
  onRemoveSetting,
  onReorder,
}: SchemaBuilderInlineProps) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewSettingForm>(EMPTY_FORM);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // ── Validation ─────────────────────────────────────────────────────

  const idSet = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of settings) {
      counts[s.id] = (counts[s.id] ?? 0) + 1;
    }
    return counts;
  }, [settings]);

  const duplicateIds = useMemo(
    () => new Set(Object.entries(idSet).filter(([, c]) => c > 1).map(([id]) => id)),
    [idSet]
  );

  // ── Drag handlers ──────────────────────────────────────────────────

  const handleDragStart = useCallback(
    (e: React.DragEvent, index: number) => {
      setDragIndex(index);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
    },
    []
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDragOverIndex(index);
    },
    []
  );

  const handleDrop = useCallback(
    (e: React.DragEvent, toIndex: number) => {
      e.preventDefault();
      if (dragIndex !== null && dragIndex !== toIndex) {
        onReorder(dragIndex, toIndex);
      }
      setDragIndex(null);
      setDragOverIndex(null);
    },
    [dragIndex, onReorder]
  );

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDragOverIndex(null);
  }, []);

  // ── Form handlers ──────────────────────────────────────────────────

  const handleAdd = useCallback(() => {
    if (!form.id.trim() || !form.label.trim()) return;

    const newSetting: SchemaSetting = {
      type: form.type,
      id: form.id.trim(),
      label: form.label.trim(),
    } as SchemaSetting;

    onAddSetting(newSetting);
    setForm(EMPTY_FORM);
    setShowForm(false);
  }, [form, onAddSetting]);

  const canSubmit = form.id.trim().length > 0 && form.label.trim().length > 0;

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col ide-surface-panel border ide-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b ide-border">
        <h4 className="text-xs font-semibold ide-text-muted uppercase tracking-wider">
          Schema Settings
        </h4>
        <span className="text-xs ide-text-muted">{settings.length} setting{settings.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Settings list */}
      {settings.length === 0 ? (
        <div className="px-3 py-6 text-center">
          <p className="text-sm ide-text-muted">No settings defined</p>
        </div>
      ) : (
        <ul className="divide-y divide-stone-200 dark:divide-white/10 max-h-64 overflow-y-auto">
          {settings.map((setting, index) => {
            const isDuplicate = duplicateIds.has(setting.id);
            const missingLabel = !setting.label?.trim();
            const isDragging = dragIndex === index;
            const isDragOver = dragOverIndex === index;

            return (
              <li
                key={`${setting.id}-${index}`}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
                className={[
                  'group flex items-center gap-2 px-3 py-2 transition-colors ide-hover',
                  isDragging ? 'opacity-40' : '',
                  isDragOver ? 'border-t-2 border-t-sky-500' : '',
                ].join(' ')}
              >
                {/* Grip handle */}
                <span className="flex-shrink-0 ide-text-quiet hover:ide-text-muted cursor-grab active:cursor-grabbing">
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <circle cx="9" cy="5" r="1.5" />
                    <circle cx="15" cy="5" r="1.5" />
                    <circle cx="9" cy="12" r="1.5" />
                    <circle cx="15" cy="12" r="1.5" />
                    <circle cx="9" cy="19" r="1.5" />
                    <circle cx="15" cy="19" r="1.5" />
                  </svg>
                </span>

                {/* Type icon */}
                <span className="flex-shrink-0 w-5 text-center text-xs ide-text-muted font-mono">
                  {TYPE_ICONS[setting.type] ?? '?'}
                </span>

                {/* Setting info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm ide-text truncate">
                      {setting.label || '(no label)'}
                    </span>
                    {/* Validation badges */}
                    {isDuplicate && (
                      <span className="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-medium bg-red-500/20 text-red-400 rounded">
                        Duplicate ID
                      </span>
                    )}
                    {missingLabel && (
                      <span className="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-medium bg-yellow-500/20 text-yellow-400 rounded">
                        No Label
                      </span>
                    )}
                  </div>
                  <p className="text-xs ide-text-muted truncate">
                    {formatType(setting.type)} &middot; {setting.id}
                  </p>
                </div>

                {/* Delete button */}
                <button
                  type="button"
                  onClick={() => onRemoveSetting(setting.id)}
                  className="flex-shrink-0 p-1 ide-text-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all rounded"
                  title="Remove setting"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Add Setting form / button */}
      <div className="border-t ide-border">
        {showForm ? (
          <div className="p-3 space-y-3">
            {/* Type dropdown */}
            <div>
              <label className="block text-xs ide-text-muted mb-1">Type</label>
              <select
                value={form.type}
                onChange={(e) =>
                  setForm((f) => ({ ...f, type: e.target.value as (typeof SETTING_TYPES)[number] }))
                }
                className="w-full appearance-none ide-input text-sm px-3 py-1.5"
              >
                {SETTING_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {formatType(t)}
                  </option>
                ))}
              </select>
            </div>

            {/* ID input */}
            <div>
              <label className="block text-xs ide-text-muted mb-1">ID</label>
              <input
                type="text"
                value={form.id}
                onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))}
                placeholder="setting_id"
                className="w-full ide-input text-sm px-3 py-1.5"
              />
            </div>

            {/* Label input */}
            <div>
              <label className="block text-xs ide-text-muted mb-1">Label</label>
              <input
                type="text"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="Setting label"
                className="w-full ide-input text-sm px-3 py-1.5"
              />
            </div>

            {/* Dependency rules */}
            <div>
              <label className="block text-xs ide-text-muted mb-1">
                Show when (optional)
              </label>
              <div className="flex gap-2">
                <select
                  value={form.dependency?.settingId ?? ''}
                  onChange={(e) => {
                    const settingId = e.target.value;
                    if (!settingId) {
                      setForm((f) => ({ ...f, dependency: null }));
                    } else {
                      setForm((f) => ({
                        ...f,
                        dependency: {
                          settingId,
                          operator: f.dependency?.operator ?? 'equals',
                          value: f.dependency?.value ?? '',
                        },
                      }));
                    }
                  }}
                  className="flex-1 appearance-none ide-input text-xs px-2 py-1.5"
                >
                  <option value="">None</option>
                  {settings.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.id}
                    </option>
                  ))}
                </select>

                {form.dependency && (
                  <>
                    <select
                      value={form.dependency.operator}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          dependency: f.dependency
                            ? { ...f.dependency, operator: e.target.value as ConditionOperator }
                            : null,
                        }))
                      }
                      className="appearance-none ide-input text-xs px-2 py-1.5"
                    >
                      <option value="equals">equals</option>
                      <option value="not_equals">not equals</option>
                    </select>

                    <input
                      type="text"
                      value={form.dependency.value}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          dependency: f.dependency
                            ? { ...f.dependency, value: e.target.value }
                            : null,
                        }))
                      }
                      placeholder="value"
                      className="flex-1 ide-input text-xs px-2 py-1.5"
                    />
                  </>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleAdd}
                disabled={!canSubmit}
                className="flex-1 px-3 py-1.5 text-xs font-medium text-sky-500 dark:text-sky-400 ide-active hover:bg-sky-500/20 border border-sky-500/20 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => {
                  setForm(EMPTY_FORM);
                  setShowForm(false);
                }}
                className="flex-1 px-3 py-1.5 text-xs font-medium ide-text-muted hover:ide-text ide-surface-input ide-hover border ide-border rounded-md transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="p-3">
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-sky-500 dark:text-sky-400 hover:text-sky-400 ide-active hover:bg-sky-500/20 border border-sky-500/20 rounded-md transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add Setting
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
