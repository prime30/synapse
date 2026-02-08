import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initializeCoordination } from '../../../lib/coordination/initialize';
import { analyzeDependencies } from '../../../lib/orchestrator/dependency-analysis';
import { calculateWaves } from '../../../lib/orchestrator/wave-calculation';
import {
  setupTestEnvironment,
  testUuid,
  resetUuidCounter,
  makeTestTask,
  writeTask,
  writeDependencyGraph,
} from './helpers';

describe('Wave-Based Execution', () => {
  let cleanup: () => void;

  beforeEach(async () => {
    resetUuidCounter();
    const env = await setupTestEnvironment();
    cleanup = env.cleanup;
    await initializeCoordination('epic-waves');
  });

  afterEach(() => cleanup());

  it('correctly identifies 4 waves for 10-task dependency chain', async () => {
    const ids = Array.from({ length: 10 }, () => testUuid());
    const [t1, t2, t3, t4, t5, t6, t7, t8, t9, t10] = ids;

    // Wave 0: t1, t2 (roots)
    await writeTask(makeTestTask({ task_id: t1, title: 'Create user model', estimated_complexity: 4 }));
    await writeTask(makeTestTask({ task_id: t2, title: 'Create auth service', estimated_complexity: 4 }));
    // Wave 1: t3, t4, t5
    await writeTask(makeTestTask({ task_id: t3, title: 'Implement login', estimated_complexity: 3 }));
    await writeTask(makeTestTask({ task_id: t4, title: 'Implement signup', estimated_complexity: 3 }));
    await writeTask(makeTestTask({ task_id: t5, title: 'Create user repo', estimated_complexity: 2 }));
    // Wave 2: t6, t7, t8
    await writeTask(makeTestTask({ task_id: t6, title: 'Session management', estimated_complexity: 3 }));
    await writeTask(makeTestTask({ task_id: t7, title: 'Password reset', estimated_complexity: 3 }));
    await writeTask(makeTestTask({ task_id: t8, title: 'User profile API', estimated_complexity: 2 }));
    // Wave 3: t9, t10
    await writeTask(makeTestTask({ task_id: t9, title: 'Logout endpoint', estimated_complexity: 2 }));
    await writeTask(makeTestTask({ task_id: t10, title: 'Integration tests', estimated_complexity: 4 }));

    await writeDependencyGraph({
      [t1]: { depends_on: [], blocks: [t3, t4, t5], files: [] },
      [t2]: { depends_on: [], blocks: [t3, t4, t7], files: [] },
      [t3]: { depends_on: [t1, t2], blocks: [t6, t10], files: [] },
      [t4]: { depends_on: [t1, t2], blocks: [t10], files: [] },
      [t5]: { depends_on: [t1], blocks: [t7, t8], files: [] },
      [t6]: { depends_on: [t3], blocks: [t9, t10], files: [] },
      [t7]: { depends_on: [t2, t5], blocks: [], files: [] },
      [t8]: { depends_on: [t5], blocks: [], files: [] },
      [t9]: { depends_on: [t6], blocks: [], files: [] },
      [t10]: { depends_on: [t3, t4, t6], blocks: [], files: [] },
    });

    const analysis = await analyzeDependencies();
    expect(analysis.hasCycles).toBe(false);
    expect(analysis.roots).toContain(t1);
    expect(analysis.roots).toContain(t2);
    expect(analysis.roots).toHaveLength(2);

    const waves = calculateWaves(analysis);
    expect(waves.length).toBeGreaterThanOrEqual(4);

    // Wave 0 should contain only roots
    expect(waves[0].tasks).toContain(t1);
    expect(waves[0].tasks).toContain(t2);

    // No task should appear before its dependencies
    const waveOf = new Map<string, number>();
    for (const w of waves) {
      for (const tid of w.tasks) waveOf.set(tid, w.waveNumber);
    }

    for (const [tid, node] of analysis.tasks) {
      for (const dep of node.dependsOn) {
        const depWave = waveOf.get(dep) ?? -1;
        const taskWave = waveOf.get(tid) ?? -1;
        expect(taskWave).toBeGreaterThan(depWave);
      }
    }
  });

  it('file conflicts push tasks to separate waves', async () => {
    const t1 = testUuid();
    const t2 = testUuid();

    await writeTask(makeTestTask({ task_id: t1, title: 'Task A', files_to_modify: ['src/auth.ts'] }));
    await writeTask(makeTestTask({ task_id: t2, title: 'Task B', files_to_modify: ['src/auth.ts'] }));

    await writeDependencyGraph({
      [t1]: { depends_on: [], blocks: [], files: ['src/auth.ts'] },
      [t2]: { depends_on: [], blocks: [], files: ['src/auth.ts'] },
    });

    const analysis = await analyzeDependencies();
    const waves = calculateWaves(analysis);

    // With file conflict: tasks should be in different waves
    expect(waves.length).toBeGreaterThanOrEqual(2);
    const w0tasks = waves[0].tasks;
    const w1tasks = waves[1].tasks;
    expect(w0tasks).not.toEqual(expect.arrayContaining([t1, t2]));
  });
});
