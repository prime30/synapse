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
  writeAgentStatus,
  writeAgentPool,
} from './helpers';

describe('Performance and Time Savings', () => {
  let cleanup: () => void;

  beforeEach(async () => {
    resetUuidCounter();
    const env = await setupTestEnvironment();
    cleanup = env.cleanup;
    await initializeCoordination('epic-perf');
  });

  afterEach(() => cleanup());

  it('handles 20 tasks across 5 waves without errors', async () => {
    const ids = Array.from({ length: 20 }, () => testUuid());

    // Wave 0: 4 roots
    for (let i = 0; i < 4; i++) {
      await writeTask(
        makeTestTask({
          task_id: ids[i],
          title: `Root task ${i}`,
          estimated_complexity: 3,
        })
      );
    }
    // Wave 1: 4 tasks depend on wave 0
    for (let i = 4; i < 8; i++) {
      await writeTask(
        makeTestTask({
          task_id: ids[i],
          title: `Wave 1 task ${i}`,
          estimated_complexity: 3,
        })
      );
    }
    // Wave 2: 4 tasks depend on wave 1
    for (let i = 8; i < 12; i++) {
      await writeTask(
        makeTestTask({
          task_id: ids[i],
          title: `Wave 2 task ${i}`,
          estimated_complexity: 2,
        })
      );
    }
    // Wave 3: 4 tasks depend on wave 2
    for (let i = 12; i < 16; i++) {
      await writeTask(
        makeTestTask({
          task_id: ids[i],
          title: `Wave 3 task ${i}`,
          estimated_complexity: 2,
        })
      );
    }
    // Wave 4: 4 tasks depend on wave 3
    for (let i = 16; i < 20; i++) {
      await writeTask(
        makeTestTask({
          task_id: ids[i],
          title: `Wave 4 task ${i}`,
          estimated_complexity: 1,
        })
      );
    }

    const depGraph: Record<string, { depends_on: string[]; blocks: string[]; files: string[] }> = {};
    for (let i = 0; i < 20; i++) {
      const deps = i < 4 ? [] : [ids[i - 4]];
      const blocks = i + 4 < 20 ? [ids[i + 4]] : [];
      depGraph[ids[i]] = { depends_on: deps, blocks, files: [] };
    }
    await writeDependencyGraph(depGraph);

    const start = Date.now();
    const analysis = await analyzeDependencies();
    const waves = calculateWaves(analysis);
    const elapsed = Date.now() - start;

    expect(analysis.hasCycles).toBe(false);
    expect(analysis.tasks.size).toBe(20);
    expect(waves.length).toBeGreaterThanOrEqual(5);

    // Analysis + wave calculation should take <500ms
    expect(elapsed).toBeLessThan(500);
  });

  it('measures speedup: parallel waves vs sequential', async () => {
    const t1 = testUuid();
    const t2 = testUuid();
    const t3 = testUuid();

    await writeTask(makeTestTask({ task_id: t1, estimated_complexity: 5 }));
    await writeTask(makeTestTask({ task_id: t2, estimated_complexity: 4 }));
    await writeTask(makeTestTask({ task_id: t3, estimated_complexity: 3 }));

    await writeDependencyGraph({
      [t1]: { depends_on: [], blocks: [], files: [] },
      [t2]: { depends_on: [], blocks: [], files: [] },
      [t3]: { depends_on: [], blocks: [], files: [] },
    });

    const analysis = await analyzeDependencies();
    const waves = calculateWaves(analysis);

    // Sequential: sum of complexities = 12
    const sequential = 5 + 4 + 3;
    // Parallel: max complexity in wave = 5
    const parallel = waves[0].estimatedDuration;
    const speedup = sequential / parallel;

    expect(speedup).toBeGreaterThan(1.5);
    expect(waves).toHaveLength(1);
  });

  it('15 agents can be provisioned without errors', async () => {
    const agents = Array.from({ length: 15 }, (_, i) => ({
      agent_id: `agent-${i + 1}`,
      capabilities: i < 5 ? ['frontend'] : i < 10 ? ['backend'] : ['infrastructure'],
    }));

    for (const a of agents) {
      await writeAgentStatus(a.agent_id, { capabilities: a.capabilities });
    }
    await writeAgentPool(agents);

    const { getIdleAgents } = await import(
      '../../../lib/orchestrator/agent-pool'
    );
    const idle = await getIdleAgents();
    expect(idle).toHaveLength(15);
  });
});
