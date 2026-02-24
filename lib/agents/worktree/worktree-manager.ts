/**
 * Virtual worktree manager for parallel agent isolation.
 * Each "worktree" is an in-memory fork of the project files.
 * Specialists write to their worktree, then changes merge back to the main state.
 */

export interface VirtualWorktree {
  id: string;
  agentId: string;
  baseFiles: Map<string, string>;
  modifiedFiles: Map<string, string>;
  createdFiles: Map<string, string>;
  deletedFiles: Set<string>;
  createdAt: number;
}

const activeWorktrees = new Map<string, VirtualWorktree>();

export function createWorktree(
  agentId: string,
  baseFiles: Map<string, string>
): VirtualWorktree {
  const worktree: VirtualWorktree = {
    id: `wt-${agentId}-${Date.now()}`,
    agentId,
    baseFiles,
    modifiedFiles: new Map(),
    createdFiles: new Map(),
    deletedFiles: new Set(),
    createdAt: Date.now(),
  };
  activeWorktrees.set(worktree.id, worktree);
  return worktree;
}

export function readFile(worktreeId: string, path: string): string | null {
  const wt = activeWorktrees.get(worktreeId);
  if (!wt) return null;

  if (wt.deletedFiles.has(path)) return null;
  if (wt.createdFiles.has(path)) return wt.createdFiles.get(path)!;
  if (wt.modifiedFiles.has(path)) return wt.modifiedFiles.get(path)!;
  return wt.baseFiles.get(path) ?? null;
}

export function writeFile(worktreeId: string, path: string, content: string): boolean {
  const wt = activeWorktrees.get(worktreeId);
  if (!wt) return false;

  if (wt.baseFiles.has(path)) {
    wt.modifiedFiles.set(path, content);
  } else {
    wt.createdFiles.set(path, content);
  }
  wt.deletedFiles.delete(path);
  return true;
}

export function deleteFile(worktreeId: string, path: string): boolean {
  const wt = activeWorktrees.get(worktreeId);
  if (!wt) return false;

  wt.deletedFiles.add(path);
  wt.modifiedFiles.delete(path);
  wt.createdFiles.delete(path);
  return true;
}

export interface MergeResult {
  applied: Array<{ path: string; action: 'modified' | 'created' | 'deleted' }>;
  conflicts: Array<{ path: string; worktree1: string; worktree2: string }>;
}

export function mergeWorktree(worktreeId: string): MergeResult {
  const wt = activeWorktrees.get(worktreeId);
  if (!wt) return { applied: [], conflicts: [] };

  const applied: MergeResult['applied'] = [];

  for (const [path] of wt.modifiedFiles) {
    applied.push({ path, action: 'modified' });
  }
  for (const [path] of wt.createdFiles) {
    applied.push({ path, action: 'created' });
  }
  for (const path of wt.deletedFiles) {
    applied.push({ path, action: 'deleted' });
  }

  activeWorktrees.delete(worktreeId);

  return { applied, conflicts: [] };
}

export function mergeMultipleWorktrees(worktreeIds: string[]): MergeResult {
  const allApplied: MergeResult['applied'] = [];
  const conflicts: MergeResult['conflicts'] = [];
  const fileOwners = new Map<string, string>();

  for (const wtId of worktreeIds) {
    const wt = activeWorktrees.get(wtId);
    if (!wt) continue;

    const touchedPaths = [
      ...wt.modifiedFiles.keys(),
      ...wt.createdFiles.keys(),
      ...wt.deletedFiles,
    ];
    for (const path of touchedPaths) {
      const existingOwner = fileOwners.get(path);
      if (existingOwner && existingOwner !== wtId) {
        conflicts.push({ path, worktree1: existingOwner, worktree2: wtId });
      } else {
        fileOwners.set(path, wtId);
      }
    }

    const result = mergeWorktree(wtId);
    allApplied.push(...result.applied);
  }

  return { applied: allApplied, conflicts };
}

export function destroyWorktree(worktreeId: string): void {
  activeWorktrees.delete(worktreeId);
}

export function getActiveWorktrees(): VirtualWorktree[] {
  return [...activeWorktrees.values()];
}

/** Summary for UI display (WorktreeStatus). */
export function getWorktreeSummary(): {
  worktrees: Array<{ id: string; agentId: string; modifiedCount: number; createdCount: number }>;
  conflicts: Array<{ path: string }>;
} {
  const list = getActiveWorktrees();
  const worktrees = list.map((wt) => ({
    id: wt.id,
    agentId: wt.agentId,
    modifiedCount: wt.modifiedFiles.size,
    createdCount: wt.createdFiles.size,
  }));
  const fileOwners = new Map<string, string>();
  const conflicts: Array<{ path: string }> = [];
  for (const wt of list) {
    const touchedPaths = [
      ...wt.modifiedFiles.keys(),
      ...wt.createdFiles.keys(),
      ...wt.deletedFiles,
    ];
    for (const path of touchedPaths) {
      const existing = fileOwners.get(path);
      if (existing && existing !== wt.id) {
        conflicts.push({ path });
      } else {
        fileOwners.set(path, wt.id);
      }
    }
  }
  return { worktrees, conflicts };
}
