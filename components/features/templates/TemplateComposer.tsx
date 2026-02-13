'use client';

import { useState, useCallback, useMemo } from 'react';
import { Layout, Loader2, FileWarning } from 'lucide-react';
import { useTemplateLayout } from '@/hooks/useTemplateLayout';
import { SectionSlot } from './SectionSlot';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TemplateComposerProps {
  projectId: string;
}

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------

function SectionSkeleton() {
  return (
    <div className="rounded-lg border ide-border ide-surface-panel p-3 animate-pulse">
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 rounded ide-surface-input" />
        <div className="w-4 h-4 rounded ide-surface-input" />
        <div className="w-24 h-4 rounded ide-surface-input" />
        <div className="w-16 h-3 rounded ide-surface-input ml-auto" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TemplateComposer
// ---------------------------------------------------------------------------

export function TemplateComposer({ projectId }: TemplateComposerProps) {
  const {
    templates,
    activeTemplate,
    setActiveTemplate,
    layout,
    reorderSections,
    reorderBlocks,
    isLoading,
    isSaving,
    error,
  } = useTemplateLayout(projectId);

  // ── Section drag state ──────────────────────────────────────────────────
  const [draggingSectionIdx, setDraggingSectionIdx] = useState<number | null>(
    null,
  );
  const [dragOrder, setDragOrder] = useState<string[]>([]);

  // Derive the base order from layout (no effect needed)
  const layoutOrder = useMemo(
    () => layout?.sections.map((s) => s.id) ?? [],
    [layout],
  );

  const handleSectionDragStart = useCallback(
    (e: React.DragEvent, index: number) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
      setDragOrder(layoutOrder);
      setDraggingSectionIdx(index);
    },
    [layoutOrder],
  );

  const handleSectionDragOver = useCallback(
    (e: React.DragEvent, overIndex: number) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      if (draggingSectionIdx === null || draggingSectionIdx === overIndex)
        return;

      setDragOrder((prev) => {
        const order = [...prev];
        const [moved] = order.splice(draggingSectionIdx, 1);
        order.splice(overIndex, 0, moved);
        return order;
      });
      setDraggingSectionIdx(overIndex);
    },
    [draggingSectionIdx],
  );

  const handleSectionDragEnd = useCallback(() => {
    if (draggingSectionIdx !== null) {
      reorderSections(dragOrder);
    }
    setDraggingSectionIdx(null);
  }, [draggingSectionIdx, dragOrder, reorderSections]);

  // ── Render helpers ──────────────────────────────────────────────────────

  // Show drag-preview order during drag, layout order otherwise
  const orderedSections =
    layout && draggingSectionIdx !== null
      ? dragOrder
          .map((id) => layout.sections.find((s) => s.id === id))
          .filter(Boolean)
      : layout?.sections ?? [];

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full ide-surface ide-text">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b ide-border">
        <Layout className="w-4 h-4 text-purple-400" />
        <h2 className="text-sm font-semibold">Template Composer</h2>

        {isSaving && (
          <span className="ml-auto flex items-center gap-1 text-xs text-sky-500 dark:text-sky-400">
            <Loader2 className="w-3 h-3 animate-spin" />
            Saving…
          </span>
        )}
      </div>

      {/* Template selector */}
      <div className="px-4 py-3 border-b ide-border">
        <label
          htmlFor="template-select"
          className="block text-xs ide-text-muted mb-1"
        >
          Template
        </label>
        <select
          id="template-select"
          value={activeTemplate ?? ''}
          onChange={(e) => setActiveTemplate(e.target.value)}
          disabled={templates.length === 0}
          className="w-full rounded-md ide-surface-input border ide-border text-sm ide-text px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50"
        >
          {templates.length === 0 && (
            <option value="">No templates found</option>
          )}
          {templates.map((t) => (
            <option key={t.path} value={t.path}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mt-3 rounded-md bg-red-900/30 border border-red-800/60 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {/* Loading */}
        {isLoading && (
          <div className="space-y-2">
            <SectionSkeleton />
            <SectionSkeleton />
            <SectionSkeleton />
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !layout && !error && (
          <div className="flex flex-col items-center justify-center py-12 ide-text-muted gap-3">
            <FileWarning className="w-8 h-8 ide-text-quiet" />
            <p className="text-sm">
              {templates.length === 0
                ? 'No template files found in this project.'
                : 'Select a template to get started.'}
            </p>
          </div>
        )}

        {/* Section list */}
        {!isLoading &&
          layout &&
          orderedSections.map((section, idx) =>
            section ? (
              <SectionSlot
                key={section.id}
                section={section}
                index={idx}
                isDragging={draggingSectionIdx === idx}
                onDragStart={handleSectionDragStart}
                onDragOver={handleSectionDragOver}
                onDragEnd={handleSectionDragEnd}
                onReorderBlocks={reorderBlocks}
              />
            ) : null,
          )}

        {/* Section count footer */}
        {!isLoading && layout && layout.sections.length > 0 && (
          <p className="text-[11px] ide-text-quiet pt-2 text-center">
            {layout.sections.length} section
            {layout.sections.length !== 1 ? 's' : ''} · Drag to reorder
          </p>
        )}
      </div>
    </div>
  );
}
