'use client';

import { useState, useCallback, useRef } from 'react';
import { Upload, ClipboardPaste } from 'lucide-react';
import { generateImportIdeas, type ImportIdea } from '@/lib/packing-slip-designer/idea-generator';

interface ImportPanelProps {
  onImport: (liquid: string) => void;
  onImportIdeas: (ideas: ImportIdea[]) => void;
}

export function ImportPanel({ onImport, onImportIdeas }: ImportPanelProps) {
  const [pasteValue, setPasteValue] = useState('');
  const [generatedIdeas, setGeneratedIdeas] = useState<ImportIdea[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePasteImport = useCallback(() => {
    if (pasteValue.trim()) {
      const ideas = generateImportIdeas(pasteValue.trim());
      if (ideas.length > 0) {
        setGeneratedIdeas(ideas);
        onImportIdeas(ideas);
      }
    }
  }, [pasteValue, onImportIdeas]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result;
        if (typeof text === 'string' && text.trim()) {
          const ideas = generateImportIdeas(text.trim());
          if (ideas.length > 0) {
            setGeneratedIdeas(ideas);
            onImportIdeas(ideas);
          }
        }
      };
      reader.readAsText(file);
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [onImportIdeas],
  );

  return (
    <div className="space-y-8">
      {/* Paste section */}
      <div className="rounded-xl border border-stone-200 dark:border-white/10 bg-white dark:bg-[#141414] p-6">
        <div className="flex items-center gap-2 mb-4">
          <ClipboardPaste size={18} className="text-stone-500 dark:text-white/50" />
          <h3 className="text-sm font-semibold text-stone-900 dark:text-white">
            Paste Existing Template
          </h3>
        </div>
        <p className="text-xs text-stone-500 dark:text-[#636059] mb-4 leading-relaxed">
          Copy your existing packing slip template from Shopify Admin
          (Settings &rarr; Shipping and delivery &rarr; Packing slip template) and paste it below.
        </p>
        <textarea
          value={pasteValue}
          onChange={(e) => setPasteValue(e.target.value)}
          placeholder="Paste your HTML + Liquid packing slip template here..."
          rows={12}
          className="w-full rounded-lg border border-stone-300 dark:border-white/10 bg-white dark:bg-white/5 px-4 py-3 text-sm font-mono text-stone-900 dark:text-white placeholder:text-stone-400 dark:placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-accent/40 resize-y"
        />
        <div className="mt-4 flex justify-end">
          <button
            onClick={handlePasteImport}
            disabled={!pasteValue.trim()}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Import + Generate 6 Ideas
          </button>
        </div>
      </div>

      {generatedIdeas.length > 0 && (
        <div className="rounded-xl border border-stone-200 dark:border-white/10 bg-white dark:bg-[#141414] p-6">
          <h3 className="text-sm font-semibold text-stone-900 dark:text-white mb-1">
            Design Ideas from Import
          </h3>
          <p className="text-xs text-stone-500 dark:text-[#636059] mb-4">
            We created 6 editable versions. Pick one to load in the editor.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {generatedIdeas.map((idea) => (
              <div
                key={idea.id}
                className="rounded-lg border border-stone-200 dark:border-white/10 bg-stone-50 dark:bg-white/5 p-3"
              >
                <p className="text-sm font-medium text-stone-900 dark:text-white">{idea.name}</p>
                <p className="text-xs text-stone-500 dark:text-[#636059] mt-1">{idea.description}</p>
                <button
                  onClick={() => onImport(idea.liquid)}
                  className="mt-3 px-3 py-1.5 text-xs font-medium rounded-md bg-accent hover:bg-accent-hover text-white transition-colors"
                >
                  Use This Idea
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* File upload section */}
      <div className="rounded-xl border border-stone-200 dark:border-white/10 bg-white dark:bg-[#141414] p-6">
        <div className="flex items-center gap-2 mb-4">
          <Upload size={18} className="text-stone-500 dark:text-white/50" />
          <h3 className="text-sm font-semibold text-stone-900 dark:text-white">
            Upload File
          </h3>
        </div>
        <p className="text-xs text-stone-500 dark:text-[#636059] mb-4 leading-relaxed">
          Upload a <code className="px-1 py-0.5 rounded bg-stone-100 dark:bg-white/10 text-xs">.liquid</code> or
          <code className="px-1 py-0.5 rounded bg-stone-100 dark:bg-white/10 text-xs">.html</code> file containing
          your packing slip template.
        </p>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-stone-200 dark:border-white/10 text-stone-700 dark:text-white/70 hover:bg-stone-50 dark:hover:bg-white/5 transition-colors"
        >
          <Upload size={14} />
          Choose File
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".liquid,.html,.htm,.txt"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
    </div>
  );
}
