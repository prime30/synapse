'use client';

// ── Types ────────────────────────────────────────────────────────────

interface TemplateSelectorProps {
  templates: string[];
  selected: string;
  onChange: (template: string) => void;
  /** Optional map of template → section count for display */
  sectionCounts?: Record<string, number>;
}

// ── Component ────────────────────────────────────────────────────────

export function TemplateSelector({
  templates,
  selected,
  onChange,
  sectionCounts,
}: TemplateSelectorProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 ide-surface-panel border-b ide-border">
      <label
        htmlFor="template-selector"
        className="text-xs font-semibold ide-text-muted uppercase tracking-wider whitespace-nowrap"
      >
        Template
      </label>

      <div className="relative flex-1">
        <select
          id="template-selector"
          value={selected}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none ide-input text-sm pl-3 pr-8 py-1.5 transition-colors cursor-pointer"
        >
          {templates.map((tpl) => {
            const count = sectionCounts?.[tpl];
            const label = count != null ? `${tpl} (${count} sections)` : tpl;
            return (
              <option key={tpl} value={tpl}>
                {label}
              </option>
            );
          })}
        </select>

        {/* Custom chevron */}
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
          <svg
            className="w-3.5 h-3.5 ide-text-muted"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
    </div>
  );
}
