import { atomicRead, atomicWrite } from './atomic';
import { FileLockSchema } from './schemas';
import type { FileLock } from './schemas';

const FILE_LOCKS_PATH = 'coordination/file_locks.json';
const DEFAULT_TIMEOUT_MINUTES = 30;

/**
 * Acquire a lock on a file. Returns true if lock was acquired, false if file is already locked by another agent.
 * Expired locks can be acquired.
 */
export async function acquireLock(
  filePath: string,
  agentId: string,
  taskId: string,
  timeoutMinutes: number = DEFAULT_TIMEOUT_MINUTES
): Promise<boolean> {
  const locks = await atomicRead(FILE_LOCKS_PATH, FileLockSchema);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + timeoutMinutes * 60 * 1000);

  const existingLock = locks.locks[filePath];
  if (existingLock) {
    const expires = new Date(existingLock.expires_at);
    if (expires > now) {
      return false; // Lock still valid
    }
    // Lock expired, can be acquired
  }

  const updated: FileLock = {
    ...locks,
    locks: {
      ...locks.locks,
      [filePath]: {
        locked_by: agentId,
        task_id: taskId,
        locked_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
      },
    },
    updated_at: now.toISOString(),
  };
  await atomicWrite(FILE_LOCKS_PATH, updated);
  return true;
}

/**
 * Release a lock. Only the owning agent can release. No-op if lock doesn't exist or is owned by another agent.
 */
export async function releaseLock(
  filePath: string,
  agentId: string
): Promise<void> {
  const locks = await atomicRead(FILE_LOCKS_PATH, FileLockSchema);
  const lock = locks.locks[filePath];

  if (!lock || lock.locked_by !== agentId) {
    return;
  }

  const updatedLocks = { ...locks.locks };
  delete updatedLocks[filePath];
  await atomicWrite(FILE_LOCKS_PATH, {
    locks: updatedLocks,
    updated_at: new Date().toISOString(),
  });
}
