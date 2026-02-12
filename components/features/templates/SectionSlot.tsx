'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  GripVertical,
  ChevronDown,
  ChevronRight,
  Layers,
  Settings,
} from 'lucide-react';
import type { TemplateSection, TemplateBlock } from '@/hooks/useTemplateLayout';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SectionSlotProps {
  section: TemplateSection;
  index: number;
  isDragging?: boolean;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
  onReorderBlocks: (sectionId: string, newOrder: string[]) => void;
}

// ---------------------------------------------------------------------------
// Block row (internal)
// ---------------------------------------------------------------------------

function BlockRow({
  block,
  index,
  isDragging,
  onDragStart,
  onDragOver,
  onDragEnd,
}: {
  block: TemplateBlock;
  index: number;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent, index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
}) {
  const settingsCount = Object.keys(block.settings).length;

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDragEnd={onDragEnd}
      className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs transition-all ${
        isDragging
          ? 'opacity-40 border border-dashed border-blue-500/50'
          : 'hover:bg-gray-700/30 border border-transparent'
      }`}
    >
      <GripVertical className="w-3 h-3 text-gray-600 cursor-grab shrink-0" />
      <span className="text-blue-400 font-mono truncate">{block.type}</span>
      <span className="text-gray-600 truncate">{block.id}</span>
      {settingsCount > 0 && (
        <span className="ml-auto text-gray-600 shrink-0">
          {settingsCount} setting{settingsCount !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SectionSlot
// ---------------------------------------------------------------------------

export function SectionSlot({
  section,
  index,
  isDragging = false,
  onDragStart,
  onDragOver,
  onDragEnd,
  onReorderBlocks,
}: SectionSlotProps) {
  const [expanded, setExpanded] = useState(false);
  const [draggingBlockIdx, setDraggingBlockIdx] = useState<number | null>(null);
  const blockOrderRef = useRef<string[]>(section.blocks.map((b) => b.id));

  // Keep ref in sync with incoming props
  useEffect(() => {
    blockOrderRef.current = section.blocks.map((b) => b.id);
  }, [section.blocks]);

  const settingsCount = Object.keys(section.settings).length;
  const hasBlocks = section.blocks.length > 0;

  // ── Block drag handlers ─────────────────────────────────────────────────
  const handleBlockDragStart = useCallback(
    (e: React.DragEvent, blockIndex: number) => {
      e.stopPropagation(); // prevent section drag
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(blockIndex));
      setDraggingBlockIdx(blockIndex);
    },
    [],
  );

  const handleBlockDragOver = useCallback(
    (e: React.DragEvent, overIndex: number) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';

      if (draggingBlockIdx === null || draggingBlockIdx === overIndex) return;

      const order = [...blockOrderRef.current];
      const [moved] = order.splice(draggingBlockIdx, 1);
      order.splice(overIndex, 0, moved);
      blockOrderRef.current = order;
      setDraggingBlockIdx(overIndex);
    },
    [draggingBlockIdx],
  );

  const handleBlockDragEnd = useCallback(() => {
    if (draggingBlockIdx !== null) {
      onReorderBlocks(section.id, blockOrderRef.current);
    }
    setDraggingBlockIdx(null);
  }, [draggingBlockIdx, onReorderBlocks, section.id]);

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDragEnd={onDragEnd}
      className={`rounded-lg border transition-all ${
        isDragging
          ? 'opacity-40 border-dashed border-blue-500/60 bg-blue-950/20'
          : 'border-gray-800 bg-gray-900/50 hover:border-gray-700'
      }`}
    >
      {/* Section header */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <GripVertical className="w-4 h-4 text-gray-600 cursor-grab shrink-0" />

        {/* Expand toggle */}
        {hasBlocks ? (
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="text-gray-400 hover:text-gray-200 transition-colors"
          >
            {expanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        ) : (
          <span className="w-4" />
        )}

        {/* Section info */}
        <Layers className="w-4 h-4 text-purple-400 shrink-0" />
        <span className="text-sm font-medium text-gray-100 truncate">
          {section.type}
        </span>
        <span className="text-xs text-gray-500 font-mono truncate">
          {section.id}
        </span>

        {/* Badges */}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {hasBlocks && (
            <span className="text-xs text-gray-500">
              {section.blocks.length} block
              {section.blocks.length !== 1 ? 's' : ''}
            </span>
          )}
          {settingsCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <Settings className="w-3 h-3" />
              {settingsCount}
            </span>
          )}
        </div>
      </div>

      {/* Expanded block list */}
      {expanded && hasBlocks && (
        <div className="border-t border-gray-800/60 px-2 py-2 space-y-0.5">
          <div className="px-3 pb-1 text-[10px] uppercase tracking-wider text-gray-600">
            Blocks
          </div>
          {section.blocks.map((block, bi) => (
            <BlockRow
              key={block.id}
              block={block}
              index={bi}
              isDragging={draggingBlockIdx === bi}
              onDragStart={handleBlockDragStart}
              onDragOver={handleBlockDragOver}
              onDragEnd={handleBlockDragEnd}
            />
          ))}
        </div>
      )}
    </div>
  );
}
