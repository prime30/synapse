'use client';

/**
 * CustomizerMode — top-level layout for the visual theme customizer.
 *
 * EPIC 11: Three-panel layout — section tree (left), live preview (center),
 * schema settings (right). Activates via toolbar button.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useSchemaParser } from '@/hooks/useSchemaParser';
import { PreviewSyncProvider, usePreviewSync } from '@/contexts/PreviewSyncContext';
import { SectionTree } from './SectionTree';
import { SchemaSettingsPanel } from './SchemaSettingsPanel';
import { TemplateSelector } from './TemplateSelector';
import { parseTemplateJSON } from '@/lib/theme/template-parser';
import type { TemplateTree, SchemaSettingDefinition } from '@/lib/theme/template-parser';
import { BlockInstanceManager } from './BlockInstanceManager';
import { SectionHighlighter } from './SectionHighlighter';
import { SchemaBuilderInline } from './SchemaBuilderInline';
import { PresetPanel } from './PresetPanel';

// ── Types ─────────────────────────────────────────────────────────────

export interface TemplateSection {
  id: string;
  type: string;
  settings: Record<string, unknown>;
  blocks?: Array<{ id: string; type: string; settings: Record<string, unknown> }>;
  /** Raw Liquid content for schema parsing */
  content?: string;
}

export interface TemplateLayout {
  name: string;
  sections: TemplateSection[];
}

interface CustomizerModeProps {
  /** Preview iframe URL (proxied via /api/projects/[projectId]/preview) */
  previewUrl: string;
  /** Available templates to choose from */
  templates: string[];
  /** Currently active template */
  activeTemplate: string;
  /** Sections in the active template */
  sections: TemplateSection[];
  /** Connection ID for preview sync */
  connectionId?: string | null;
  /** Theme ID for preview sync */
  themeId?: string | null;
  /** Project ID for API calls */
  projectId?: string | null;
  /** Callback when template changes */
  onTemplateChange: (template: string) => void;
  /** Callback when sections are reordered */
  onSectionsReorder: (fromIndex: number, toIndex: number) => void;
  /** Callback to add a section */
  onAddSection: () => void;
  /** Callback to remove a section */
  onRemoveSection: (sectionId: string) => void;
  /** Callback when settings change (for persistence) */
  onSettingsChange?: (sectionId: string, settings: Record<string, unknown>) => void;
  /** Callback to exit customizer mode */
  onExit: () => void;
  /** Raw template JSON content for parsing into a section tree */
  templateJSON?: string;
}

// ── Sub-panels ────────────────────────────────────────────────────────

type SubPanel = 'settings' | 'blocks' | 'schema' | 'presets';

// ── Inner component (has access to PreviewSyncContext) ────────────────

function CustomizerInner({
  previewUrl,
  templates,
  activeTemplate,
  sections,
  onTemplateChange,
  onSectionsReorder,
  onAddSection,
  onRemoveSection,
  onSettingsChange,
  onExit,
  templateJSON,
}: CustomizerModeProps) {
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(
    sections[0]?.id ?? null
  );
  const [hoveredSectionId, setHoveredSectionId] = useState<string | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [activeSubPanel, setActiveSubPanel] = useState<SubPanel>('settings');
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const previewSync = usePreviewSync();

  // Wire iframe ref to preview sync
  useEffect(() => {
    previewSync.setIframeRef(iframeRef.current);
  }, [previewSync]);

  const templateTree = useMemo((): TemplateTree | null => {
    if (templateJSON) {
      return parseTemplateJSON(activeTemplate, templateJSON);
    }
    if (sections.length === 0) return null;
    return {
      name: activeTemplate,
      sections: sections.map((s) => ({
        id: s.id,
        type: s.type,
        settings: s.settings,
        blocks: s.blocks
          ? Object.fromEntries(
              s.blocks.map((b) => [b.id, { type: b.type, settings: b.settings }])
            )
          : undefined,
        block_order: s.blocks?.map((b) => b.id),
      })),
      order: sections.map((s) => s.id),
    };
  }, [templateJSON, activeTemplate, sections]);

  // Get selected section
  const selectedSection = useMemo(
    () => sections.find((s) => s.id === selectedSectionId) ?? null,
    [sections, selectedSectionId]
  );

  // Parse schema for selected section
  const schemaParser = useSchemaParser(selectedSection?.content);

  // ── Settings change handler ────────────────────────────────────────

  const handleSettingChange = useCallback(
    (value: unknown, settingId: string) => {
      if (!selectedSectionId) return;
      previewSync.updateSetting(settingId, value);
      schemaParser.setSettingValue(settingId, value);
      if (onSettingsChange && selectedSection) {
        onSettingsChange(selectedSectionId, {
          ...selectedSection.settings,
          [settingId]: value,
        });
      }
    },
    [selectedSectionId, selectedSection, previewSync, schemaParser, onSettingsChange]
  );

  // ── Block handlers ─────────────────────────────────────────────────

  const handleAddBlock = useCallback(
    (type: string) => {
      previewSync.addBlock(type);
      schemaParser.addBlockInstance(type);
    },
    [previewSync, schemaParser]
  );

  const handleRemoveBlock = useCallback(
    (blockId: string) => {
      previewSync.removeBlock(blockId);
      schemaParser.removeBlockInstance(blockId);
    },
    [previewSync, schemaParser]
  );

  const handleReorderBlocks = useCallback(
    (from: number, to: number) => {
      previewSync.reorderBlocks(from, to);
      schemaParser.reorderBlockInstances(from, to);
    },
    [previewSync, schemaParser]
  );

  // ── Section tree selection handlers ───────────────────────────────

  const handleTreeSelectSection = useCallback(
    (sectionId: string) => {
      setSelectedSectionId(sectionId);
      setSelectedBlockId(null);
    },
    []
  );

  const handleSelectBlock = useCallback(
    (sectionId: string, blockId: string) => {
      setSelectedSectionId(sectionId);
      setSelectedBlockId(blockId);
    },
    []
  );

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="flex h-full ide-surface">
      {/* Left panel — Section tree */}
      <div className="hidden lg:flex w-[240px] flex-col border-r ide-border-subtle ide-surface-inset shrink-0">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b ide-border">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-sky-500 dark:text-sky-400">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18" />
              <path d="M9 21V9" />
            </svg>
            <span className="text-sm font-medium ide-text">Customizer</span>
          </div>
          <button
            type="button"
            onClick={onExit}
            className="p-1 rounded ide-text-muted ide-hover transition-colors"
            title="Exit Customizer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Template selector */}
        <div className="px-3 py-2 border-b ide-border">
          <TemplateSelector
            templates={templates}
            selected={activeTemplate}
            onChange={onTemplateChange}
          />
        </div>

        {/* Section tree */}
        <div className="flex-1 overflow-hidden">
          {templateTree ? (
            <SectionTree
              templateTree={templateTree}
              selectedSectionId={selectedSectionId}
              selectedBlockId={selectedBlockId}
              onSelectSection={handleTreeSelectSection}
              onSelectBlock={handleSelectBlock}
            />
          ) : (
            <div className="flex items-center justify-center h-full px-4">
              <p className="text-sm ide-text-muted text-center">
                Import a theme to use the customizer
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Center panel — Preview */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Preview toolbar */}
        <div className="flex items-center justify-between px-3 py-2 border-b ide-border ide-surface-panel shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs ide-text-muted">Preview</span>
            {previewSync.isSyncing && (
              <span className="text-[10px] text-sky-500 dark:text-sky-400 animate-pulse">Syncing...</span>
            )}
            {previewSync.syncError && (
              <span className="text-[10px] text-red-500 dark:text-red-400">{previewSync.syncError}</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <span className="text-[10px] ide-text-muted">Accurate Preview</span>
              <button
                type="button"
                onClick={() =>
                  previewSync.setMode(previewSync.mode === 'server' ? 'local' : 'server')
                }
                className={`relative w-8 h-4 rounded-full transition-colors ${
                  previewSync.mode === 'server' ? 'bg-sky-500' : 'ide-surface-input'
                }`}
                aria-label={previewSync.mode === 'server' ? 'Switch to local preview' : 'Switch to server preview'}
              >
                <span
                  className={`absolute top-0.5 w-3 h-3 rounded-full bg-white dark:bg-stone-200 transition-transform ${
                    previewSync.mode === 'server' ? 'left-4' : 'left-0.5'
                  }`}
                />
              </button>
            </label>

            <button
              type="button"
              onClick={previewSync.refreshPreview}
              className="p-1 rounded ide-text-muted hover:ide-text ide-hover transition-colors"
              title="Refresh Preview"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
            </button>
          </div>
        </div>

        {/* Preview iframe */}
        <div className="flex-1 relative ide-surface">
          <iframe
            ref={iframeRef}
            src={previewUrl}
            className="w-full h-full border-0"
            title="Theme Preview"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />

          <SectionHighlighter
            iframeRef={iframeRef}
            hoveredSectionId={hoveredSectionId}
            selectedSectionId={selectedSectionId}
          />
        </div>
      </div>

      {/* Right panel — Schema settings */}
      <div className="hidden lg:flex w-[280px] flex-col border-l ide-border-subtle ide-surface-inset shrink-0">
        {selectedSection && schemaParser.schema ? (
          <>
            {/* Sub-panel tabs */}
            <div className="flex border-b ide-border shrink-0">
              {(['settings', 'blocks', 'schema', 'presets'] as SubPanel[]).map(
                (panel) => (
                  <button
                    key={panel}
                    type="button"
                    onClick={() => setActiveSubPanel(panel)}
                    className={`flex-1 px-2 py-1.5 text-[10px] font-medium capitalize transition-colors relative ${
                      activeSubPanel === panel
                        ? 'text-sky-500 dark:text-sky-400'
                        : 'ide-text-muted ide-hover'
                    }`}
                  >
                    {panel}
                    {activeSubPanel === panel && (
                      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-sky-500 dark:bg-sky-400" />
                    )}
                  </button>
                )
              )}
            </div>

            {/* Sub-panel content */}
            <div className="flex-1 overflow-hidden">
              {activeSubPanel === 'settings' && (
                <SchemaSettingsPanel
                  sectionName={selectedSection.type
                    .replace(/[-_]/g, ' ')
                    .replace(/\b\w/g, (c) => c.toUpperCase())}
                  settings={schemaParser.schema.settings as SchemaSettingDefinition[]}
                  values={schemaParser.settingValues}
                  onSettingChange={(settingId, value) =>
                    handleSettingChange(value, settingId)
                  }
                />
              )}

              {activeSubPanel === 'blocks' && (
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  <BlockInstanceManager
                    blockTypes={schemaParser.schema.blocks.map((b) => ({
                      type: b.type,
                      name: b.name,
                      limit: b.limit,
                    }))}
                    instances={schemaParser.blockInstances}
                    onAdd={handleAddBlock}
                    onRemove={handleRemoveBlock}
                    onReorder={handleReorderBlocks}
                    onSelect={(blockId) => {
                      const el = document.getElementById(`block-${blockId}`);
                      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      setActiveSubPanel('settings');
                    }}
                  />
                </div>
              )}

              {activeSubPanel === 'schema' && (
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  <SchemaBuilderInline
                    settings={schemaParser.schema.settings}
                    onAddSetting={schemaParser.addSetting}
                    onRemoveSetting={schemaParser.removeSetting}
                    onReorder={() => {}}
                  />
                </div>
              )}

              {activeSubPanel === 'presets' && (
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  <PresetPanel
                    presets={schemaParser.schema.presets.map((p) => ({
                      name: p.name,
                      settings: p.settings,
                    }))}
                    onApply={(preset) => {
                      if (preset.settings) {
                        previewSync.batchUpdateSettings(preset.settings);
                      }
                    }}
                    onSave={(name) => {
                      const json = schemaParser.getSerializedSchema();
                      if (json) {
                        const blob = new Blob([json], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${name.replace(/\s+/g, '-').toLowerCase()}-preset.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }
                    }}
                    onExport={() => {
                      const json = schemaParser.getSerializedSchema();
                      if (json) {
                        const blob = new Blob([json], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${selectedSection.type}-schema.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }
                    }}
                    onImport={(json) => {
                      try {
                        const parsed = JSON.parse(json);
                        if (parsed?.settings && typeof parsed.settings === 'object') {
                          previewSync.batchUpdateSettings(parsed.settings as Record<string, unknown>);
                        }
                      } catch {
                        // Invalid JSON
                      }
                    }}
                  />
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center px-4">
            <p className="text-sm ide-text-muted text-center">
              {sections.length === 0
                ? 'Import a theme to use the customizer'
                : 'Select a section to edit its settings'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Exported wrapper with PreviewSyncProvider ─────────────────────────

export function CustomizerMode(props: CustomizerModeProps) {
  return (
    <PreviewSyncProvider
      connectionId={props.connectionId}
      themeId={props.themeId}
      projectId={props.projectId}
    >
      <CustomizerInner {...props} />
    </PreviewSyncProvider>
  );
}
