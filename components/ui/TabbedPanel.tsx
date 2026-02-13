'use client';

import React, { useState, useEffect, useCallback } from 'react';

export interface TabConfig {
  id: string;
  label: string;
  badge?: number;
  icon?: React.ReactNode;
}

export interface TabbedPanelProps {
  panelId: string;
  tabs: TabConfig[];
  activeTab?: string;
  defaultTab?: string;
  onTabChange?: (tabId: string) => void;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

const STORAGE_PREFIX = 'synapse:panel:';

export function TabbedPanel({
  panelId,
  tabs,
  activeTab: controlledTab,
  defaultTab,
  onTabChange,
  headerActions,
  children,
  className,
}: TabbedPanelProps) {
  const storageKey = `${STORAGE_PREFIX}${panelId}:tab`;

  // Resolve the initial tab: controlled > localStorage > defaultTab > first tab
  const [internalTab, setInternalTab] = useState<string>(() => {
    if (controlledTab !== undefined) return controlledTab;
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored && tabs.some((t) => t.id === stored)) return stored;
      } catch {
        // localStorage unavailable
      }
    }
    return defaultTab ?? tabs[0]?.id ?? '';
  });

  const activeId = controlledTab !== undefined ? controlledTab : internalTab;

  // Persist to localStorage when internal tab changes
  useEffect(() => {
    if (controlledTab !== undefined) return;
    try {
      localStorage.setItem(storageKey, internalTab);
    } catch {
      // localStorage unavailable
    }
  }, [internalTab, storageKey, controlledTab]);

  // Sync internal state if controlled tab changes
  useEffect(() => {
    if (controlledTab !== undefined) {
      setInternalTab(controlledTab);
    }
  }, [controlledTab]);

  const handleTabClick = useCallback(
    (tabId: string) => {
      if (controlledTab === undefined) {
        setInternalTab(tabId);
      }
      onTabChange?.(tabId);
    },
    [controlledTab, onTabChange],
  );

  if (tabs.length === 0) return null;

  return (
    <div className={`flex flex-col min-h-0 ${className ?? ''}`}>
      {/* Tab bar */}
      <div className="flex items-center border-b border-stone-700 bg-stone-900 shrink-0">
        <div className="flex min-w-0 overflow-x-auto">
          {tabs.map((tab) => {
            const isActive = activeId === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabClick(tab.id)}
                className={`relative flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium whitespace-nowrap transition-colors select-none ${
                  isActive
                    ? 'border-b-2 border-emerald-500 text-emerald-400'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                {tab.icon && <span className="shrink-0">{tab.icon}</span>}
                {tab.label}
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 text-[10px] rounded-full bg-emerald-500/10 text-emerald-600 leading-none">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Header actions (right-aligned) */}
        {headerActions && (
          <div className="ml-auto flex items-center shrink-0 px-2">
            {headerActions}
          </div>
        )}
      </div>

      {/* Panel content */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
