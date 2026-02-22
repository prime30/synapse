'use client';

import { useState, useCallback, useRef } from 'react';
import { Compass } from 'lucide-react';
import { useShopifyNavigation } from '@/hooks/useShopifyNavigation';

// ── Types ─────────────────────────────────────────────────────────────

interface NavigationPanelProps {
  connectionId: string;
}

// ── Loading skeleton ──────────────────────────────────────────────────

function SkeletonMenu() {
  return (
    <div className="px-3 py-3 animate-pulse space-y-2">
      <div className="h-4 ide-surface-inset rounded w-32" />
      <div className="ml-4 space-y-1.5">
        <div className="h-3 ide-surface-inset rounded w-48" />
        <div className="h-3 ide-surface-inset rounded w-40" />
        <div className="h-3 ide-surface-inset rounded w-44" />
      </div>
    </div>
  );
}

// ── Menu item row ─────────────────────────────────────────────────────

function MenuItemRow({
  item,
  depth,
  dragIndex,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  item: { id: string; title: string; url: string; items?: Array<{ id: string; title: string; url: string; items?: unknown[] }> };
  depth: number;
  dragIndex: number;
  onDragStart: (index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDrop: (e: React.DragEvent, index: number) => void;
}) {
  return (
    <>
      <div
        draggable
        onDragStart={() => onDragStart(dragIndex)}
        onDragOver={(e) => onDragOver(e, dragIndex)}
        onDrop={(e) => onDrop(e, dragIndex)}
        className="group flex items-center gap-2 px-3 py-1.5 ide-hover transition-colors cursor-grab active:cursor-grabbing"
        style={{ paddingLeft: `${12 + depth * 16}px` }}
      >
        {/* Drag handle */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="ide-text-quiet group-hover:ide-text-muted shrink-0"
        >
          <circle cx="9" cy="6" r="1.5" />
          <circle cx="15" cy="6" r="1.5" />
          <circle cx="9" cy="12" r="1.5" />
          <circle cx="15" cy="12" r="1.5" />
          <circle cx="9" cy="18" r="1.5" />
          <circle cx="15" cy="18" r="1.5" />
        </svg>

        <span className="text-xs ide-text truncate flex-1">{item.title}</span>
        <span className="text-[10px] ide-text-quiet truncate max-w-[140px]" title={item.url}>
          {item.url}
        </span>
      </div>

      {/* Nested items */}
      {item.items?.map((child, i) => (
        <MenuItemRow
          key={child.id}
          item={child as typeof item}
          depth={depth + 1}
          dragIndex={dragIndex + i + 1}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
        />
      ))}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────

export function NavigationPanel({ connectionId }: NavigationPanelProps) {
  const { menus, isLoading, error, refetch } = useShopifyNavigation(connectionId);
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set());
  const [copiedHandle, setCopiedHandle] = useState<string | null>(null);
  const dragSourceRef = useRef<number | null>(null);

  const toggleMenu = useCallback((menuId: string) => {
    setExpandedMenus((prev) => {
      const next = new Set(prev);
      if (next.has(menuId)) next.delete(menuId);
      else next.add(menuId);
      return next;
    });
  }, []);

  const copyAsLiquid = useCallback(async (handle: string) => {
    const text = `{{ linklists['${handle}'].links }}`;
    await navigator.clipboard.writeText(text);
    setCopiedHandle(handle);
    setTimeout(() => setCopiedHandle(null), 2000);
  }, []);

  const handleDragStart = useCallback((index: number) => {
    dragSourceRef.current = index;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, _targetIndex: number) => {
    e.preventDefault();
    const sourceIndex = dragSourceRef.current;
    if (sourceIndex === null || sourceIndex === _targetIndex) return;
    // Reorder is visual only — Shopify Navigation API doesn't support order changes.
    // Menus come from the API and are re-fetched on refetch().
    dragSourceRef.current = null;
  }, []);

  // ── Loading state ───────────────────────────────────────────────────

  if (isLoading && menus.length === 0) {
    return (
      <div className="divide-y ide-border">
        <SkeletonMenu />
        <SkeletonMenu />
      </div>
    );
  }

  // ── Error state ─────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="flex flex-col items-center py-8 px-4 text-center">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-red-400 mb-2"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <p className="text-sm text-red-400 mb-1">{error}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="text-xs ide-text-muted hover:ide-text underline transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // ── Empty state ─────────────────────────────────────────────────────

  if (menus.length === 0) {
    return (
      <div className="flex flex-col items-center py-8 px-4 text-center">
        <Compass className="h-7 w-7 mb-2 ide-text-muted" aria-hidden />
        <p className="text-sm ide-text-muted font-medium">No navigation menus</p>
        <p className="text-[11px] ide-text-quiet mt-1 max-w-[240px]">
          This store doesn&apos;t have any navigation menus yet. Create one in Shopify Admin.
        </p>
      </div>
    );
  }

  // ── Menu list ───────────────────────────────────────────────────────

  return (
    <div className="divide-y ide-border">
      {menus.map((menu) => {
        const isExpanded = expandedMenus.has(menu.id);

        return (
          <div key={menu.id}>
            {/* Menu header */}
            <button
              type="button"
              onClick={() => toggleMenu(menu.id)}
              className="w-full flex items-center gap-2 px-3 py-2.5 ide-hover transition-colors"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`ide-text-muted shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
              <span className="text-sm ide-text font-medium flex-1 text-left truncate">
                {menu.title}
              </span>
              <span className="text-[10px] ide-text-quiet shrink-0">
                {menu.items.length} {menu.items.length === 1 ? 'item' : 'items'}
              </span>

              {/* Copy as Liquid */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  copyAsLiquid(menu.handle);
                }}
                className={`shrink-0 px-2 py-1 text-[10px] font-medium rounded transition-colors ${
                  copiedHandle === menu.handle
                    ? 'text-green-400 bg-green-400/10'
                    : 'ide-text-muted hover:text-sky-500 dark:hover:text-sky-400 hover:bg-sky-500/10'
                }`}
                title={`Copy {{ linklists['${menu.handle}'].links }}`}
              >
                {copiedHandle === menu.handle ? 'Copied!' : 'Copy as Liquid'}
              </button>
            </button>

            {/* Menu items */}
            {isExpanded && (
              <div className="pb-1">
                {menu.items.map((item, i) => (
                  <MenuItemRow
                    key={item.id}
                    item={item}
                    depth={0}
                    dragIndex={i}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
