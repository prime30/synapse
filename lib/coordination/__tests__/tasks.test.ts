import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import { setCoordinationRoot } from '../atomic';
import { atomicWrite } from '../atomic';
import { initializeCoordination } from '../initialize';
import { getAvailableTasks } from '../tasks';

describe('getAvailableTasks', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'coordination-tasks-'));
    setCoordinationRoot(tempDir);
    await initializeCoordination('epic-1');
  });

  afterEach(() => {
    setCoordinationRoot(null);
  });

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

  it('returns empty when no tasks', async () => {
    const tasks = await getAvailableTasks();
    expect(tasks).toEqual([]);
  });

  const T1 = '550e8400-e29b-41d4-a716-446655440001';
  const T2 = '550e8400-e29b-41d4-a716-446655440002';

  it('returns pending tasks with no dependencies', async () => {
    const task = makeTask({ task_id: T1, status: 'pending' });
    await atomicWrite(`tasks/${T1}.json`, task);
    await atomicWrite('coordination/dependency-graph.json', {
      tasks: { [T1]: { depends_on: [], blocks: [], files: [] } },
      updated_at: new Date().toISOString(),
    });

    const tasks = await getAvailableTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].task_id).toBe(T1);
  });

  it('excludes tasks with incomplete dependencies', async () => {
    await atomicWrite(`tasks/${T1}.json`, makeTask({ task_id: T1, status: 'completed' }));
    await atomicWrite(`tasks/${T2}.json`, makeTask({ task_id: T2, status: 'pending' }));
    await atomicWrite('coordination/dependency-graph.json', {
      tasks: {
        [T1]: { depends_on: [], blocks: [T2], files: [] },
        [T2]: { depends_on: [T1], blocks: [], files: [] },
      },
      updated_at: new Date().toISOString(),
    });

    const tasks = await getAvailableTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].task_id).toBe(T2);
  });

  it('excludes tasks when dependency not completed', async () => {
    await atomicWrite(`tasks/${T1}.json`, makeTask({ task_id: T1, status: 'in_progress' }));
    await atomicWrite(`tasks/${T2}.json`, makeTask({ task_id: T2, status: 'pending' }));
    await atomicWrite('coordination/dependency-graph.json', {
      tasks: {
        [T1]: { depends_on: [], blocks: [T2], files: [] },
        [T2]: { depends_on: [T1], blocks: [], files: [] },
      },
      updated_at: new Date().toISOString(),
    });

    const tasks = await getAvailableTasks();
    expect(tasks).toHaveLength(0);
  });
});
