'use client';

import type { SchemaSettingDefinition } from '@/lib/theme/template-parser';

// ── Props ─────────────────────────────────────────────────────────────

interface SchemaSettingsPanelProps {
  sectionName: string;
  settings: SchemaSettingDefinition[];
  values: Record<string, unknown>;
  onSettingChange: (settingId: string, value: unknown) => void;
}

// ── Shared styles ─────────────────────────────────────────────────────

const INPUT_CLS = 'w-full px-2.5 py-1.5 text-sm ide-input rounded';
const TEXTAREA_CLS = `${INPUT_CLS} resize-y`;

// ── Individual setting control ────────────────────────────────────────

function SettingControl({
  setting,
  value,
  onChange,
}: {
  setting: SchemaSettingDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  switch (setting.type) {
    case 'checkbox':
      return (
        <label className="flex items-center gap-2.5 cursor-pointer group">
          <button
            type="button"
            role="switch"
            aria-checked={!!value}
            onClick={() => onChange(!value)}
            className={[
              'relative w-8 h-4 rounded-full transition-colors shrink-0',
              value ? 'bg-sky-500' : 'bg-stone-300 dark:bg-[#1e1e1e]',
            ].join(' ')}
          >
            <span
              className={[
                'absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform',
                value ? 'left-4' : 'left-0.5',
              ].join(' ')}
            />
          </button>
          <span className="text-sm ide-text">{setting.label}</span>
        </label>
      );

    case 'text':
      return (
        <input
          type="text"
          className={INPUT_CLS}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case 'textarea':
    case 'html':
    case 'richtext':
      return (
        <textarea
          rows={setting.type === 'textarea' ? 4 : 6}
          className={setting.type === 'html' ? `${TEXTAREA_CLS} font-mono` : TEXTAREA_CLS}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case 'color': {
      const colorVal = (value as string) ?? '#000000';
      return (
        <div className="flex items-center gap-2">
          <input
            type="color"
            className="h-8 w-8 cursor-pointer rounded border ide-border bg-transparent p-0 shrink-0"
            value={colorVal}
            onChange={(e) => onChange(e.target.value)}
          />
          <input
            type="text"
            className={INPUT_CLS}
            value={colorVal}
            placeholder="#000000"
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );
    }

    case 'range': {
      const min = setting.min ?? 0;
      const max = setting.max ?? 100;
      const step = setting.step ?? 1;
      const rangeVal = (value as number) ?? min;
      return (
        <div className="flex items-center gap-3">
          <input
            type="range"
            className="flex-1 accent-sky-500"
            value={rangeVal}
            min={min}
            max={max}
            step={step}
            onChange={(e) => onChange(Number(e.target.value))}
          />
          <span className="min-w-[3ch] text-right text-xs ide-text-muted tabular-nums">
            {rangeVal}
          </span>
        </div>
      );
    }

    case 'select':
      return (
        <select
          className={INPUT_CLS}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Select...</option>
          {setting.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );

    case 'image_picker':
      return (
        <button
          type="button"
          className="w-full flex items-center justify-center gap-1.5 px-3 py-3 text-xs font-medium rounded border border-dashed ide-border ide-text-muted hover:ide-text hover:border-sky-500/40 transition-colors"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          Select image
        </button>
      );

    case 'url':
      return (
        <input
          type="url"
          className={INPUT_CLS}
          value={(value as string) ?? ''}
          placeholder="https://"
          onChange={(e) => onChange(e.target.value)}
        />
      );

    default:
      return (
        <input
          type="text"
          className={INPUT_CLS}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

// ── Main panel ────────────────────────────────────────────────────────

export function SchemaSettingsPanel({
  sectionName,
  settings,
  values,
  onSettingChange,
}: SchemaSettingsPanelProps) {
  if (settings.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-3 py-2.5 border-b ide-border">
          <h3 className="text-xs font-semibold ide-text-muted uppercase tracking-wider">
            {sectionName}
          </h3>
        </div>
        <div className="flex-1 flex items-center justify-center px-4">
          <p className="text-sm ide-text-muted text-center">
            No settings defined
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2.5 border-b ide-border shrink-0">
        <h3 className="text-xs font-semibold ide-text-muted uppercase tracking-wider">
          {sectionName}
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {settings.map((setting) => {
          const val = values[setting.id] ?? setting.default ?? '';

          if (setting.type === 'checkbox') {
            return (
              <div key={setting.id} className="space-y-1">
                <SettingControl
                  setting={setting}
                  value={val}
                  onChange={(v) => onSettingChange(setting.id, v)}
                />
                {setting.info && (
                  <p className="text-[10px] ide-text-muted pl-10">
                    {setting.info}
                  </p>
                )}
              </div>
            );
          }

          return (
            <div key={setting.id} className="space-y-1.5">
              <label className="block text-xs font-medium ide-text">
                {setting.label}
              </label>
              <SettingControl
                setting={setting}
                value={val}
                onChange={(v) => onSettingChange(setting.id, v)}
              />
              {setting.info && (
                <p className="text-[10px] ide-text-muted">{setting.info}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
