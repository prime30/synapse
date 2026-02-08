import { atomicRead } from '../coordination/atomic';
import { TaskSchema, FileLockSchema } from '../coordination/schemas';
import { detectStaleAgents } from '../coordination/heartbeat';
import { recoverCoordinationState } from '../coordination/recovery';
import type { BlockerInfo } from './types';

const TASKS_DIR = 'tasks';
const MAX_RESOLUTION_ATTEMPTS = 3;

const blockerAttempts = new Map<string, number>();

/**
 * Detect blockers: dependency failed, file lock, stale agent, integration.
 */
export async function detectBlockers(
  taskIds: string[]
): Promise<BlockerInfo[]> {
  const blockers: BlockerInfo[] = [];
  const staleAgents = await detectStaleAgents();
  const locks = await atomicRead('coordination/file_locks.json', FileLockSchema);

  for (const taskId of taskIds) {
    let task;
    try {
      task = await atomicRead(`${TASKS_DIR}/${taskId}.json`, TaskSchema);
    } catch {
      continue;
    }

    if (task.status !== 'blocked') continue;

    let reason = 'unknown';
    if (task.assigned_to && staleAgents.includes(task.assigned_to)) {
      reason = 'agent_stale';
    } else {
      const deps = task.dependencies ?? [];
      for (const depId of deps) {
        try {
          const dep = await atomicRead(
            `${TASKS_DIR}/${depId}.json`,
            TaskSchema
          );
          if (dep.status === 'failed') {
            reason = `dependency_failed:${depId}`;
            break;
          }
        } catch {
          reason = `dependency_missing:${depId}`;
          break;
        }
      }
      if (reason === 'unknown') {
        const files = task.files_to_modify ?? [];
        for (const file of files) {
          const lock = locks.locks[file];
          if (lock && !staleAgents.includes(lock.locked_by)) {
            reason = `file_locked:${file}`;
            break;
          }
        }
      }
    }

    const attempts = blockerAttempts.get(taskId) ?? 0;
    blockers.push({
      taskId,
      taskTitle: task.title,
      reason,
      resolutionAttempts: attempts,
    });
  }

  return blockers;
}

/**
 * Attempt to resolve blockers. Returns unresolved blockers.
 */
export async function resolveBlockers(
  blockers: BlockerInfo[]
): Promise<BlockerInfo[]> {
  const unresolved: BlockerInfo[] = [];

  for (const b of blockers) {
    const attempts = blockerAttempts.get(b.taskId) ?? 0;
    if (attempts >= MAX_RESOLUTION_ATTEMPTS) {
      unresolved.push({ ...b, resolution: 'escalated' });
      continue;
    }

    if (b.reason.startsWith('agent_stale') || b.reason === 'agent_stale') {
      await recoverCoordinationState();
      blockerAttempts.set(b.taskId, attempts + 1);
    } else if (b.reason.startsWith('file_locked:')) {
      await recoverCoordinationState();
      blockerAttempts.set(b.taskId, attempts + 1);
    } else if (b.reason.startsWith('dependency_failed:')) {
      blockerAttempts.set(b.taskId, attempts + 1);
      unresolved.push({ ...b, resolution: 'manual_debug_required' });
    } else {
      unresolved.push(b);
    }
  }

  return unresolved;
}
