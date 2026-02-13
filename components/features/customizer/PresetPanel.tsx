'use client';

import { useState, useCallback, useRef } from 'react';

// ── Types ────────────────────────────────────────────────────────────

interface Preset {
  name: string;
  settings?: Record<string, unknown>;
}

interface PresetPanelProps {
  presets: Preset[];
  onApply: (preset: Preset) => void;
  onSave: (name: string) => void;
  onExport: () => void;
  onImport: (json: string) => void;
}

// ── Component ────────────────────────────────────────────────────────

export function PresetPanel({
  presets,
  onApply,
  onSave,
  onExport,
  onImport,
}: PresetPanelProps) {
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saveName, setSaveName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Save handler ───────────────────────────────────────────────────

  const handleSave = useCallback(() => {
    const trimmed = saveName.trim();
    if (!trimmed) return;
    onSave(trimmed);
    setSaveName('');
    setShowSaveInput(false);
  }, [saveName, onSave]);

  // ── Import handler ─────────────────────────────────────────────────

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          onImport(reader.result);
        }
      };
      reader.readAsText(file);

      // Reset so the same file can be re-imported
      e.target.value = '';
    },
    [onImport]
  );

  // ── Helpers ────────────────────────────────────────────────────────

  function settingsCount(preset: Preset): number {
    return preset.settings ? Object.keys(preset.settings).length : 0;
  }

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col ide-surface-panel border ide-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b ide-border">
        <h4 className="text-xs font-semibold ide-text-muted uppercase tracking-wider">
          Presets
        </h4>
        <span className="text-xs ide-text-muted">{presets.length} preset{presets.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Preset list */}
      {presets.length === 0 ? (
        <div className="px-3 py-6 text-center">
          <p className="text-sm ide-text-muted">No presets available</p>
        </div>
      ) : (
        <ul className="divide-y divide-stone-200 dark:divide-white/10 max-h-48 overflow-y-auto">
          {presets.map((preset, index) => (
            <li
              key={`${preset.name}-${index}`}
              className="flex items-center gap-2 px-3 py-2 ide-hover transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm ide-text truncate">{preset.name}</p>
                <p className="text-xs ide-text-muted">
                  {settingsCount(preset)} setting{settingsCount(preset) !== 1 ? 's' : ''}
                </p>
              </div>

              <button
                type="button"
                onClick={() => onApply(preset)}
                className="flex-shrink-0 px-2.5 py-1 text-xs font-medium text-sky-500 dark:text-sky-400 hover:text-sky-400 ide-active hover:bg-sky-500/20 border border-sky-500/20 rounded-md transition-colors"
              >
                Apply
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Actions */}
      <div className="border-t ide-border p-3 space-y-2">
        {/* Save current */}
        {showSaveInput ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') {
                  setShowSaveInput(false);
                  setSaveName('');
                }
              }}
              placeholder="Preset name"
              className="flex-1 ide-input text-sm px-3 py-1.5"
              autoFocus
            />
            <button
              type="button"
              onClick={handleSave}
              disabled={!saveName.trim()}
              className="px-3 py-1.5 text-xs font-medium text-sky-500 dark:text-sky-400 ide-active hover:bg-sky-500/20 border border-sky-500/20 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setShowSaveInput(false);
                setSaveName('');
              }}
              className="px-3 py-1.5 text-xs font-medium ide-text-muted hover:ide-text ide-surface-input ide-hover border ide-border rounded-md transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowSaveInput(true)}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-sky-500 dark:text-sky-400 hover:text-sky-400 ide-active hover:bg-sky-500/20 border border-sky-500/20 rounded-md transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
            Save Current
          </button>
        )}

        {/* Export / Import row */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onExport}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium ide-text-2 hover:ide-text ide-surface-input ide-hover border ide-border rounded-md transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium ide-text-2 hover:ide-text ide-surface-input ide-hover border ide-border rounded-md transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Import
          </button>

          {/* Hidden file input for import */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      </div>
    </div>
  );
}
