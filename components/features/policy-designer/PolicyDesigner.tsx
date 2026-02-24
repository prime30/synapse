'use client';

import { useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import type { PolicyContent, ThemeStyles } from '@/lib/policy-designer/types';
import { TemplateSelector } from './TemplateSelector';
import { AIGenerator } from './AIGenerator';
import { PolicyEditor } from './PolicyEditor';
import { PreviewPanel } from './PreviewPanel';
import { OutputPanel } from './OutputPanel';

type Tab = 'templates' | 'ai' | 'editor' | 'preview' | 'output';

const TABS: { id: Tab; label: string }[] = [
  { id: 'templates', label: 'Templates' },
  { id: 'ai', label: 'AI Generate' },
  { id: 'editor', label: 'Editor' },
  { id: 'preview', label: 'Preview' },
  { id: 'output', label: 'Output' },
];

export function PolicyDesignerPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('templates');
  const [content, setContent] = useState<PolicyContent | null>(null);
  const [styles, setStyles] = useState<ThemeStyles | null>(null);

  const handleTemplateSelect = useCallback((policy: PolicyContent) => {
    setContent(policy);
    setActiveTab('editor');
  }, []);

  const handleAIGenerate = useCallback((policy: PolicyContent) => {
    setContent(policy);
    setActiveTab('editor');
  }, []);

  return (
    <div className="min-h-screen bg-[oklch(0.985_0.001_106)] dark:bg-[oklch(0.145_0_0)]">
      <header className="border-b border-stone-200 dark:border-white/5 bg-white dark:bg-white/5 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center gap-4">
          <button
            onClick={() => router.push(`/projects/${projectId}`)}
            className="p-2 rounded-lg hover:bg-stone-100 dark:hover:bg-white/10 transition-colors"
            aria-label="Back to IDE"
          >
            <ArrowLeft size={18} className="text-stone-500 dark:text-white/50" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-stone-900 dark:text-white">Policy Designer</h1>
            <p className="text-xs text-stone-500 dark:text-white/40">
              Generate Shopify policy pages styled to your theme
            </p>
          </div>
        </div>
      </header>

      <nav className="border-b border-stone-200 dark:border-white/5 bg-white dark:bg-white/5">
        <div className="max-w-6xl mx-auto px-6 flex gap-0" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-accent text-stone-900 dark:text-white'
                  : 'border-transparent text-stone-500 dark:text-white/40 hover:text-stone-700 dark:hover:text-white/60'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div role="tabpanel">
          {activeTab === 'templates' && <TemplateSelector onSelect={handleTemplateSelect} />}
          {activeTab === 'ai' && <AIGenerator projectId={projectId} onGenerate={handleAIGenerate} />}
          {activeTab === 'editor' && <PolicyEditor content={content} onChange={setContent} />}
          {activeTab === 'preview' && <PreviewPanel content={content} styles={styles} />}
          {activeTab === 'output' && <OutputPanel content={content} styles={styles} />}
        </div>

        <div
          className="mt-8 rounded-lg border border-amber-500/20 bg-amber-500/5 dark:bg-amber-500/10 px-4 py-3"
          role="alert"
        >
          <p className="text-xs text-amber-700 dark:text-amber-400">
            <strong>Disclaimer:</strong> Generated content is not legal advice. Consult a qualified attorney to
            ensure compliance with applicable laws in your jurisdiction.
          </p>
        </div>
      </main>
    </div>
  );
}
