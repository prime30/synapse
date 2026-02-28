'use client';

import type { AISidebarContextValue } from '@/hooks/useAISidebar';

interface ContextPanelProps {
  context: AISidebarContextValue;
  className?: string;
}

export function ContextPanel({ context, className = '' }: ContextPanelProps) {
  const hasContext =
    context.filePath || context.fileLanguage || context.selection;

  if (!hasContext) return null;

  return (
    <div
      className={`rounded border ide-border-subtle ide-surface-inset px-2 py-1.5 text-xs ide-text-muted ${className}`}
      role="region"
      aria-label="Context"
    >
      {context.filePath && (
        <div className="truncate font-medium ide-text-2">
          {context.filePath}
        </div>
      )}
      {context.fileLanguage && (
        <div className="mt-0.5 ide-text-muted">{context.fileLanguage}</div>
      )}
      {context.selection && (
        <div className="mt-1 truncate max-h-8 border-t ide-border-subtle pt-1 ide-text-3">
          {context.selection}
        </div>
      )}
    </div>
  );
}
