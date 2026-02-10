'use client';

import type { AISidebarContextValue } from '@/hooks/useAISidebar';

interface ContextPanelProps {
  context: AISidebarContextValue;
  className?: string;
}

export function ContextPanel({ context, className = '' }: ContextPanelProps) {
  const hasContext =
    context.filePath || context.fileLanguage || context.selection;

  if (!hasContext) {
    return (
      <div
        className={`rounded border border-gray-700/60 bg-gray-800/40 px-2 py-1.5 text-xs text-gray-500 ${className}`}
        role="region"
        aria-label="Context"
      >
        No file or selection
      </div>
    );
  }

  return (
    <div
      className={`rounded border border-gray-700/60 bg-gray-800/40 px-2 py-1.5 text-xs text-gray-400 ${className}`}
      role="region"
      aria-label="Context"
    >
      {context.filePath && (
        <div className="truncate font-medium text-gray-300">
          {context.filePath}
        </div>
      )}
      {context.fileLanguage && (
        <div className="mt-0.5 text-gray-500">{context.fileLanguage}</div>
      )}
      {context.selection && (
        <div className="mt-1 truncate max-h-8 border-t border-gray-700/60 pt-1 text-gray-500">
          {context.selection}
        </div>
      )}
    </div>
  );
}
