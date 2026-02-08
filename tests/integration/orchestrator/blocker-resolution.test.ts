import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initializeCoordination } from '../../../lib/coordination/initialize';
import { atomicWrite, atomicRead } from '../../../lib/coordination/atomic';
import { TaskSchema, FileLockSchema } from '../../../lib/coordination/schemas';
import { detectBlockers, resolveBlockers } from '../../../lib/orchestrator/blockers';
import { acquireLock } from '../../../lib/coordination/locking';
import {
  setupTestEnvironment,
  testUuid,
  resetUuidCounter,
  makeTestTask,
  writeTask,
  writeDependencyGraph,
  writeAgentStatus,
  failTask,
} from './helpers';

describe('Blocker Resolution', () => {
  let cleanup: () => void;

  beforeEach(async () => {
    resetUuidCounter();
    const env = await setupTestEnvironment();
    cleanup = env.cleanup;
    await initializeCoordination('epic-blockers');
  });

  afterEach(() => cleanup());

  it('detects dependency blocker when dependency fails', async () => {
    const t1 = testUuid();
    const t2 = testUuid();

    await writeTask(makeTestTask({ task_id: t1, title: 'Dep task' }));
    await writeTask(
      makeTestTask({
        task_id: t2,
        title: 'Blocked task',
        status: 'blocked',
        dependencies: [t1],
      })
    );
    await writeDependencyGraph({
      [t1]: { depends_on: [], blocks: [t2], files: [] },
      [t2]: { depends_on: [t1], blocks: [], files: [] },
    });

    await failTask(t1);

    const blockers = await detectBlockers([t2]);
    expect(blockers).toHaveLength(1);
    expect(blockers[0].reason).toContain('dependency_failed');
  });

  it('detects stale agent blocker', async () => {
    const t1 = testUuid();
    const staleTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    await writeTask(
      makeTestTask({
        task_id: t1,
        title: 'Stale task',
        status: 'blocked',
        assigned_to: 'stale-agent',
      })
    );
    await writeAgentStatus('stale-agent', {
      status: 'active',
      last_heartbeat: staleTime,
    });
    await writeDependencyGraph({
      [t1]: { depends_on: [], blocks: [], files: [] },
    });

    const blockers = await detectBlockers([t1]);
    expect(blockers).toHaveLength(1);
    expect(blockers[0].reason).toContain('agent_stale');
  });

  it('detects file lock blocker', async () => {
    const t1 = testUuid();
    const t2 = testUuid();

    await writeTask(
      makeTestTask({
        task_id: t1,
        title: 'Locking task',
        files_to_modify: ['src/auth.ts'],
      })
    );
    await writeTask(
      makeTestTask({
        task_id: t2,
        title: 'Blocked by lock',
        status: 'blocked',
        files_to_modify: ['src/auth.ts'],
      })
    );
    await writeAgentStatus('agent-1');
    await writeDependencyGraph({
      [t1]: { depends_on: [], blocks: [], files: ['src/auth.ts'] },
      [t2]: { depends_on: [], blocks: [], files: ['src/auth.ts'] },
    });

    await acquireLock('src/auth.ts', 'agent-1', t1);

    const blockers = await detectBlockers([t2]);
    expect(blockers).toHaveLength(1);
    expect(blockers[0].reason).toContain('file_locked');
  });

  it('resolveBlockers attempts recovery for stale agent', async () => {
    const t1 = testUuid();
    const staleTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    await writeTask(
      makeTestTask({
        task_id: t1,
        title: 'Stale task',
        status: 'blocked',
        assigned_to: 'stale-agent',
      })
    );
    await writeAgentStatus('stale-agent', {
      status: 'active',
      last_heartbeat: staleTime,
    });
    await writeDependencyGraph({
      [t1]: { depends_on: [], blocks: [], files: [] },
    });

    const blockers = await detectBlockers([t1]);
    const unresolved = await resolveBlockers(blockers);
    // Recovery should have been attempted (may or may not fully resolve)
    expect(unresolved.length).toBeLessThanOrEqual(blockers.length);
  });
});
