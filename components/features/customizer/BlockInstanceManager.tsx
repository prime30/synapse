'use client';

import { useState, useCallback } from 'react';

// ── Types ────────────────────────────────────────────────────────────

interface BlockType {
  type: string;
  name: string;
  limit?: number;
}

interface BlockInstance {
  id: string;
  type: string;
  settings: Record<string, unknown>;
}

interface BlockInstanceManagerProps {
  blockTypes: BlockType[];
  instances: BlockInstance[];
  onAdd: (type: string) => void;
  onRemove: (id: string) => void;
  onReorder: (from: number, to: number) => void;
  onSelect: (id: string) => void;
  selectedId?: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────

function formatBlockName(type: string): string {
  return type
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function settingsPreview(settings: Record<string, unknown>): string {
  const entries = Object.entries(settings).slice(0, 3);
  if (entries.length === 0) return 'No settings';
  return entries
    .map(([k, v]) => {
      const val = typeof v === 'string' ? v : JSON.stringify(v);
      const truncated = val && val.length > 20 ? val.slice(0, 20) + '...' : val;
      return `${k}: ${truncated}`;
    })
    .join(' | ');
}

// ── Component ────────────────────────────────────────────────────────

export function BlockInstanceManager({
  blockTypes,
  instances,
  onAdd,
  onRemove,
  onReorder,
  onSelect,
  selectedId,
}: BlockInstanceManagerProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Count instances per block type to enforce limits
  const typeCounts = instances.reduce<Record<string, number>>((acc, inst) => {
    acc[inst.type] = (acc[inst.type] ?? 0) + 1;
    return acc;
  }, {});

  const availableTypes = blockTypes.filter((bt) => {
    if (bt.limit == null) return true;
    return (typeCounts[bt.type] ?? 0) < bt.limit;
  });

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

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col ide-surface-panel border ide-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b ide-border">
        <h4 className="text-xs font-semibold ide-text-muted uppercase tracking-wider">
          Blocks
        </h4>
        <span className="text-xs ide-text-muted">{instances.length} instance{instances.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Block list */}
      {instances.length === 0 ? (
        <div className="px-3 py-6 text-center">
          <p className="text-sm ide-text-muted">No blocks added</p>
        </div>
      ) : (
        <ul className="divide-y divide-stone-200 dark:divide-white/10">
          {instances.map((inst, index) => {
            const isSelected = inst.id === selectedId;
            const isDragging = dragIndex === index;
            const isDragOver = dragOverIndex === index;
            const blockDef = blockTypes.find((bt) => bt.type === inst.type);

            return (
              <li
                key={inst.id}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
                onClick={() => onSelect(inst.id)}
                className={[
                  'group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors',
                  isSelected
                    ? 'ide-active border-l-2 border-l-sky-500'
                    : 'border-l-2 border-l-transparent ide-hover',
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

                {/* Block info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm ide-text truncate">
                    {blockDef?.name ?? formatBlockName(inst.type)}
                  </p>
                  <p className="text-xs ide-text-muted truncate">
                    {settingsPreview(inst.settings)}
                  </p>
                </div>

                {/* Delete button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(inst.id);
                  }}
                  className="flex-shrink-0 p-1 ide-text-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all rounded"
                  title="Remove block"
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

      {/* Add block button + dropdown */}
      <div className="relative p-3 border-t ide-border">
        <button
          type="button"
          onClick={() => setDropdownOpen((p) => !p)}
          disabled={availableTypes.length === 0}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-sky-500 dark:text-sky-400 hover:text-sky-400 ide-active hover:bg-sky-500/20 border border-sky-500/20 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Block
        </button>

        {dropdownOpen && availableTypes.length > 0 && (
          <div className="absolute bottom-full left-3 right-3 mb-1 ide-surface-input border ide-border rounded-md shadow-lg z-10 max-h-48 overflow-y-auto">
            {availableTypes.map((bt) => {
              const count = typeCounts[bt.type] ?? 0;
              return (
                <button
                  key={bt.type}
                  type="button"
                  onClick={() => {
                    onAdd(bt.type);
                    setDropdownOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-sm ide-text ide-hover transition-colors flex items-center justify-between"
                >
                  <span>{bt.name}</span>
                  {bt.limit != null && (
                    <span className="text-xs ide-text-muted">
                      {count}/{bt.limit}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
