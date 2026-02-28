'use client';

import { useCallback } from 'react';
import { RotateCcw, Shield, FileText, Truck, Mail } from 'lucide-react';
import type { PolicyType, PolicyContent } from '@/lib/policy-designer/types';
import { POLICY_LABELS, POLICY_DESCRIPTIONS } from '@/lib/policy-designer/types';
import { getTemplate } from '@/lib/policy-designer/templates';

interface TemplateSelectorProps {
  onSelect: (policy: PolicyContent) => void;
}

const CARD_CONFIG: { type: PolicyType; icon: typeof RotateCcw; color: string; bg: string }[] = [
  { type: 'return', icon: RotateCcw, color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-100 dark:bg-rose-500/15' },
  { type: 'privacy', icon: Shield, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-500/15' },
  { type: 'terms', icon: FileText, color: 'text-sky-600 dark:text-sky-400', bg: 'bg-sky-100 dark:bg-sky-500/15' },
  { type: 'shipping', icon: Truck, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-100 dark:bg-violet-500/15' },
  { type: 'contact', icon: Mail, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-500/15' },
];

export function TemplateSelector({ onSelect }: TemplateSelectorProps) {
  const handleSelect = useCallback(
    (type: PolicyType) => {
      onSelect({
        type,
        title: POLICY_LABELS[type],
        html: getTemplate(type),
        source: 'template',
        generatedAt: new Date().toISOString(),
      });
    },
    [onSelect],
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {CARD_CONFIG.map(({ type, icon: Icon, color, bg }) => (
        <div
          key={type}
          className="rounded-xl border border-stone-200 dark:border-[#2a2a2a] bg-white dark:bg-[#1a1a1a] p-6 hover:border-stone-300 dark:hover:border-[#333333] transition-colors"
        >
          <div className={`w-10 h-10 rounded-full ${bg} flex items-center justify-center mb-4`}>
            <Icon size={18} className={color} />
          </div>
          <h3 className="text-sm font-semibold text-stone-900 dark:text-white mb-1">
            {POLICY_LABELS[type]}
          </h3>
          <p className="text-xs text-stone-500 dark:text-[#636059] mb-4 leading-relaxed">
            {POLICY_DESCRIPTIONS[type]}
          </p>
          <button
            onClick={() => handleSelect(type)}
            className="w-full px-4 py-2 text-sm font-medium rounded-lg bg-accent hover:bg-accent-hover text-white transition-colors"
          >
            Use Template
          </button>
        </div>
      ))}
    </div>
  );
}
