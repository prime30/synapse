'use client';

import React, { useState } from 'react';
import { NavigationPanel } from './NavigationPanel';
import { FilesPanel } from './FilesPanel';
import { InventoryPanel } from './InventoryPanel';
import { DiscountsPanel } from './DiscountsPanel';
import { PagesPanel } from './PagesPanel';

// ── Types ─────────────────────────────────────────────────────────────

interface StoreDataPanelProps {
  connectionId: string | null;
  scopes?: string[];
}

type TabId = 'navigation' | 'files' | 'inventory' | 'discounts' | 'pages';

const TABS: Array<{ id: TabId; label: string; icon: React.ReactElement }> = [
  {
    id: 'navigation',
    label: 'Navigation',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" />
      </svg>
    ),
  },
  {
    id: 'files',
    label: 'Files',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
      </svg>
    ),
  },
  {
    id: 'inventory',
    label: 'Inventory',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
    ),
  },
  {
    id: 'discounts',
    label: 'Discounts',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="9" r="2" /><circle cx="15" cy="15" r="2" /><line x1="7" y1="17" x2="17" y2="7" />
      </svg>
    ),
  },
  {
    id: 'pages',
    label: 'Pages',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
];

// ── OAuth scope check ──────────────────────────────────────────────────

const REQUIRED_SCOPES = [
  'read_themes',
  'write_themes',
  'read_content',
  'write_content',
  'read_online_store_navigation',
  'write_online_store_navigation',
  'read_discounts',
  'write_discounts',
  'read_files',
  'write_files',
  'read_products',
  'read_inventory',
];

function needsReAuth(currentScopes?: string[]): boolean {
  if (!currentScopes) return false;
  return REQUIRED_SCOPES.some((s) => !currentScopes.includes(s));
}

// ── Re-auth banner ────────────────────────────────────────────────────

function ReAuthBanner({ connectionId }: { connectionId: string }) {
  return (
    <div className="mx-3 mt-3 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-amber-400 shrink-0 mt-0.5"
      >
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-amber-200 font-medium">
          Additional permissions needed
        </p>
        <p className="text-[11px] text-amber-300/70 mt-0.5">
          Your store connection needs updated scopes for navigation, files, inventory, and discounts.
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          window.location.href = `/api/stores/${connectionId}/oauth/reauthorize`;
        }}
        className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-md bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30 transition-colors"
      >
        Re-authorize
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────

export function StoreDataPanel({ connectionId, scopes }: StoreDataPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('navigation');

  if (!connectionId) {
    return (
      <div className="border ide-border rounded-lg ide-surface-panel flex flex-col items-center justify-center py-12 px-4">
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="ide-text-quiet mb-3"
        >
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
        <p className="text-sm ide-text-muted font-medium">Connect a store to manage data</p>
        <p className="text-[11px] ide-text-quiet mt-1">
          Link a Shopify store to browse navigation, files, inventory, discounts, and pages.
        </p>
      </div>
    );
  }

  return (
    <div className="border ide-border rounded-lg ide-surface-panel flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b ide-border">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-sky-500 dark:text-sky-400 shrink-0"
        >
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
        <span className="text-sm font-medium ide-text">Store Data</span>
      </div>

      {/* Re-auth banner */}
      {needsReAuth(scopes) && <ReAuthBanner connectionId={connectionId} />}

      {/* Tabs */}
      <div className="flex border-b ide-border">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors relative ${
              activeTab === tab.id
                ? 'text-sky-500 dark:text-sky-400'
                : 'ide-text-muted hover:ide-text-2'
            }`}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-sky-500 dark:bg-sky-400" />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto max-h-[600px]">
        {activeTab === 'navigation' && <NavigationPanel connectionId={connectionId} />}
        {activeTab === 'files' && <FilesPanel connectionId={connectionId} />}
        {activeTab === 'inventory' && <InventoryPanel connectionId={connectionId} />}
        {activeTab === 'discounts' && <DiscountsPanel connectionId={connectionId} />}
        {activeTab === 'pages' && <PagesPanel connectionId={connectionId} />}
      </div>
    </div>
  );
}
