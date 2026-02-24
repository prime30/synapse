'use client';

import { useCallback, useMemo } from 'react';
import type { PolicyContent } from '@/lib/policy-designer/types';
import { POLICY_LABELS } from '@/lib/policy-designer/types';

interface PolicyEditorProps {
  content: PolicyContent | null;
  onChange: (content: PolicyContent | null) => void;
}

export function PolicyEditor({ content, onChange }: PolicyEditorProps) {
  const wordCount = useMemo(() => {
    if (!content?.html) return 0;
    const text = content.html.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/g, ' ');
    return text.split(/\s+/).filter(Boolean).length;
  }, [content?.html]);

  const handleChange = useCallback(
    (html: string) => {
      if (!content) return;
      onChange({ ...content, html });
    },
    [content, onChange],
  );

  if (!content) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-sm text-stone-500 dark:text-white/40">
          Select a template or generate with AI to start editing.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-stone-700 dark:text-white/70">
          Editing: {POLICY_LABELS[content.type]}
        </h2>
        <span className="text-xs text-stone-400 dark:text-white/30">
          Source: {content.source === 'ai' ? 'AI Generated' : 'Template'}
        </span>
      </div>
      <textarea
        value={content.html}
        onChange={(e) => handleChange(e.target.value)}
        className="font-mono text-sm bg-stone-950 dark:bg-[oklch(0.162_0_0)] text-stone-300 rounded-lg p-4 w-full min-h-[400px] resize-y focus:outline-none focus:ring-2 focus:ring-accent/40"
        spellCheck={false}
      />
      <div className="flex justify-end">
        <span className="text-xs text-stone-400 dark:text-white/30">{wordCount} words</span>
      </div>
    </div>
  );
}
