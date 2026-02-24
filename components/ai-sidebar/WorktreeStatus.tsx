'use client';

interface WorktreeStatusProps {
  worktrees: Array<{
    id: string;
    agentId: string;
    modifiedCount: number;
    createdCount: number;
  }>;
  conflicts: Array<{ path: string }>;
}

export function WorktreeStatus({ worktrees, conflicts }: WorktreeStatusProps) {
  if (worktrees.length === 0 && conflicts.length === 0) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-stone-500 dark:text-stone-400 border-t border-stone-200 dark:border-white/10">
      {worktrees.length > 0 && (
        <span className="font-medium">{worktrees.length} parallel branches</span>
      )}
      {conflicts.length > 0 && (
        <span className="text-amber-500 dark:text-amber-400">
          {conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  );
}
