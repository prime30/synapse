import { promises as fs } from 'fs';
import path from 'path';
import { atomicRead, getCoordinationRoot } from './atomic';
import { DependencyGraphSchema, TaskSchema } from './schemas';
import type { Task } from './schemas';

const TASKS_DIR = 'tasks';
const DEPENDENCY_GRAPH_PATH = 'coordination/dependency-graph.json';

/**
 * Get tasks that are pending and have all dependencies completed.
 */
export async function getAvailableTasks(): Promise<Task[]> {
  const base = getCoordinationRoot();
  const tasksPath = path.join(base, TASKS_DIR);
  const depGraph = await atomicRead(DEPENDENCY_GRAPH_PATH, DependencyGraphSchema);

  let files: string[];
  try {
    files = await fs.readdir(tasksPath);
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === 'ENOENT') {
      return [];
    }
    throw err;
  }

  const available: Task[] = [];

  for (const file of files) {
    if (!file.endsWith('.json') || file.startsWith('.')) continue;
    const fullPath = path.join(tasksPath, file);
    const stat = await fs.stat(fullPath);
    if (!stat.isFile()) continue;

    const taskId = file.replace(/\.json$/, '');
    const taskRelativePath = path.join(TASKS_DIR, file);

    let task: Task;
    try {
      task = await atomicRead(taskRelativePath, TaskSchema);
    } catch {
      continue;
    }

    if (task.status !== 'pending') continue;

    const deps = depGraph.tasks[taskId]?.depends_on ?? [];
    let allDepsCompleted = true;

    for (const depId of deps) {
      const depPath = path.join(TASKS_DIR, `${depId}.json`);
      try {
        const depTask = await atomicRead(depPath, TaskSchema);
        if (depTask.status !== 'completed') {
          allDepsCompleted = false;
          break;
        }
      } catch {
        allDepsCompleted = false;
        break;
      }
    }

    if (allDepsCompleted) {
      available.push(task);
    }
  }

  return available;
}
