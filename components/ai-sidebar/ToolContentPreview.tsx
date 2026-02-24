'use client';

import type { ToolProgressState } from '@/hooks/useToolProgress';

interface ToolContentPreviewProps {
  toolName: string;
  progress: ToolProgressState;
}

function getContentPreviewLines(content: string, maxLines = 4): string[] {
  const lines = content.split('\n').filter(Boolean);
  return lines.slice(0, maxLines);
}

export function ToolContentPreview({ toolName, progress }: ToolContentPreviewProps) {
  const baseClass = 'font-mono text-xs text-stone-500 dark:text-stone-400 leading-relaxed';
  const containerClass = 'px-3 py-2 max-h-20 overflow-hidden';

  switch (toolName) {
    case 'read_file': {
      const content = progress.contentPreview ?? progress.detail ?? '';
      const lines = getContentPreviewLines(content);
      if (lines.length === 0) return null;
      return (
        <div className={containerClass}>
          <pre className={`${baseClass} whitespace-pre-wrap break-words`}>
            {lines.map((line, i) => (
              <span key={i}>{line}\n</span>
            ))}
          </pre>
        </div>
      );
    }

    case 'grep_content': {
      const matches = progress.matches ?? [];
      if (matches.length === 0 && !progress.detail) return null;
      const displayMatches =
        matches.length > 0
          ? matches
          : progress.detail
            ? [{ file: progress.detail.split(':')[0] ?? progress.detail, line: parseInt(progress.detail.split(':')[1] ?? '0', 10) || 0 }]
            : [];
      return (
        <div className={containerClass}>
          <div className={baseClass}>
            {displayMatches.slice(0, 8).map((m, i) => (
              <div key={i} className="truncate">
                ▸ {m.file}:{m.line}
              </div>
            ))}
            {displayMatches.length > 8 && (
              <div className="text-stone-400 dark:text-stone-500">+{displayMatches.length - 8} more</div>
            )}
          </div>
        </div>
      );
    }

    case 'search_replace': {
      const content = progress.contentPreview ?? progress.detail ?? '';
      const lines = content.split('\n').filter(Boolean);
      const oldLines = lines.filter(l => l.trim().startsWith('-'));
      const newLines = lines.filter(l => l.trim().startsWith('+'));
      if (oldLines.length === 0 && newLines.length === 0) {
        return (
          <div className={containerClass}>
            <span className={baseClass}>{content || 'Applying edit...'}</span>
          </div>
        );
      }
      return (
        <div className={containerClass}>
          <div className={baseClass}>
            {oldLines.slice(0, 2).map((line, i) => (
              <div key={`old-${i}`} className="text-red-400 dark:text-red-400">
                − {line.replace(/^-\s*/, '')}
              </div>
            ))}
            {newLines.slice(0, 2).map((line, i) => (
              <div key={`new-${i}`} className="text-green-400 dark:text-green-400">
                + {line.replace(/^\+\s*/, '')}
              </div>
            ))}
          </div>
        </div>
      );
    }

    case 'create_file':
    case 'write_file': {
      const lineCount = progress.lineNumber ?? 0;
      const path = progress.detail || 'file';
      return (
        <div className={containerClass}>
          <span className={baseClass}>
            {lineCount > 0 ? `Writing ${lineCount} lines to ${path}...` : `Writing to ${path}...`}
          </span>
        </div>
      );
    }

    case 'list_files': {
      const count = progress.matchCount ?? 0;
      return (
        <div className={containerClass}>
          <span className={baseClass}>Found {count} files...</span>
        </div>
      );
    }

    default:
      if (!progress.detail) return null;
      return (
        <div className={containerClass}>
          <span className={baseClass}>{progress.detail}</span>
        </div>
      );
  }
}
