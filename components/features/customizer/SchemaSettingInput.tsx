'use client';

import type { SchemaSetting } from '@/hooks/useSchemaParser';

// ── Constants ────────────────────────────────────────────────────────

const INPUT_CLS = 'w-full px-2.5 py-1.5 text-sm ide-input rounded';

const TEXTAREA_CLS = `${INPUT_CLS} resize-y`;

const FONT_OPTIONS = [
  'Arial',
  'Helvetica',
  'Georgia',
  'Times New Roman',
  'Courier New',
  'Verdana',
  'Trebuchet MS',
  'Impact',
  'Comic Sans MS',
  // Google Fonts popular picks
  'Roboto',
  'Open Sans',
  'Lato',
  'Montserrat',
  'Poppins',
  'Inter',
  'Raleway',
  'Nunito',
  'Playfair Display',
  'Merriweather',
];

// ── Resource placeholder mapping ─────────────────────────────────────

const RESOURCE_PLACEHOLDER: Record<string, string> = {
  collection: 'Collection handle',
  product: 'Product handle',
  article: 'Article handle',
  blog: 'Blog handle',
  page: 'Page handle',
  link_list: 'Menu handle',
};

// ── Props ────────────────────────────────────────────────────────────

export interface SchemaSettingInputProps {
  setting: SchemaSetting;
  value: unknown;
  onChange: (value: unknown) => void;
}

// ── Component ────────────────────────────────────────────────────────

export default function SchemaSettingInput({
  setting,
  value,
  onChange,
}: SchemaSettingInputProps) {
  const renderControl = () => {
    switch (setting.type) {
      // ── Text inputs ──────────────────────────────────────────────
      case 'text':
        return (
          <input
            type="text"
            className={INPUT_CLS}
            value={(value as string) ?? ''}
            placeholder={setting.placeholder ?? ''}
            onChange={(e) => onChange(e.target.value)}
          />
        );

      case 'textarea':
        return (
          <textarea
            rows={4}
            className={TEXTAREA_CLS}
            value={(value as string) ?? ''}
            placeholder={setting.placeholder ?? ''}
            onChange={(e) => onChange(e.target.value)}
          />
        );

      case 'richtext':
        return (
          <textarea
            rows={6}
            className={TEXTAREA_CLS}
            value={(value as string) ?? ''}
            placeholder={setting.placeholder ?? 'Rich text (HTML)'}
            onChange={(e) => onChange(e.target.value)}
          />
        );

      case 'html':
        return (
          <textarea
            rows={6}
            className={`${TEXTAREA_CLS} font-mono`}
            value={(value as string) ?? ''}
            placeholder={setting.placeholder ?? '<div>...</div>'}
            onChange={(e) => onChange(e.target.value)}
          />
        );

      case 'liquid':
        return (
          <textarea
            rows={6}
            className={`${TEXTAREA_CLS} font-mono`}
            value={(value as string) ?? ''}
            placeholder={setting.placeholder ?? '{{ section.settings.title }}'}
            onChange={(e) => onChange(e.target.value)}
          />
        );

      // ── Numeric inputs ───────────────────────────────────────────
      case 'number':
        return (
          <input
            type="number"
            className={INPUT_CLS}
            value={(value as number) ?? ''}
            min={setting.min}
            max={setting.max}
            step={setting.step}
            placeholder={setting.placeholder ?? ''}
            onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          />
        );

      case 'range': {
        const rangeVal = (value as number) ?? setting.min ?? 0;
        return (
          <div className="flex items-center gap-3">
            <input
              type="range"
              className="flex-1 accent-sky-500"
              value={rangeVal}
              min={setting.min}
              max={setting.max}
              step={setting.step}
              onChange={(e) => onChange(Number(e.target.value))}
            />
            <span className="min-w-[3ch] text-right text-xs ide-text-muted tabular-nums">
              {rangeVal}
              {setting.unit ? ` ${setting.unit}` : ''}
            </span>
          </div>
        );
      }

      // ── Select / Radio ───────────────────────────────────────────
      case 'select':
        return (
          <select
            className={INPUT_CLS}
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">— Select —</option>
            {setting.options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        );

      case 'radio':
        return (
          <div className="space-y-1.5">
            {setting.options.map((opt) => (
              <label
                key={opt.value}
                className="flex items-center gap-2 text-sm ide-text-2 cursor-pointer"
              >
                <input
                  type="radio"
                  name={setting.id}
                  className="accent-sky-500"
                  value={opt.value}
                  checked={(value as string) === opt.value}
                  onChange={() => onChange(opt.value)}
                />
                {opt.label}
              </label>
            ))}
          </div>
        );

      // ── Checkbox ─────────────────────────────────────────────────
      case 'checkbox':
        return (
          <label className="flex items-center gap-2 text-sm ide-text-2 cursor-pointer">
            <input
              type="checkbox"
              className="accent-sky-500 rounded"
              checked={!!value}
              onChange={(e) => onChange(e.target.checked)}
            />
            <span>{setting.label}</span>
          </label>
        );

      // ── Color ────────────────────────────────────────────────────
      case 'color':
      case 'color_background': {
        const colorVal = (value as string) ?? '#000000';
        return (
          <div className="flex items-center gap-2">
            <input
              type="color"
              className="h-8 w-8 cursor-pointer rounded border ide-border bg-transparent p-0"
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

      // ── Image picker ─────────────────────────────────────────────
      case 'image_picker': {
        const imgSrc = value as string | null;
        return (
          <div className="space-y-2">
            {imgSrc ? (
              <div className="relative w-full h-24 rounded border ide-border overflow-hidden ide-surface-panel">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imgSrc}
                  alt={setting.label}
                  className="w-full h-full object-contain"
                />
              </div>
            ) : (
              <div className="flex items-center justify-center w-full h-24 rounded border border-dashed ide-border ide-surface-panel text-xs ide-text-muted">
                No image selected
              </div>
            )}
            <button
              type="button"
              className="w-full px-3 py-1.5 text-xs font-medium rounded border ide-border ide-text-2 ide-hover transition-colors"
              onClick={() => {
                /* placeholder — will open asset picker in V2 */
              }}
            >
              Select image
            </button>
          </div>
        );
      }

      // ── Video URL ────────────────────────────────────────────────
      case 'video_url':
        return (
          <input
            type="url"
            className={INPUT_CLS}
            value={(value as string) ?? ''}
            placeholder="YouTube or Vimeo URL"
            onChange={(e) => onChange(e.target.value)}
          />
        );

      // ── Font picker ──────────────────────────────────────────────
      case 'font_picker':
        return (
          <select
            className={INPUT_CLS}
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">— Select font —</option>
            {FONT_OPTIONS.map((font) => (
              <option key={font} value={font}>
                {font}
              </option>
            ))}
          </select>
        );

      // ── URL ──────────────────────────────────────────────────────
      case 'url':
        return (
          <input
            type="url"
            className={INPUT_CLS}
            value={(value as string) ?? ''}
            placeholder={setting.placeholder ?? 'https://'}
            onChange={(e) => onChange(e.target.value)}
          />
        );

      // ── Resource pickers (handle-based) ──────────────────────────
      case 'collection':
      case 'product':
      case 'article':
      case 'blog':
      case 'page':
      case 'link_list':
        return (
          <input
            type="text"
            className={INPUT_CLS}
            value={(value as string) ?? ''}
            placeholder={RESOURCE_PLACEHOLDER[setting.type] ?? 'Handle'}
            onChange={(e) => onChange(e.target.value)}
          />
        );

      // ── Fallback (unexpected type at runtime) ─────────────────────
      default: {
        const base = setting as SchemaSetting;
        return (
          <input
            type="text"
            className={INPUT_CLS}
            value={String(value ?? '')}
            placeholder={base.placeholder ?? ''}
            onChange={(e) => onChange(e.target.value)}
          />
        );
      }
    }
  };

  // Checkbox already renders its own label inline
  if (setting.type === 'checkbox') {
    return (
      <div className="space-y-1">
        {renderControl()}
        {setting.info && (
          <p className="text-[10px] ide-text-muted">{setting.info}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium ide-text-2">
        {setting.label}
      </label>
      {renderControl()}
      {setting.info && (
        <p className="text-[10px] ide-text-muted">{setting.info}</p>
      )}
    </div>
  );
}
