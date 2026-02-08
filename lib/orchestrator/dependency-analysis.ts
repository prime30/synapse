import { promises as fs } from 'fs';
import path from 'path';
import {
  atomicRead,
  getCoordinationRoot,
} from '../coordination/atomic';
import { TaskSchema, DependencyGraphSchema } from '../coordination/schemas';
import type { Task } from '../coordination/schemas';
import type { DependencyAnalysis, TaskNode } from './types';

const TASKS_DIR = 'tasks';
const DEPENDENCY_GRAPH_PATH = 'coordination/dependency-graph.json';

/**
 * Detect cycles in dependency graph using DFS with recursion stack.
 */
function findCycles(adj: Map<string, string[]>): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const pathMap = new Map<string, string>();
  const cycleIds = new Set<string>();

  function dfs(node: string, path: string[]): void {
    visited.add(node);
    recStack.add(node);
    pathMap.set(node, path.join('->'));

    for (const next of adj.get(node) ?? []) {
      if (!visited.has(next)) {
        dfs(next, [...path, next]);
      } else if (recStack.has(next)) {
        const cycleStart = path.indexOf(next);
        const cycle = path.slice(cycleStart).concat(next);
        const key = cycle.slice().sort().join(',');
        if (!cycleIds.has(key)) {
          cycleIds.add(key);
          cycles.push(cycle);
        }
      }
    }

    recStack.delete(node);
  }

  for (const node of adj.keys()) {
    if (!visited.has(node)) {
      dfs(node, [node]);
    }
  }
  return cycles;
}

/**
 * Calculate longest path from root (depth) for each task.
 */
function calculateDepths(
  tasks: Map<string, TaskNode>,
  roots: string[]
): void {
  const depths = new Map<string, number>();
  for (const r of roots) depths.set(r, 0);

  const visit = (node: string, depth: number) => {
    const current = depths.get(node) ?? 0;
    if (depth > current) depths.set(node, depth);
    const t = tasks.get(node);
    if (!t) return;
    for (const next of t.blocks) {
      visit(next, depth + 1);
    }
  };

  for (const r of roots) {
    visit(r, 0);
  }

  for (const [id, t] of tasks) {
    t.depth = depths.get(id) ?? 0;
  }
}

/**
 * Load all task files from .cursor/tasks/ (excluding assignments dir).
 */
async function loadAllTasks(): Promise<Map<string, Task>> {
  const base = getCoordinationRoot();
  const tasksPath = path.join(base, TASKS_DIR);

  let files: string[];
  try {
    files = await fs.readdir(tasksPath);
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === 'ENOENT') return new Map();
    throw err;
  }

  const result = new Map<string, Task>();
  for (const file of files) {
    if (!file.endsWith('.json') || file.startsWith('.')) continue;
    const fullPath = path.join(tasksPath, file);
    const stat = await fs.stat(fullPath);
    if (!stat.isFile()) continue;

    const taskId = file.replace(/\.json$/, '');
    try {
      const task = await atomicRead(
        path.join(TASKS_DIR, file),
        TaskSchema
      );
      result.set(taskId, task);
    } catch {
      continue;
    }
  }
  return result;
}

/**
 * Analyze dependency graph: load tasks, build adjacency, detect cycles, compute depth, identify file conflicts.
 */
export async function analyzeDependencies(): Promise<DependencyAnalysis> {
  const taskMap = await loadAllTasks();
  let depGraph = { tasks: {} as Record<string, { depends_on: string[]; blocks: string[]; files: string[] }>, updated_at: '' };
  try {
    depGraph = await atomicRead(DEPENDENCY_GRAPH_PATH, DependencyGraphSchema);
  } catch {
    // No graph yet
  }

  const nodes = new Map<string, TaskNode>();
  const adj = new Map<string, string[]>();

  for (const [taskId, task] of taskMap) {
    const entry = depGraph.tasks[taskId] ?? {
      depends_on: task.dependencies ?? [],
      blocks: task.blocks ?? [],
      files: task.files_to_modify ?? [],
    };
    nodes.set(taskId, {
      taskId,
      dependsOn: entry.depends_on,
      blocks: entry.blocks,
      depth: 0,
      files: entry.files,
    });
    adj.set(taskId, [...entry.depends_on]);
  }

  const cycles = findCycles(adj);
  const hasCycles = cycles.length > 0;

  const roots: string[] = [];
  const leaves: string[] = [];
  for (const [id, node] of nodes) {
    if (node.dependsOn.length === 0) roots.push(id);
    if (node.blocks.length === 0) leaves.push(id);
  }

  calculateDepths(nodes, roots);

  return {
    tasks: nodes,
    hasCycles,
    cycles,
    roots,
    leaves,
  };
}
