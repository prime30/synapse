'use client';

import { useState } from 'react';
import { Monitor, Tablet, Smartphone } from 'lucide-react';
import type { PolicyContent, ThemeStyles } from '@/lib/policy-designer/types';

interface PreviewPanelProps {
  content: PolicyContent | null;
  styles: ThemeStyles | null;
}

type Viewport = 'desktop' | 'tablet' | 'mobile';

const VIEWPORTS: { id: Viewport; label: string; icon: typeof Monitor; maxW: string }[] = [
  { id: 'desktop', label: 'Desktop', icon: Monitor, maxW: 'max-w-4xl' },
  { id: 'tablet', label: 'Tablet', icon: Tablet, maxW: 'max-w-lg' },
  { id: 'mobile', label: 'Mobile', icon: Smartphone, maxW: 'max-w-sm' },
];

export function PreviewPanel({ content, styles }: PreviewPanelProps) {
  const [viewport, setViewport] = useState<Viewport>('desktop');

  if (!content) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-sm text-stone-500 dark:text-white/40">
          No content to preview. Select a template or generate with AI first.
        </p>
      </div>
    );
  }

  const activeViewport = VIEWPORTS.find((v) => v.id === viewport)!;

  const inlineStyles: React.CSSProperties = styles
    ? {
        fontFamily: styles.bodyFont,
        color: styles.textColor,
        backgroundColor: styles.backgroundColor,
      }
    : {};

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-1 rounded-lg border border-stone-200 dark:border-white/10 bg-white dark:bg-white/5 p-1 w-fit mx-auto">
        {VIEWPORTS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setViewport(id)}
            title={label}
            className={`p-2 rounded-md transition-colors ${
              viewport === id
                ? 'bg-stone-100 dark:bg-white/10 text-stone-900 dark:text-white'
                : 'text-stone-400 dark:text-white/30 hover:text-stone-600 dark:hover:text-white/50'
            }`}
          >
            <Icon size={16} />
          </button>
        ))}
      </div>

      <div className="flex justify-center">
        <div
          className={`${activeViewport.maxW} w-full border border-stone-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5 p-8 transition-all`}
          style={inlineStyles}
        >
          <div
            className="prose prose-stone dark:prose-invert max-w-none text-sm"
            dangerouslySetInnerHTML={{ __html: content.html }}
          />
        </div>
      </div>
    </div>
  );
}
