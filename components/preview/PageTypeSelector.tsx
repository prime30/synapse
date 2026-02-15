'use client';

import { useState, useRef, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import type { PreviewResource, PreviewResourceType } from '@/lib/types/preview';
import type { TemplateEntry } from '@/lib/preview/template-classifier';
import { getUniqueTemplateTypes, getTemplateVariants } from '@/lib/preview/template-classifier';
import { ResourcePicker } from './ResourcePicker';

// ── Icon lookup ────────────────────────────────────────────────────────

const I = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const TEMPLATE_ICONS: Record<string, ReactNode> = {
  home: <svg className="w-3.5 h-3.5" {...I}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>,
  tag: <svg className="w-3.5 h-3.5" {...I}><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>,
  tags: <svg className="w-3.5 h-3.5" {...I}><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>,
  list: <svg className="w-3.5 h-3.5" {...I}><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>,
  gift: <svg className="w-3.5 h-3.5" {...I}><polyline points="20 12 20 22 4 22 4 12" /><rect x="2" y="7" width="20" height="5" /><line x1="12" y1="22" x2="12" y2="7" /><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" /><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" /></svg>,
  cart: <svg className="w-3.5 h-3.5" {...I}><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>,
  article: <svg className="w-3.5 h-3.5" {...I}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>,
  page: <svg className="w-3.5 h-3.5" {...I}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>,
  book: <svg className="w-3.5 h-3.5" {...I}><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>,
  search: <svg className="w-3.5 h-3.5" {...I}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>,
  lock: <svg className="w-3.5 h-3.5" {...I}><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>,
  globe: <svg className="w-3.5 h-3.5" {...I}><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>,
  user: <svg className="w-3.5 h-3.5" {...I}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
  file: <svg className="w-3.5 h-3.5" {...I}><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><polyline points="13 2 13 9 20 9" /></svg>,
  star: <svg className="w-3.5 h-3.5" {...I}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>,
};

function getIcon(key: string): ReactNode {
  return TEMPLATE_ICONS[key] ?? TEMPLATE_ICONS.file;
}

// ── Chevrons and arrows ────────────────────────────────────────────────

const ChevronDown = (
  <svg className="w-3 h-3 ide-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const ChevronRight = (
  <svg className="w-3 h-3 ide-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const ArrowLeft = (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
);

const PlusIcon = (
  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

// ── Dropdown views ─────────────────────────────────────────────────────

type DropdownView =
  | { kind: 'main' }
  | { kind: 'variants'; templateType: string }
  | { kind: 'resource'; templateType: string };

// ── Component ──────────────────────────────────────────────────────────

interface PageTypeSelectorProps {
  templates: TemplateEntry[];
  selectedTemplate: TemplateEntry | null;
  onChange: (template: TemplateEntry) => void;
  selectedResource: PreviewResource | null;
  onResourceSelect: (resource: PreviewResource) => void;
  onCreateTemplate: (templateType: string) => void;
  projectId: string;
}

export function PageTypeSelector({
  templates,
  selectedTemplate,
  onChange,
  selectedResource,
  onResourceSelect,
  onCreateTemplate,
  projectId,
}: PageTypeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<DropdownView>({ kind: 'main' });
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const current = selectedTemplate ?? templates[0] ?? null;

  // Amber dot when resource needed but none selected
  const needsResourceWarning = current?.needsResource && !selectedResource;

  // Trigger label
  const triggerLabel = useMemo(() => {
    if (!current) return 'Select template';
    if (selectedResource && current.needsResource) {
      const title = selectedResource.title;
      return `${current.label}: ${title.length > 24 ? title.slice(0, 24) + '...' : title}`;
    }
    return current.label;
  }, [current, selectedResource]);

  // Unique types for main list
  const uniqueTypes = useMemo(() => getUniqueTemplateTypes(templates), [templates]);

  // Filtered types (search)
  const filteredTypes = useMemo(() => {
    if (!search.trim()) return uniqueTypes;
    const q = search.trim().toLowerCase();
    return uniqueTypes.filter((t) => t.label.toLowerCase().includes(q));
  }, [search, uniqueTypes]);

  // Group for main view
  const groupedTypes = useMemo(() => {
    const groups: TemplateEntry[][] = [];
    let lastGroup = -1;
    for (const entry of filteredTypes) {
      if (entry.group !== lastGroup) {
        groups.push([]);
        lastGroup = entry.group;
      }
      groups[groups.length - 1].push(entry);
    }
    return groups;
  }, [filteredTypes]);

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
    setView({ kind: 'main' });
    setSearch('');
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        closeDropdown();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, closeDropdown]);

  // Auto-focus search
  useEffect(() => {
    if (isOpen && view.kind === 'main') {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [isOpen, view]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (view.kind !== 'main') {
        setView({ kind: 'main' });
      } else {
        closeDropdown();
      }
    }
  };

  // Does this template type have multiple variants?
  function hasVariants(templateType: string): boolean {
    return templates.filter((t) => t.templateType === templateType).length > 1;
  }

  // Does this type need a sub-menu (variants or resource)?
  function needsSubMenu(entry: TemplateEntry): boolean {
    return hasVariants(entry.templateType) || entry.needsResource;
  }

  function handleMainItemClick(entry: TemplateEntry) {
    if (entry.disabled) return;

    if (hasVariants(entry.templateType)) {
      // Show variants sub-menu
      setView({ kind: 'variants', templateType: entry.templateType });
    } else if (entry.needsResource) {
      // Select it, then show resource picker
      onChange(entry);
      setView({ kind: 'resource', templateType: entry.templateType });
    } else {
      // Simple selection
      onChange(entry);
      closeDropdown();
    }
  }

  function handleVariantClick(entry: TemplateEntry) {
    onChange(entry);
    if (entry.needsResource) {
      setView({ kind: 'resource', templateType: entry.templateType });
    } else {
      closeDropdown();
    }
  }

  function handleInlineResourceSelect(resource: PreviewResource) {
    onResourceSelect(resource);
    closeDropdown();
  }

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div ref={containerRef} className="relative" onKeyDown={handleKeyDown}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => {
          if (isOpen) {
            closeDropdown();
          } else {
            setIsOpen(true);
            setView({ kind: 'main' });
          }
        }}
        className="flex items-center gap-1.5 ide-surface-inset rounded-full px-3 py-1.5 text-sm ide-text-2 hover:ide-text ide-hover transition-colors"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label="Select template"
      >
        {current && <span className="flex-shrink-0">{getIcon(current.iconKey)}</span>}
        <span className="truncate max-w-[200px]">{triggerLabel}</span>
        {needsResourceWarning && (
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
        )}
        {ChevronDown}
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-50 w-80 ide-surface-pop border ide-border rounded-lg shadow-xl overflow-hidden">
          {view.kind === 'resource' ? (
            /* ── Resource picker view ────────────────────────── */
            <div className="max-h-[420px] overflow-y-auto">
              <button
                type="button"
                onClick={() => {
                  const entry = templates.find((t) => t.templateType === view.templateType);
                  if (entry && hasVariants(view.templateType)) {
                    setView({ kind: 'variants', templateType: view.templateType });
                  } else {
                    setView({ kind: 'main' });
                  }
                }}
                className="flex items-center gap-2 px-3 py-2 text-sm ide-text-2 ide-hover w-full text-left transition-colors border-b ide-border-subtle"
              >
                {ArrowLeft}
                <span>Back</span>
              </button>
              <div className="p-3">
                <ResourcePicker
                  projectId={projectId}
                  type={
                    (templates.find((t) => t.templateType === view.templateType)?.resourceType ??
                      'product') as PreviewResourceType
                  }
                  label={`Select ${templates.find((t) => t.templateType === view.templateType)?.label ?? view.templateType}`}
                  onSelect={handleInlineResourceSelect}
                />
              </div>
            </div>
          ) : view.kind === 'variants' ? (
            /* ── Variants sub-menu ───────────────────────────── */
            <div className="max-h-[420px] overflow-y-auto">
              <button
                type="button"
                onClick={() => setView({ kind: 'main' })}
                className="flex items-center gap-2 px-3 py-2 text-sm ide-text-2 ide-hover w-full text-left transition-colors border-b ide-border-subtle"
              >
                {ArrowLeft}
                <span>{templates.find((t) => t.templateType === view.templateType)?.label ?? view.templateType}</span>
              </button>
              <div className="py-1">
                {getTemplateVariants(templates, view.templateType).map((entry) => {
                  const isActive = selectedTemplate?.filePath === entry.filePath;
                  return (
                    <button
                      key={entry.filePath}
                      type="button"
                      onClick={() => handleVariantClick(entry)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${
                        isActive
                          ? 'ide-active text-sky-500 dark:text-sky-400'
                          : 'ide-text-2 ide-hover'
                      }`}
                    >
                      <span className={`flex-shrink-0 ${isActive ? '' : 'ide-text-muted'}`}>
                        {entry.variant === null ? getIcon('star') : getIcon(entry.iconKey)}
                      </span>
                      <span className="flex-1 truncate">
                        {entry.variant === null
                          ? `Default ${entry.label.toLowerCase()}`
                          : entry.variant.replace(/[_-]/g, ' ')}
                      </span>
                      {entry.needsResource && ChevronRight}
                    </button>
                  );
                })}

                {/* Create template link */}
                <button
                  type="button"
                  onClick={() => {
                    closeDropdown();
                    onCreateTemplate(view.templateType);
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm text-sky-500 dark:text-sky-400 ide-hover w-full text-left transition-colors border-t ide-border-subtle"
                >
                  {PlusIcon}
                  <span>Create template</span>
                </button>
              </div>
            </div>
          ) : (
            /* ── Main list view ───────────────────────────────── */
            <div className="max-h-[420px] overflow-y-auto">
              {/* Search input */}
              <div className="p-2 border-b ide-border-subtle">
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search templates"
                  className="w-full ide-input px-3 py-1.5 text-sm"
                />
              </div>

              {/* Grouped items */}
              <div className="py-1">
                {groupedTypes.map((group, gi) => (
                  <div key={gi}>
                    {gi > 0 && <div className="border-t ide-border-subtle my-1" />}
                    {group.map((entry) => {
                      const isActive = current?.templateType === entry.templateType;
                      return (
                        <button
                          key={entry.templateType}
                          type="button"
                          onClick={() => handleMainItemClick(entry)}
                          disabled={entry.disabled}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${
                            isActive
                              ? 'ide-active text-sky-500 dark:text-sky-400'
                              : 'ide-text-2 ide-hover'
                          } ${entry.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <span className={`flex-shrink-0 ${isActive ? '' : 'ide-text-muted'}`}>
                            {getIcon(entry.iconKey)}
                          </span>
                          <span className="flex-1 truncate">{entry.label}</span>
                          {needsSubMenu(entry) && ChevronRight}
                        </button>
                      );
                    })}
                  </div>
                ))}

                {filteredTypes.length === 0 && (
                  <p className="px-3 py-4 text-sm ide-text-muted text-center">No results</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
