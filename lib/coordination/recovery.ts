import { promises as fs } from 'fs';
import path from 'path';
import { atomicRead, atomicWrite, getCoordinationRoot } from './atomic';
import {
  FileLockSchema,
  TaskAssignmentSchema,
  TaskSchema,
} from './schemas';
import { detectStaleAgents } from './heartbeat';

const FILE_LOCKS_PATH = 'coordination/file_locks.json';
const TASKS_DIR = 'tasks';
const ASSIGNMENTS_DIR = 'tasks/assignments';

/**
 * Recover from stale agent state: release locks, unassign tasks.
 */
export async function recoverCoordinationState(): Promise<void> {
  const staleAgents = await detectStaleAgents();
  const base = getCoordinationRoot();

  const locks = await atomicRead(FILE_LOCKS_PATH, FileLockSchema);
  const updatedLocks = { ...locks.locks };
  let changed = false;

  for (const [file, lock] of Object.entries(locks.locks)) {
    if (staleAgents.includes(lock.locked_by)) {
      delete updatedLocks[file];
      changed = true;
    }
  }

  if (changed) {
    await atomicWrite(FILE_LOCKS_PATH, {
      locks: updatedLocks,
      updated_at: new Date().toISOString(),
    });
  }

  for (const agentId of staleAgents) {
    const assignmentPath = path.join(ASSIGNMENTS_DIR, `${agentId}.json`);
    const fullPath = path.join(base, assignmentPath);

    try {
      await fs.access(fullPath);
    } catch {
      continue;
    }

    const assignment = await atomicRead(assignmentPath, TaskAssignmentSchema);

    if (assignment.task_id) {
      const taskPath = path.join(TASKS_DIR, `${assignment.task_id}.json`);
      try {
        const task = await atomicRead(taskPath, TaskSchema);
        await atomicWrite(taskPath, {
          ...task,
          status: 'pending',
          assigned_to: null,
          updated_at: new Date().toISOString(),
        });
      } catch {
        // Task file may not exist
      }
    }

    await atomicWrite(assignmentPath, {
      ...assignment,
      task_id: null,
      assigned_at: null,
      status: 'idle',
    });
  }
}
