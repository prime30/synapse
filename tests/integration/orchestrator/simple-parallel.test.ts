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

describe('Simple Parallel Execution', () => {
  let cleanup: () => void;

  beforeEach(async () => {
    resetUuidCounter();
    const env = await setupTestEnvironment();
    cleanup = env.cleanup;
    await initializeCoordination('epic-simple');
  });

  afterEach(() => cleanup());

  it('assigns all independent tasks to wave 0', async () => {
    const t1 = testUuid();
    const t2 = testUuid();
    const t3 = testUuid();

    await writeTask(makeTestTask({ task_id: t1, title: 'Create login component' }));
    await writeTask(makeTestTask({ task_id: t2, title: 'Create signup component' }));
    await writeTask(makeTestTask({ task_id: t3, title: 'Create password reset', estimated_complexity: 2 }));

    await writeDependencyGraph({
      [t1]: { depends_on: [], blocks: [], files: [] },
      [t2]: { depends_on: [], blocks: [], files: [] },
      [t3]: { depends_on: [], blocks: [], files: [] },
    });

    const analysis = await analyzeDependencies();
    expect(analysis.hasCycles).toBe(false);
    expect(analysis.roots).toHaveLength(3);

    const waves = calculateWaves(analysis);
    expect(waves).toHaveLength(1);
    expect(waves[0].waveNumber).toBe(0);
    expect(waves[0].tasks).toHaveLength(3);
    expect(waves[0].tasks).toContain(t1);
    expect(waves[0].tasks).toContain(t2);
    expect(waves[0].tasks).toContain(t3);
    expect(waves[0].fileConflicts).toHaveLength(0);
  });

  it('all 3 tasks can be assigned to different agents', async () => {
    const t1 = testUuid();
    const t2 = testUuid();
    const t3 = testUuid();

    await writeTask(makeTestTask({ task_id: t1 }));
    await writeTask(makeTestTask({ task_id: t2 }));
    await writeTask(makeTestTask({ task_id: t3 }));

    await writeDependencyGraph({
      [t1]: { depends_on: [], blocks: [], files: [] },
      [t2]: { depends_on: [], blocks: [], files: [] },
      [t3]: { depends_on: [], blocks: [], files: [] },
    });

    await writeAgentStatus('agent-1');
    await writeAgentStatus('agent-2');
    await writeAgentStatus('agent-3');
    await writeAgentPool([
      { agent_id: 'agent-1' },
      { agent_id: 'agent-2' },
      { agent_id: 'agent-3' },
    ]);

    const { assignTasks } = await import('../../../lib/orchestrator/assignment');
    const { getIdleAgents } = await import('../../../lib/orchestrator/agent-pool');

    const idle = await getIdleAgents();
    expect(idle).toHaveLength(3);

    const assignments = await assignTasks([t1, t2, t3], idle);
    expect(assignments).toHaveLength(3);

    const agentIds = assignments.map((a) => a.agentId);
    expect(new Set(agentIds).size).toBe(3);
  });
});
