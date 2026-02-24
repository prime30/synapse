'use client';

import {
  type ReactNode,
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  useId,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { positionElement } from '@/lib/ui/positioning';
import type { Placement } from '@floating-ui/dom';

export interface DropdownItem {
  id: string;
  label: string;
  icon?: ReactNode;
  description?: string;
  disabled?: boolean;
}

export interface DropdownProps {
  trigger: ReactNode;
  items: DropdownItem[];
  onSelect: (id: string) => void;
  searchable?: boolean;
  className?: string;
  placement?: Placement;
}

export function Dropdown({
  trigger,
  items,
  onSelect,
  searchable = false,
  className = '',
  placement = 'bottom-start',
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const menuId = useId();
  const itemId = (i: number) => `${menuId}-item-${i}`;

  const filteredItems = useMemo(() => {
    if (!searchable || !searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q)
    );
  }, [items, searchable, searchQuery]);

  const selectableItems = useMemo(
    () => filteredItems.filter((item) => !item.disabled),
    [filteredItems]
  );

  const updatePosition = useCallback(() => {
    if (triggerRef.current && panelRef.current) {
      positionElement(triggerRef.current, panelRef.current, {
        placement,
        offsetPx: 4,
        strategy: 'fixed',
      });
    }
  }, [placement]);

  useEffect(() => {
    if (isOpen && panelRef.current && triggerRef.current) {
      updatePosition();
    }
  }, [isOpen, updatePosition, filteredItems]);

  useEffect(() => {
    if (!isOpen) return;
    setHighlightedIndex(0);
    setSearchQuery('');
    if (searchable) {
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }, [isOpen, searchable]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        panelRef.current?.contains(e.target as Node) ||
        triggerRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      setIsOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        return;
      }
      if (!isOpen) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((i) =>
          i < selectableItems.length - 1 ? i + 1 : 0
        );
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((i) =>
          i > 0 ? i - 1 : selectableItems.length - 1
        );
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const item = selectableItems[highlightedIndex];
        if (item && !item.disabled) {
          onSelect(item.id);
          setIsOpen(false);
        }
        return;
      }
      if (searchable && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setSearchQuery((q) => q + e.key);
        setHighlightedIndex(0);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, selectableItems, highlightedIndex, onSelect, searchable]);

  const handleSelect = useCallback(
    (id: string) => {
      const item = items.find((i) => i.id === id);
      if (item?.disabled) return;
      onSelect(id);
      setIsOpen(false);
    },
    [items, onSelect]
  );

  const handleTriggerClick = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const containerClasses = `absolute z-10 bg-white dark:bg-[oklch(0.21_0_0)] border border-stone-200 dark:border-white/10 shadow-lg rounded-md overflow-hidden min-w-[180px] max-h-64 overflow-y-auto ${className}`;

  const content = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={panelRef}
          id={menuId}
          role="menu"
          aria-activedescendant={
            selectableItems[highlightedIndex]
              ? itemId(
                  filteredItems.findIndex(
                    (i) => i.id === selectableItems[highlightedIndex]?.id
                  )
                )
              : undefined
          }
          className={containerClasses}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.1 }}
        >
          {searchable && (
            <div className="border-b border-stone-200 px-3 py-2 dark:border-white/10">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setHighlightedIndex(0);
                }}
                className="bg-transparent text-sm text-stone-900 dark:text-white w-full outline-none placeholder:text-stone-400"
                placeholder="Search..."
                aria-label="Search items"
              />
            </div>
          )}
          <div className="overflow-y-auto max-h-56">
            {filteredItems.map((item, idx) => {
              const selectableIdx = selectableItems.findIndex(
                (s) => s.id === item.id
              );
              const isHighlighted = selectableIdx === highlightedIndex;
              return (
                <div
                  key={item.id}
                  id={itemId(idx)}
                  role="menuitem"
                  aria-disabled={item.disabled}
                  className={`px-3 py-2 text-sm text-stone-700 dark:text-stone-300 cursor-pointer flex items-center gap-2 ${
                    isHighlighted ? 'bg-stone-100 dark:bg-white/10' : ''
                  } ${item.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                  onClick={() => handleSelect(item.id)}
                  onMouseEnter={() =>
                    !item.disabled &&
                    selectableIdx >= 0 &&
                    setHighlightedIndex(selectableIdx)
                  }
                >
                  {item.icon && (
                    <span className="shrink-0">{item.icon}</span>
                  )}
                  <span className="flex-1">
                    {item.label}
                    {item.description && (
                      <span className="ml-1 text-stone-500 dark:text-stone-400 text-xs">
                        {item.description}
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div className="relative inline-block">
      <div
        ref={triggerRef}
        onClick={handleTriggerClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsOpen((prev) => !prev);
          }
        }}
        role="button"
        tabIndex={0}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={menuId}
        className="cursor-pointer"
      >
        {trigger}
      </div>
      {typeof document !== 'undefined' &&
        createPortal(content, document.body, menuId)}
    </div>
  );
}
