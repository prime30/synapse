'use client';

import { motion } from 'framer-motion';
import { FileText, Search, FileEdit, FilePlus, List, Loader2 } from 'lucide-react';
import type { ToolProgressState } from '@/hooks/useToolProgress';

interface EnhancedTypingIndicatorProps {
  activeTools: Map<string, ToolProgressState>;
  thinkingLabel?: string;
  isStreaming: boolean;
}

const TOOL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  read_file: FileText,
  grep_content: Search,
  search_files: Search,
  search_replace: FileEdit,
  create_file: FilePlus,
  write_file: FileEdit,
  list_files: List,
};

function getToolLabel(state: ToolProgressState): string {
  const { name, detail, matchCount } = state;
  switch (name) {
    case 'read_file':
      return `Reading ${detail || 'file'}...`;
    case 'grep_content':
    case 'search_files':
      return matchCount != null ? `Searching ${matchCount} files...` : `Searching ${detail || 'files'}...`;
    case 'search_replace':
      return `Editing ${detail || 'file'}...`;
    case 'create_file':
    case 'write_file':
      return `Writing to ${detail || 'file'}...`;
    case 'list_files':
      return `Listing ${detail || 'files'}...`;
    default:
      return detail || `${name}...`;
  }
}

export function EnhancedTypingIndicator({
  activeTools,
  thinkingLabel,
  isStreaming,
}: EnhancedTypingIndicatorProps) {
  if (!isStreaming) return null;

  const tools = Array.from(activeTools.values());
  const mostRecent = tools[tools.length - 1];
  const Icon = mostRecent ? TOOL_ICONS[mostRecent.name] ?? Loader2 : null;
  const label = mostRecent ? getToolLabel(mostRecent) : thinkingLabel ?? 'Thinking...';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="flex items-center gap-2 px-4 py-2 text-xs text-stone-500 dark:text-stone-400"
    >
      {Icon ? (
        <Icon className="h-3.5 w-3.5 shrink-0 text-sky-500 dark:text-sky-400" aria-hidden />
      ) : (
        <span className="inline-flex gap-0.5" aria-hidden>
          <span className="w-1 h-1 rounded-full bg-stone-400 animate-pulse" style={{ animationDelay: '0ms' }} />
          <span className="w-1 h-1 rounded-full bg-stone-400 animate-pulse" style={{ animationDelay: '150ms' }} />
          <span className="w-1 h-1 rounded-full bg-stone-400 animate-pulse" style={{ animationDelay: '300ms' }} />
        </span>
      )}
      <span>{label}</span>
    </motion.div>
  );
}
