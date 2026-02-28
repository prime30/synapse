'use client';

import { useCallback } from 'react';
import { FileText, Tag, ClipboardList, Minimize2 } from 'lucide-react';
import { getAllTemplates } from '@/lib/packing-slip-designer/templates';
import type { SlipTemplateId } from '@/lib/packing-slip-designer/types';

interface TemplateSelectorProps {
  onSelect: (liquid: string) => void;
}

const CARD_CONFIG: { id: SlipTemplateId; icon: typeof FileText; color: string; bg: string }[] = [
  { id: 'minimal', icon: FileText, color: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-100 dark:bg-sky-500/15' },
  { id: 'branded', icon: Tag, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-100 dark:bg-violet-500/15' },
  { id: 'detailed', icon: ClipboardList, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-500/15' },
  { id: 'compact', icon: Minimize2, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-500/15' },
];

export function TemplateSelector({ onSelect }: TemplateSelectorProps) {
  const templates = getAllTemplates();

  const handleSelect = useCallback(
    (id: SlipTemplateId) => {
      const tpl = templates.find((t) => t.id === id);
      if (tpl) onSelect(tpl.liquid);
    },
    [templates, onSelect],
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {CARD_CONFIG.map(({ id, icon: Icon, color, bg }) => {
        const tpl = templates.find((t) => t.id === id);
        if (!tpl) return null;
        return (
          <div
            key={id}
            className="rounded-xl border border-stone-200 dark:border-white/10 bg-white dark:bg-[#141414] p-6 hover:border-stone-300 dark:hover:border-white/20 transition-colors"
          >
            <div className={`w-10 h-10 rounded-full ${bg} flex items-center justify-center mb-4`}>
              <Icon size={18} className={color} />
            </div>
            <h3 className="text-sm font-semibold text-stone-900 dark:text-white mb-1">
              {tpl.name}
            </h3>
            <p className="text-xs text-stone-500 dark:text-[#636059] mb-4 leading-relaxed">
              {tpl.description}
            </p>
            <button
              onClick={() => handleSelect(id)}
              className="w-full px-4 py-2 text-sm font-medium rounded-lg bg-accent hover:bg-accent-hover text-white transition-colors"
            >
              Use Template
            </button>
          </div>
        );
      })}
    </div>
  );
}
