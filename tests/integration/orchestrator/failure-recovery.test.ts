import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { initializeCoordination } from '../../../lib/coordination/initialize';
import {
  atomicWrite,
  atomicRead,
  getCoordinationRoot,
} from '../../../lib/coordination/atomic';
import {
  FileLockSchema,
  TaskSchema,
  AgentStatusSchema,
} from '../../../lib/coordination/schemas';
import { recoverCoordinationState } from '../../../lib/coordination/recovery';
import { validateCoordinationState } from '../../../lib/coordination/validation';
import {
  setupTestEnvironment,
  testUuid,
  resetUuidCounter,
  makeTestTask,
  writeTask,
  writeDependencyGraph,
  writeAgentStatus,
} from './helpers';

describe('Failure Recovery', () => {
  let cleanup: () => void;

  beforeEach(async () => {
    resetUuidCounter();
    const env = await setupTestEnvironment();
    cleanup = env.cleanup;
    await initializeCoordination('epic-recovery');
  });

  afterEach(() => cleanup());

  it('recovers from stale agent: releases locks, unassigns task', async () => {
    const t1 = testUuid();
    const staleTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    await writeTask(
      makeTestTask({
        task_id: t1,
        title: 'Stale agent task',
        status: 'in_progress',
        assigned_to: 'crash-agent',
      })
    );
    await atomicWrite('tasks/assignments/crash-agent.json', {
      agent_id: 'crash-agent',
      task_id: t1,
      assigned_at: staleTime,
      status: 'working',
    });
    await writeAgentStatus('crash-agent', {
      status: 'active',
      current_task_id: t1,
      last_heartbeat: staleTime,
    });
    await atomicWrite('coordination/file_locks.json', {
      locks: {
        'src/module.ts': {
          locked_by: 'crash-agent',
          task_id: t1,
          locked_at: staleTime,
          expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        },
      },
      updated_at: staleTime,
    });
    await writeDependencyGraph({
      [t1]: { depends_on: [], blocks: [], files: ['src/module.ts'] },
    });

    await recoverCoordinationState();

    const locks = await atomicRead(
      'coordination/file_locks.json',
      FileLockSchema
    );
    expect(locks.locks['src/module.ts']).toBeUndefined();

    const task = await atomicRead(`tasks/${t1}.json`, TaskSchema);
    expect(task.status).toBe('pending');
    expect(task.assigned_to).toBeNull();
  });

  it('recovers from coordination file corruption', async () => {
    const base = getCoordinationRoot();
    const lockPath = path.join(
      base,
      'coordination',
      'file_locks.json'
    );

    // Corrupt the file
    await fs.writeFile(lockPath, '{ invalid json !!!', 'utf-8');

    // Validation should detect corruption
    const result = await validateCoordinationState();
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('file_locks'))).toBe(true);

    // Recreate with empty state
    await atomicWrite('coordination/file_locks.json', {
      locks: {},
      updated_at: new Date().toISOString(),
    });

    const result2 = await validateCoordinationState();
    expect(result2.valid).toBe(true);
  });
});
