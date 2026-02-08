import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import { setCoordinationRoot } from '../../coordination/atomic';
import { initializeCoordination } from '../../coordination/initialize';
import { atomicWrite } from '../../coordination/atomic';
import { analyzeDependencies } from '../dependency-analysis';
import { calculateWaves } from '../wave-calculation';
import { TaskSchema } from '../../coordination/schemas';

const makeTask = (overrides: Record<string, unknown>) => ({
  task_id: '550e8400-e29b-41d4-a716-446655440000',
  requirement_id: 'REQ-1',
  title: 'Task',
  description: '',
  status: 'pending',
  assigned_to: null,
  dependencies: [],
  blocks: [],
  files_to_modify: [],
  estimated_complexity: 1,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  completed_at: null,
  ...overrides,
});

describe('dependency-analysis', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'orch-dep-'));
    setCoordinationRoot(tempDir);
    await initializeCoordination('epic-1');
  });

  afterEach(() => {
    setCoordinationRoot(null);
  });

  const T1 = '550e8400-e29b-41d4-a716-446655440001';
  const T2 = '550e8400-e29b-41d4-a716-446655440002';
  const T3 = '550e8400-e29b-41d4-a716-446655440003';

  it('returns roots and leaves for linear graph', async () => {
    await atomicWrite(`tasks/${T1}.json`, makeTask({ task_id: T1 }));
    await atomicWrite(`tasks/${T2}.json`, makeTask({ task_id: T2 }));
    await atomicWrite(`tasks/${T3}.json`, makeTask({ task_id: T3 }));
    await atomicWrite('coordination/dependency-graph.json', {
      tasks: {
        [T1]: { depends_on: [], blocks: [T2], files: [] },
        [T2]: { depends_on: [T1], blocks: [T3], files: [] },
        [T3]: { depends_on: [T2], blocks: [], files: [] },
      },
      updated_at: new Date().toISOString(),
    });

    const analysis = await analyzeDependencies();
    expect(analysis.hasCycles).toBe(false);
    expect(analysis.roots).toContain(T1);
    expect(analysis.leaves).toContain(T3);
    expect(analysis.tasks.get(T2)?.depth).toBe(1);
  });

  it('detects cycles', async () => {
    await atomicWrite(`tasks/${T1}.json`, makeTask({ task_id: T1 }));
    await atomicWrite(`tasks/${T2}.json`, makeTask({ task_id: T2 }));
    await atomicWrite('coordination/dependency-graph.json', {
      tasks: {
        [T1]: { depends_on: [T2], blocks: [], files: [] },
        [T2]: { depends_on: [T1], blocks: [], files: [] },
      },
      updated_at: new Date().toISOString(),
    });

    const analysis = await analyzeDependencies();
    expect(analysis.hasCycles).toBe(true);
    expect(analysis.cycles.length).toBeGreaterThan(0);
  });
});

describe('wave-calculation', () => {
  it('wave 0 contains roots', () => {
    const analysis = {
      tasks: new Map([
        ['a', { taskId: 'a', dependsOn: [], blocks: ['b'], depth: 0, files: [] }],
        ['b', { taskId: 'b', dependsOn: ['a'], blocks: [], depth: 1, files: [] }],
      ]),
      hasCycles: false,
      cycles: [],
      roots: ['a'],
      leaves: ['b'],
    };
    const waves = calculateWaves(analysis);
    expect(waves[0].tasks).toContain('a');
    expect(waves[1].tasks).toContain('b');
  });
});
