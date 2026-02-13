'use client';

import { useState, useCallback, useRef } from 'react';

// ── Types ────────────────────────────────────────────────────────────

interface SectionItem {
  id: string;
  type: string;
  settings: Record<string, unknown>;
}

interface SectionListSidebarProps {
  sections: SectionItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (from: number, to: number) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}

// ── Section type → icon mapping ──────────────────────────────────────

const SECTION_ICONS: Record<string, string> = {
  header: '☰',
  footer: '▬',
  hero: '⬛',
  slideshow: '▶',
  'featured-collection': '◈',
  'featured-product': '◇',
  'rich-text': '¶',
  image: '◻',
  'image-with-text': '◨',
  video: '▷',
  newsletter: '✉',
  'collection-list': '▤',
  'product-grid': '▦',
  multicolumn: '▥',
  collapsible: '▼',
  custom: '✦',
};

function getSectionIcon(type: string): string {
  return SECTION_ICONS[type] ?? '§';
}

function formatSectionType(type: string): string {
  return type
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Component ────────────────────────────────────────────────────────

export function SectionListSidebar({
  sections,
  selectedId,
  onSelect,
  onReorder,
  onAdd,
  onRemove,
}: SectionListSidebarProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // ── Drag handlers ────────────────────────────────────────────────

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

  // ── Empty state ──────────────────────────────────────────────────

  if (sections.length === 0) {
    return (
      <div className="flex flex-col h-full ide-surface-panel border-r ide-border">
        <div className="flex-1 flex items-center justify-center px-4">
          <p className="text-sm ide-text-muted text-center">
            No sections in this template
          </p>
        </div>
        <div className="p-3 border-t ide-border">
          <button
            type="button"
            onClick={onAdd}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-sky-500 dark:text-sky-400 hover:text-sky-400 ide-active hover:bg-sky-500/20 border border-sky-500/20 rounded-md transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Section
          </button>
        </div>
      </div>
    );
  }

  // ── Section list ─────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full ide-surface-panel border-r ide-border">
      {/* Header */}
      <div className="px-3 py-2 border-b ide-border">
        <h3 className="text-xs font-semibold ide-text-muted uppercase tracking-wider">
          Sections
        </h3>
      </div>

      {/* Section list */}
      <ul ref={listRef} className="flex-1 overflow-y-auto py-1">
        {sections.map((section, index) => {
          const isSelected = section.id === selectedId;
          const isHovered = section.id === hoveredId;
          const isDragging = dragIndex === index;
          const isDragOver = dragOverIndex === index;

          return (
            <li
              key={section.id}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              onMouseEnter={() => setHoveredId(section.id)}
              onMouseLeave={() => setHoveredId(null)}
              className={[
                'group relative flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors',
                isSelected
                  ? 'ide-active border-l-2 border-l-sky-500'
                  : 'border-l-2 border-l-transparent ide-hover',
                isDragging ? 'opacity-40' : '',
                isDragOver ? 'border-t-2 border-t-sky-500' : '',
              ].join(' ')}
              onClick={() => onSelect(section.id)}
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

              {/* Section icon */}
              <span className="flex-shrink-0 w-5 text-center text-xs ide-text-muted">
                {getSectionIcon(section.type)}
              </span>

              {/* Section name */}
              <span className="flex-1 text-sm text-gray-200 truncate">
                {formatSectionType(section.type)}
              </span>

              {/* Remove button (on hover) */}
              {isHovered && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(section.id);
                  }}
                  className="flex-shrink-0 p-1 text-gray-500 hover:text-red-400 transition-colors rounded"
                  title="Remove section"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {/* Add Section button */}
      <div className="p-3 border-t border-gray-800">
        <button
          type="button"
          onClick={onAdd}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-md transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Section
        </button>
      </div>
    </div>
  );
}
