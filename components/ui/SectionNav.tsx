'use client';

import React from 'react';

export interface SectionNavItem {
  id: string;
  label: string;
  badge?: string;
  icon?: React.ReactNode;
}

export interface SectionNavGroup {
  header: string;
  items: SectionNavItem[];
}

export interface SectionNavProps {
  title: string;
  sections: SectionNavGroup[];
  activeItem: string;
  onItemClick: (id: string) => void;
  headerActions?: React.ReactNode;
}

export function SectionNav({
  title,
  sections,
  activeItem,
  onItemClick,
  headerActions,
}: SectionNavProps) {
  return (
    <div className="shrink-0 select-none">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b ide-border-subtle min-w-0">
        <span className="text-[13px] font-semibold ide-text truncate min-w-0 flex-1" title={title}>{title}</span>
        {headerActions && (
          <div className="flex items-center gap-1 shrink-0">{headerActions}</div>
        )}
      </div>

      <div className="py-1">
        {sections.map((section) => (
          <div key={section.header}>
            <div className="px-4 pt-3 pb-1">
              <span className="text-[10px] font-medium tracking-wider uppercase ide-text-3">
                {section.header}
              </span>
            </div>

            <div className="px-2 space-y-0.5">
              {section.items.map((item) => {
                const isActive = activeItem === item.id;
                const cls = isActive
                  ? 'ide-surface-inset ide-text'
                  : 'ide-text-muted ide-hover hover:ide-text';
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onItemClick(item.id)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] transition-colors ${cls}`}
                  >
                    {item.icon && (
                      <span className="shrink-0 w-4 h-4 flex items-center justify-center opacity-60">
                        {item.icon}
                      </span>
                    )}
                    <span className="truncate">{item.label}</span>
                    {item.badge && (
                      <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-medium leading-none shrink-0">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
