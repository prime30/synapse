'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import React, { Suspense, useCallback } from 'react';
import { OverviewSection } from '@/components/features/design-system/OverviewSection';
import { TokensSection } from '@/components/features/design-system/TokensSection';
import { ComponentsSection } from '@/components/features/design-system/ComponentsSection';
import { CleanupSection } from '@/components/features/design-system/CleanupSection';
import { StandardizationWizard } from '@/components/features/design-system/StandardizationWizard';
import { RulesSection } from '@/components/features/design-system/RulesSection';
import { HistorySection } from '@/components/features/design-system/HistorySection';

/* ------------------------------------------------------------------ */
/*  Tab definitions                                                    */
/* ------------------------------------------------------------------ */

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'tokens', label: 'Tokens' },
  { id: 'components', label: 'Components' },
  { id: 'rules', label: 'Rules' },
  { id: 'cleanup', label: 'Cleanup' },
  { id: 'standardize', label: 'Standardize' },
  { id: 'history', label: 'History' },
] as const;

type TabId = (typeof TABS)[number]['id'];

/* ------------------------------------------------------------------ */
/*  Inner component (needs useSearchParams → requires Suspense)        */
/* ------------------------------------------------------------------ */

function DesignSystemInner() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const activeTab = (searchParams.get('tab') as TabId) || 'overview';

  const setTab = useCallback(
    (tab: TabId) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', tab);
      router.replace(`/projects/${projectId}/design-system?${params.toString()}`);
    },
    [projectId, router, searchParams],
  );

  return (
    <div className="min-h-screen ide-surface">
      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="border-b ide-border px-6 py-4 flex items-center gap-4">
        <button
          type="button"
          onClick={() => router.push(`/projects/${projectId}`)}
          className="flex items-center gap-1.5 text-sm ide-text-2 hover:ide-text transition-colors"
          aria-label="Back to IDE"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="w-4 h-4"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back to IDE
        </button>

        <div className="h-5 w-px ide-border-subtle" aria-hidden />

        <h1 className="text-xl font-semibold ide-text">Design System</h1>
      </header>

      {/* ── Tab bar ─────────────────────────────────────────────── */}
      <nav className="border-b ide-border px-6" role="tablist" aria-label="Design system sections">
        <div className="flex gap-6">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => setTab(tab.id)}
                className={`
                  py-3 text-sm font-medium border-b-2 transition-colors
                  ${
                    isActive
                      ? 'border-accent ide-text'
                      : 'border-transparent ide-text-muted hover:ide-text-2'
                  }
                `}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* ── Tab content ─────────────────────────────────────────── */}
      <main className="px-6 py-6 max-w-6xl">
        {activeTab === 'overview' && (
          <OverviewSection projectId={projectId} onNavigateTab={(tab) => setTab(tab as TabId)} />
        )}
        {activeTab === 'tokens' && (
          <TokensSection projectId={projectId} />
        )}
        {activeTab === 'components' && (
          <ComponentsSection
            projectId={projectId}
            onOpenFile={(filePath) => {
              // Navigate back to IDE and open the file
              router.push(`/projects/${projectId}?openFile=${encodeURIComponent(filePath)}`);
            }}
          />
        )}
        {activeTab === 'rules' && (
          <RulesSection projectId={projectId} />
        )}
        {activeTab === 'cleanup' && (
          <CleanupSection projectId={projectId} />
        )}
        {activeTab === 'standardize' && (
          <StandardizationWizard
            projectId={projectId}
            onComplete={() => setTab('overview')}
          />
        )}
        {activeTab === 'history' && (
          <HistorySection projectId={projectId} />
        )}
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page export (wrapped in Suspense for useSearchParams)              */
/* ------------------------------------------------------------------ */

export default function DesignSystemPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen ide-surface flex items-center justify-center">
          <div className="text-sm ide-text-muted">Loading design system…</div>
        </div>
      }
    >
      <DesignSystemInner />
    </Suspense>
  );
}
