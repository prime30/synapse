'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { TemplateSelector } from './TemplateSelector';
import { ImportPanel } from './ImportPanel';
import { SlipEditor } from './SlipEditor';
import { PrintPreview } from './PrintPreview';
import { OutputPanel } from './OutputPanel';
import { PackingSlipChat } from './PackingSlipChat';
import { SlipVersionManager } from './SlipVersionManager';
import { loadSlipStore, saveSlipStore, createSlip, duplicateSlip } from '@/lib/packing-slip-designer/storage';
import type { SavedSlip, SlipStore } from '@/lib/packing-slip-designer/types';
import type { ImportIdea } from '@/lib/packing-slip-designer/idea-generator';

type Tab = 'templates' | 'import' | 'editor' | 'preview' | 'output';

const TABS: { id: Tab; label: string }[] = [
  { id: 'templates', label: 'Templates' },
  { id: 'import', label: 'Import' },
  { id: 'editor', label: 'Editor' },
  { id: 'preview', label: 'Preview' },
  { id: 'output', label: 'Output' },
];

export function PackingSlipDesignerPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('templates');
  const [store, setStore] = useState<SlipStore>({ activeId: null, slips: [] });
  const [template, setTemplate] = useState<string>('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const loadedRef = useRef(false);

  // Load store on mount
  useEffect(() => {
    const loaded = loadSlipStore(projectId);
    setStore(loaded);
    if (loaded.activeId) {
      const active = loaded.slips.find((s) => s.id === loaded.activeId);
      if (active) {
        setTemplate(active.liquid);
        setActiveTab('editor');
      }
    }
    loadedRef.current = true;
  }, [projectId]);

  // Persist store whenever it changes (but not on initial load)
  useEffect(() => {
    if (loadedRef.current) {
      saveSlipStore(projectId, store);
    }
  }, [store, projectId]);

  // Track unsaved changes when template diverges from the saved version
  useEffect(() => {
    if (!store.activeId) {
      setHasUnsavedChanges(template.length > 0);
      return;
    }
    const active = store.slips.find((s) => s.id === store.activeId);
    setHasUnsavedChanges(active ? active.liquid !== template : false);
  }, [template, store]);

  // Ctrl+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  const handleSave = useCallback(() => {
    if (!store.activeId) return;
    const now = new Date().toISOString();
    setStore((prev) => ({
      ...prev,
      slips: prev.slips.map((s) =>
        s.id === prev.activeId ? { ...s, liquid: template, updatedAt: now } : s,
      ),
    }));
    setHasUnsavedChanges(false);
  }, [store.activeId, template]);

  const handleSaveAs = useCallback(
    (name: string) => {
      const slip = createSlip(name, template);
      setStore((prev) => ({
        activeId: slip.id,
        slips: [slip, ...prev.slips],
      }));
      setHasUnsavedChanges(false);
    },
    [template],
  );

  const handleSelectVersion = useCallback(
    (id: string) => {
      const slip = store.slips.find((s) => s.id === id);
      if (!slip) return;
      setStore((prev) => ({ ...prev, activeId: id }));
      setTemplate(slip.liquid);
      setHasUnsavedChanges(false);
      if (slip.liquid) setActiveTab('editor');
    },
    [store.slips],
  );

  const handleRename = useCallback((id: string, name: string) => {
    setStore((prev) => ({
      ...prev,
      slips: prev.slips.map((s) =>
        s.id === id ? { ...s, name, updatedAt: new Date().toISOString() } : s,
      ),
    }));
  }, []);

  const handleDuplicate = useCallback(
    (id: string) => {
      const source = store.slips.find((s) => s.id === id);
      if (!source) return;
      const dup = duplicateSlip(source);
      setStore((prev) => ({
        activeId: dup.id,
        slips: [dup, ...prev.slips],
      }));
      setTemplate(dup.liquid);
      setHasUnsavedChanges(false);
    },
    [store.slips],
  );

  const handleDelete = useCallback(
    (id: string) => {
      setStore((prev) => {
        const remaining = prev.slips.filter((s) => s.id !== id);
        const nextActive =
          prev.activeId === id
            ? remaining[0]?.id ?? null
            : prev.activeId;
        return { activeId: nextActive, slips: remaining };
      });
      // If the deleted slip was active, load the next one
      setStore((prev) => {
        const active = prev.slips.find((s) => s.id === prev.activeId);
        if (active) {
          setTemplate(active.liquid);
          setHasUnsavedChanges(false);
        } else {
          setTemplate('');
          setHasUnsavedChanges(false);
        }
        return prev;
      });
    },
    [],
  );

  const handleNew = useCallback(() => {
    const slip = createSlip('New Packing Slip');
    setStore((prev) => ({
      activeId: slip.id,
      slips: [slip, ...prev.slips],
    }));
    setTemplate('');
    setHasUnsavedChanges(false);
    setActiveTab('templates');
  }, []);

  const handleTemplateSelect = useCallback(
    (liquid: string) => {
      setTemplate(liquid);
      setActiveTab('editor');
      // Auto-create a new saved slip if none is active
      if (!store.activeId) {
        const slip = createSlip('Untitled Slip', liquid);
        setStore((prev) => ({
          activeId: slip.id,
          slips: [slip, ...prev.slips],
        }));
        setHasUnsavedChanges(false);
      } else {
        setHasUnsavedChanges(true);
      }
    },
    [store.activeId],
  );

  const handleImport = useCallback(
    (liquid: string) => {
      setTemplate(liquid);
      setActiveTab('editor');
      if (!store.activeId) {
        const slip = createSlip('Imported Slip', liquid);
        setStore((prev) => ({
          activeId: slip.id,
          slips: [slip, ...prev.slips],
        }));
        setHasUnsavedChanges(false);
      } else {
        setHasUnsavedChanges(true);
      }
    },
    [store.activeId],
  );

  const handleImportIdeas = useCallback((ideas: ImportIdea[]) => {
    if (!ideas.length) return;
    const now = new Date().toISOString();
    const created = ideas.map((idea) => ({
      id: crypto.randomUUID(),
      name: idea.name,
      liquid: idea.liquid,
      createdAt: now,
      updatedAt: now,
    }));
    setStore((prev) => ({
      activeId: created[0].id,
      slips: [...created, ...prev.slips],
    }));
    setTemplate(created[0].liquid);
    setHasUnsavedChanges(false);
  }, []);

  const handleApplyFromChat = useCallback(
    (liquid: string) => {
      setTemplate(liquid);
      setActiveTab('editor');
      setHasUnsavedChanges(true);
    },
    [],
  );

  return (
    <div className="min-h-screen bg-[#fafaf9] dark:bg-[#0a0a0a]">
      <header className="border-b border-stone-200 dark:border-white/5 bg-white dark:bg-white/5 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center gap-4">
          <button
            onClick={() => router.push(`/projects/${projectId}`)}
            className="p-2 rounded-lg hover:bg-stone-100 dark:hover:bg-white/10 transition-colors"
            aria-label="Back to IDE"
          >
            <ArrowLeft size={18} className="text-stone-500 dark:text-white/50" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold text-stone-900 dark:text-white">Packing Slip Designer</h1>
            <p className="text-xs text-stone-500 dark:text-[#636059]">
              Design Shopify packing slip templates with live preview
            </p>
          </div>
          <SlipVersionManager
            slips={store.slips}
            activeId={store.activeId}
            hasUnsavedChanges={hasUnsavedChanges}
            onSelect={handleSelectVersion}
            onSave={handleSave}
            onSaveAs={handleSaveAs}
            onRename={handleRename}
            onDuplicate={handleDuplicate}
            onDelete={handleDelete}
            onNew={handleNew}
          />
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
                  : 'border-transparent text-stone-500 dark:text-[#636059] hover:text-stone-700 dark:hover:text-white/60'
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
          {activeTab === 'import' && (
            <ImportPanel onImport={handleImport} onImportIdeas={handleImportIdeas} />
          )}
          {activeTab === 'editor' && <SlipEditor value={template} onChange={setTemplate} />}
          {activeTab === 'preview' && <PrintPreview template={template} />}
          {activeTab === 'output' && <OutputPanel template={template} />}
        </div>
      </main>

      <PackingSlipChat
        projectId={projectId}
        template={template}
        onApplyTemplate={handleApplyFromChat}
      />
    </div>
  );
}
