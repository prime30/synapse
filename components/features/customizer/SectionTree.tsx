'use client';

import { useState, useCallback, useMemo } from 'react';
import type { TemplateTree, TemplateSection } from '@/lib/theme/template-parser';

// ── Props ─────────────────────────────────────────────────────────────

interface SectionTreeProps {
  templateTree: TemplateTree | null;
  selectedSectionId: string | null;
  selectedBlockId: string | null;
  onSelectSection: (sectionId: string) => void;
  onSelectBlock: (sectionId: string, blockId: string) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────

function formatType(type: string): string {
  return type
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Chevron icon ──────────────────────────────────────────────────────

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

// ── Section row ───────────────────────────────────────────────────────

function SectionRow({
  section,
  isSelected,
  isExpanded,
  hasBlocks,
  onToggle,
  onSelect,
}: {
  section: TemplateSection;
  isSelected: boolean;
  isExpanded: boolean;
  hasBlocks: boolean;
  onToggle: () => void;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        'w-full flex items-center gap-2 px-3 py-2 text-left transition-colors',
        isSelected
          ? 'bg-sky-500/10 text-sky-500 dark:text-sky-400 border-l-2 border-l-sky-500'
          : 'ide-text border-l-2 border-l-transparent hover:bg-white/5 dark:hover:bg-white/5',
        section.disabled ? 'opacity-50' : '',
      ].join(' ')}
    >
      {hasBlocks ? (
        <span
          className="flex-shrink-0 ide-text-muted"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          role="button"
          tabIndex={-1}
        >
          <ChevronIcon expanded={isExpanded} />
        </span>
      ) : (
        <span className="flex-shrink-0 w-3" />
      )}

      <span className="flex-1 text-sm truncate">
        {formatType(section.type)}
      </span>

      {section.disabled && (
        <span className="flex-shrink-0 text-[10px] ide-text-muted uppercase tracking-wider">
          hidden
        </span>
      )}
    </button>
  );
}

// ── Block row ─────────────────────────────────────────────────────────

function BlockRow({
  blockId,
  blockType,
  isSelected,
  onSelect,
}: {
  blockId: string;
  blockType: string;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        'w-full flex items-center gap-2 pl-10 pr-3 py-1.5 text-left transition-colors',
        isSelected
          ? 'bg-sky-500/10 text-sky-500 dark:text-sky-400'
          : 'ide-text-muted hover:ide-text hover:bg-white/5 dark:hover:bg-white/5',
      ].join(' ')}
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="flex-shrink-0 opacity-50"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
      </svg>
      <span className="flex-1 text-xs truncate">
        {formatType(blockType)}
      </span>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────

export function SectionTree({
  templateTree,
  selectedSectionId,
  selectedBlockId,
  onSelectSection,
  onSelectBlock,
}: SectionTreeProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(),
  );

  const toggleExpand = useCallback((sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }, []);

  const handleSelectSection = useCallback(
    (sectionId: string) => {
      onSelectSection(sectionId);
      setExpandedSections((prev) => {
        const next = new Set(prev);
        next.add(sectionId);
        return next;
      });
    },
    [onSelectSection],
  );

  const blockEntries = useMemo(() => {
    if (!templateTree) return new Map<string, { id: string; type: string }[]>();

    const map = new Map<string, { id: string; type: string }[]>();
    for (const section of templateTree.sections) {
      if (!section.blocks) continue;
      const order = section.block_order ?? Object.keys(section.blocks);
      const entries = order
        .filter((id) => section.blocks![id])
        .map((id) => ({ id, type: section.blocks![id].type }));
      if (entries.length > 0) {
        map.set(section.id, entries);
      }
    }
    return map;
  }, [templateTree]);

  if (!templateTree) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex items-center justify-center px-4">
          <p className="text-sm ide-text-muted text-center">
            No template loaded
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2.5 border-b ide-border">
        <h3 className="text-xs font-semibold ide-text-muted uppercase tracking-wider">
          {templateTree.name}
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {templateTree.sections.map((section) => {
          const blocks = blockEntries.get(section.id);
          const hasBlocks = !!blocks && blocks.length > 0;
          const isExpanded = expandedSections.has(section.id);

          return (
            <div key={section.id}>
              <SectionRow
                section={section}
                isSelected={selectedSectionId === section.id && !selectedBlockId}
                isExpanded={isExpanded}
                hasBlocks={hasBlocks}
                onToggle={() => toggleExpand(section.id)}
                onSelect={() => handleSelectSection(section.id)}
              />

              {hasBlocks && isExpanded && (
                <div className="ide-surface-inset">
                  {blocks!.map((block) => (
                    <BlockRow
                      key={block.id}
                      blockId={block.id}
                      blockType={block.type}
                      isSelected={
                        selectedSectionId === section.id &&
                        selectedBlockId === block.id
                      }
                      onSelect={() => onSelectBlock(section.id, block.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="p-3 border-t ide-border">
        <button
          type="button"
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-sky-500 dark:text-sky-400 border border-sky-500/20 rounded-md transition-colors hover:bg-sky-500/10"
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
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add section
        </button>
      </div>
    </div>
  );
}
