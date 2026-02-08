import type { DependencyAnalysis, ExecutionWave, FileConflict } from './types';

/**
 * Identify file conflicts: tasks in the same candidate wave that modify the same file.
 */
function findFileConflicts(
  taskIds: string[],
  tasks: Map<string, { files: string[] }>
): FileConflict[] {
  const fileToTasks = new Map<string, string[]>();
  for (const taskId of taskIds) {
    const node = tasks.get(taskId);
    if (!node) continue;
    for (const file of node.files) {
      const list = fileToTasks.get(file) ?? [];
      list.push(taskId);
      fileToTasks.set(file, list);
    }
  }

  const conflicts: FileConflict[] = [];
  for (const [file, ids] of fileToTasks) {
    if (ids.length > 1) {
      conflicts.push({
        file,
        tasks: ids,
        resolution: 'sequential',
      });
    }
  }
  return conflicts;
}

/**
 * Split taskIds into groups: those with no conflicts can be parallel; conflicting ones must be sequential.
 * Simplified: if any conflict exists in the wave, put conflicting tasks in separate waves.
 */
function partitionByConflicts(
  taskIds: string[],
  tasks: Map<string, { files: string[] }>
): string[][] {
  const conflicts = findFileConflicts(taskIds, tasks);
  if (conflicts.length === 0) return [taskIds];

  const conflictSet = new Set<string>();
  for (const c of conflicts) {
    for (const t of c.tasks) conflictSet.add(t);
  }

  const safe = taskIds.filter((t) => !conflictSet.has(t));
  const conflicting = taskIds.filter((t) => conflictSet.has(t));

  const result: string[][] = [];
  if (safe.length > 0) result.push(safe);
  for (const t of conflicting) result.push([t]);
  return result;
}

/**
 * Calculate execution waves from dependency analysis.
 * Wave 0 = roots. Each subsequent wave = tasks whose deps are all in earlier waves.
 * File conflicts within a wave force sequential execution (split into sub-waves).
 */
export function calculateWaves(analysis: DependencyAnalysis): ExecutionWave[] {
  if (analysis.hasCycles) return [];

  const waves: ExecutionWave[] = [];
  const completed = new Set<string>();
  let waveNum = 0;

  while (completed.size < analysis.tasks.size) {
    const candidates: string[] = [];
    for (const [taskId, node] of analysis.tasks) {
      if (completed.has(taskId)) continue;
      const allDepsDone = node.dependsOn.every((d) => completed.has(d));
      if (allDepsDone) candidates.push(taskId);
    }

    if (candidates.length === 0) break;

    const partitions = partitionByConflicts(candidates, analysis.tasks);

    for (const partition of partitions) {
      const fileConflicts = findFileConflicts(partition, analysis.tasks);
      const maxComplexity = Math.max(
        ...partition.map((id) => {
          const t = analysis.tasks.get(id);
          return t ? 5 : 0;
        })
      );
      waves.push({
        waveNumber: waveNum++,
        tasks: partition,
        estimatedDuration: maxComplexity,
        fileConflicts,
      });
      for (const id of partition) completed.add(id);
    }
  }

  return waves;
}
