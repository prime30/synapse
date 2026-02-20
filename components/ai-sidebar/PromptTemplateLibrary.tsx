'use client';

import React, { useState, useRef, useEffect } from 'react';
import { BookOpen, Search, Plus, Trash2, X } from 'lucide-react';
import { usePromptTemplates } from '@/hooks/usePromptTemplates';
import { trapFocus } from '@/lib/accessibility';
import { TEMPLATE_CATEGORIES, type TemplateCategory } from '@/lib/ai/prompt-templates';
import type { PromptTemplate } from '@/lib/ai/prompt-templates';

interface PromptTemplateLibraryProps {
  open: boolean;
  onClose: () => void;
  onSelectTemplate: (prompt: string) => void;
}

const CATEGORY_BADGE_CLASSES: Record<TemplateCategory, string> = {
  layout: 'bg-sky-500/10 text-sky-600 border-sky-500/20',
  styling: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  performance: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  accessibility: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  seo: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20',
  content: 'bg-rose-500/10 text-rose-600 border-rose-500/20',
  custom: 'bg-stone-500/10 text-stone-600 dark:text-stone-400 border-stone-500/20',
};

function truncatePrompt(text: string, maxLines: number): string {
  const lines = text.split('\n').slice(0, maxLines);
  const result = lines.join('\n');
  return result.length < text.length ? result + '…' : result;
}

export function PromptTemplateLibrary({
  open,
  onClose,
  onSelectTemplate,
}: PromptTemplateLibraryProps) {
  const {
    templates,
    addTemplate,
    removeTemplate,
    filterByCategory,
    searchTemplates,
  } = usePromptTemplates();

  const popoverRef = useRef<HTMLDivElement>(null);

  // Phase 7d: Trap focus inside popover when open
  useEffect(function() {
    if (!open || !popoverRef.current) return;
    const cleanup = trapFocus(popoverRef.current);
    return cleanup;
  }, [open]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory | null>(null);
  const [addFormOpen, setAddFormOpen] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newPrompt, setNewPrompt] = useState('');
  const [newCategory, setNewCategory] = useState<TemplateCategory>('custom');

  // Phase 7d: Trap focus when popover is open
  useEffect(() => {
    if (!open || !popoverRef.current) return;
    const cleanup = trapFocus(popoverRef.current);
    return cleanup;
  }, [open]);

  const filteredTemplates = (() => {
    let list = selectedCategory === null
      ? templates
      : filterByCategory(selectedCategory);
    if (searchQuery.trim()) {
      list = searchTemplates(searchQuery);
      if (selectedCategory !== null) {
        list = list.filter((t) => t.category === selectedCategory);
      }
    }
    return list;
  })();

  const handleSaveNew = () => {
    const label = newLabel.trim();
    const prompt = newPrompt.trim();
    if (!label || !prompt) return;
    addTemplate({ label, prompt, category: newCategory });
    setNewLabel('');
    setNewPrompt('');
    setNewCategory('custom');
    setAddFormOpen(false);
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    removeTemplate(id);
  };

  if (!open) return null;

  const categoryList: Array<{ key: TemplateCategory | null; label: string; icon: string }> = [
    { key: null, label: 'All', icon: '📋' },
    ...(Object.entries(TEMPLATE_CATEGORIES) as [TemplateCategory, { label: string; icon: string }][]).map(
      ([key, { label, icon }]) => ({ key, label, icon })
    ),
  ];

  return (
      <div
        ref={popoverRef}
        role="dialog"
        aria-label="Prompt template library"
        className={
          'mx-2 mb-2 rounded-lg border ide-border ide-surface-panel overflow-hidden flex flex-col max-h-[400px]'
        }
      >
        {/* Header */}
        <div className={'flex items-center gap-2 p-2 border-b ide-border-subtle shrink-0'}>
          <BookOpen className={'w-4 h-4 ide-text-muted shrink-0'} />
          <span className={'text-xs font-medium ide-text flex-1'}>Templates</span>
          <div className={'relative flex-1 max-w-[140px]'}>
            <Search className={'absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 ide-text-muted pointer-events-none'} />
            <input
              type="text"
              placeholder="Search…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={
                'w-full pl-6 pr-2 py-1 text-[11px] rounded ide-surface-input border ide-border-subtle ide-text placeholder:ide-text-muted focus:outline-none focus:ring-1 focus:ring-sky-500/20 focus:border-sky-500/30'
              }
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            className={'p-1 rounded ide-hover ide-text-muted'}
            aria-label="Close"
          >
            <X className={'w-4 h-4'} />
          </button>
        </div>

        {/* Category tabs */}
        <div className={'flex gap-1 p-2 overflow-x-auto border-b ide-border-subtle shrink-0 scrollbar-thin'}>
          {categoryList.map(({ key, label, icon }) => {
            const isActive = selectedCategory === key;
            return (
              <button
                key={key ?? 'all'}
                type="button"
                onClick={() => setSelectedCategory(key)}
                className={
                  'shrink-0 px-2 py-1 rounded text-[10px] font-medium flex items-center gap-1 transition-colors ' +
                  (isActive
                    ? 'bg-sky-500/10 text-sky-600 border border-sky-500/20'
                    : 'ide-surface-inset ide-text-2 border border-transparent ide-hover')
                }
              >
                <span>{icon}</span>
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        {/* Template list */}
        <div className={'flex-1 overflow-y-auto p-2 space-y-1 min-h-0'}>
          {filteredTemplates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onSelect={() => onSelectTemplate(template.prompt)}
              onDelete={!template.builtIn ? () => handleDelete({ stopPropagation: () => {} } as React.MouseEvent, template.id) : undefined}
              onDeleteClick={(e) => handleDelete(e, template.id)}
            />
          ))}
          {filteredTemplates.length === 0 && (
            <div className={'py-6 text-center text-[11px] ide-text-muted'}>
              No templates match your filters.
            </div>
          )}
        </div>

        {/* Add custom template */}
        <div className={'border-t ide-border-subtle p-2 shrink-0'}>
          {!addFormOpen ? (
            <button
              type="button"
              onClick={() => setAddFormOpen(true)}
              className={
                'w-full flex items-center justify-center gap-2 py-2 rounded ide-surface-inset ide-hover ide-text-2 text-[11px] font-medium'
              }
            >
              <Plus className={'w-3.5 h-3.5'} />
              Add template
            </button>
          ) : (
            <div className={'space-y-2'}>
              <input
                type="text"
                placeholder="Label"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                className={
                  'w-full px-2 py-1.5 text-[11px] rounded ide-surface-input border ide-border ide-text placeholder:ide-text-muted focus:outline-none focus:ring-1 focus:ring-sky-500/20 focus:border-sky-500/30'
                }
              />
              <textarea
                placeholder="Prompt"
                value={newPrompt}
                onChange={(e) => setNewPrompt(e.target.value)}
                rows={3}
                className={
                  'w-full px-2 py-1.5 text-[11px] rounded ide-surface-input border ide-border ide-text placeholder:ide-text-muted focus:outline-none focus:ring-1 focus:ring-sky-500/20 focus:border-sky-500/30 resize-none'
                }
              />
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as TemplateCategory)}
                className={
                  'w-full px-2 py-1.5 text-[11px] rounded ide-surface-input border ide-border ide-text focus:outline-none focus:ring-1 focus:ring-sky-500/20 focus:border-sky-500/30'
                }
              >
                {(Object.entries(TEMPLATE_CATEGORIES) as [TemplateCategory, { label: string }][]).map(
                  ([cat, { label }]) => (
                    <option key={cat} value={cat}>
                      {label}
                    </option>
                  )
                )}
              </select>
              <div className={'flex gap-2'}>
                <button
                  type="button"
                  onClick={handleSaveNew}
                  disabled={!newLabel.trim() || !newPrompt.trim()}
                  className={
                    'flex-1 py-1.5 text-[11px] font-medium rounded bg-sky-500 text-white hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
                  }
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddFormOpen(false);
                    setNewLabel('');
                    setNewPrompt('');
                  }}
                  className={
                    'px-3 py-1.5 text-[11px] rounded ide-surface-inset ide-hover ide-text-2'
                  }
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
  );
}

interface TemplateCardProps {
  template: PromptTemplate;
  onSelect: () => void;
  onDelete?: () => void;
  onDeleteClick: (e: React.MouseEvent) => void;
}

function TemplateCard({ template, onSelect, onDelete, onDeleteClick }: TemplateCardProps) {
  const badgeClass = CATEGORY_BADGE_CLASSES[template.category];
  const meta = TEMPLATE_CATEGORIES[template.category];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={
        'group flex flex-col gap-1 p-2 rounded border ide-border-subtle ide-hover cursor-pointer text-left'
      }
    >
      <div className={'flex items-start justify-between gap-2'}>
        <span className={'text-xs font-semibold ide-text truncate flex-1'}>{template.label}</span>
        {!template.builtIn && onDelete && (
          <button
            type="button"
            onClick={onDeleteClick}
            className={'p-0.5 rounded ide-text-muted hover:text-rose-500 hover:bg-rose-500/10 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity'}
            aria-label="Delete template"
          >
            <Trash2 className={'w-3 h-3'} />
          </button>
        )}
      </div>
      <p className={'text-[11px] ide-text-3 line-clamp-2'}>{truncatePrompt(template.prompt, 2)}</p>
      <span
        className={
          'inline-flex items-center gap-0.5 w-fit px-1.5 py-0.5 rounded text-[10px] font-medium border ' +
          badgeClass
        }
      >
        {meta.icon} {meta.label}
      </span>
    </div>
  );
}
