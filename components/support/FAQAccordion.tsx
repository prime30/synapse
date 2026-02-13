'use client';

import { useState, useMemo, useCallback } from 'react';
import type { FAQCategory, FAQItem } from '@/lib/support/faq-data';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FAQAccordionProps {
  categories: FAQCategory[];
  className?: string;
}

// ---------------------------------------------------------------------------
// Single FAQ item
// ---------------------------------------------------------------------------

function FAQEntry({
  item,
  isOpen,
  onToggle,
}: {
  item: FAQItem;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b ide-border last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-start gap-3 px-3 py-2.5 text-left ide-hover transition-colors"
        aria-expanded={isOpen}
      >
        {/* Chevron */}
        <svg
          className={`w-4 h-4 mt-0.5 flex-shrink-0 ide-text-muted transition-transform duration-200 ${
            isOpen ? 'rotate-90' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-sm ide-text">{item.question}</span>
      </button>

      {/* Collapsible answer */}
      <div
        className={`overflow-hidden transition-all duration-200 ease-out ${
          isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <p className="px-3 pb-3 pl-10 text-xs leading-relaxed ide-text-muted">
          {item.answer}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * FAQAccordion — searchable, category-grouped FAQ list with expand/collapse.
 */
export function FAQAccordion({ categories, className = '' }: FAQAccordionProps) {
  const [search, setSearch] = useState('');
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  const toggleItem = useCallback((id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Filter categories and items by search query
  const filteredCategories = useMemo(() => {
    if (!search.trim()) return categories;

    const query = search.toLowerCase();
    return categories
      .map((cat) => ({
        ...cat,
        items: cat.items.filter(
          (item) =>
            item.question.toLowerCase().includes(query) ||
            item.answer.toLowerCase().includes(query),
        ),
      }))
      .filter((cat) => cat.items.length > 0);
  }, [categories, search]);

  const totalResults = filteredCategories.reduce((sum, cat) => sum + cat.items.length, 0);

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Search input */}
      <div className="px-3 pb-3">
        <div className="relative">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 ide-text-muted"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search FAQ..."
            className="w-full pl-8 pr-3 py-1.5 text-xs rounded ide-input"
          />
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {filteredCategories.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <p className="text-xs ide-text-muted">No results for &ldquo;{search}&rdquo;</p>
            <p className="text-[10px] ide-text-quiet mt-1">
              Try a different search or contact us for help.
            </p>
          </div>
        ) : (
          filteredCategories.map((category) => (
            <div key={category.id} className="mb-2">
              {/* Category header */}
              <div className="px-3 py-1.5">
                <h4 className="text-[10px] font-semibold uppercase tracking-wider ide-text-muted">
                  {category.label}
                  {search && (
                    <span className="ml-1.5 ide-text-quiet normal-case tracking-normal font-normal">
                      ({category.items.length})
                    </span>
                  )}
                </h4>
              </div>

              {/* Items */}
              {category.items.map((item) => (
                <FAQEntry
                  key={item.id}
                  item={item}
                  isOpen={openIds.has(item.id)}
                  onToggle={() => toggleItem(item.id)}
                />
              ))}
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      {search && totalResults > 0 && (
        <div className="px-3 py-1.5 border-t ide-border">
          <p className="text-[10px] ide-text-quiet">
            {totalResults} result{totalResults !== 1 ? 's' : ''}
          </p>
        </div>
      )}
    </div>
  );
}
