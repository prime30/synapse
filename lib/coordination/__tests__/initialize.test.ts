import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { setCoordinationRoot } from '../atomic';
import { initializeCoordination } from '../initialize';
import {
  atomicRead,
  DependencyGraphSchema,
  AgentPoolSchema,
  FileLockSchema,
  EpicStateSchema,
} from '../index';

describe('initializeCoordination', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'coordination-init-'));
    setCoordinationRoot(tempDir);
  });

  afterEach(() => {
    setCoordinationRoot(null);
  });

  it('creates all required directories', async () => {
    await initializeCoordination('epic-1');
    const dirs = [
      'tasks',
      'tasks/assignments',
      'status',
      'status/agents',
      'coordination',
    ];
    for (const dir of dirs) {
      const fullPath = path.join(tempDir, dir);
      const stat = await fs.stat(fullPath);
      expect(stat.isDirectory()).toBe(true);
    }
  });

  it('creates .gitignore excluding coordination files', async () => {
    await initializeCoordination('epic-1');
    const gitignorePath = path.join(tempDir, '.gitignore');
    const content = await fs.readFile(gitignorePath, 'utf-8');
    expect(content).toContain('*');
    expect(content).toContain('!.gitignore');
  });

  it('initializes coordination files with valid state', async () => {
    await initializeCoordination('epic-1');

    const depGraph = await atomicRead(
      'coordination/dependency-graph.json',
      DependencyGraphSchema
    );
    expect(depGraph.tasks).toEqual({});
    expect(depGraph.updated_at).toBeDefined();

    const agentPool = await atomicRead(
      'coordination/agent-pool.json',
      AgentPoolSchema
    );
    expect(agentPool.agents).toEqual([]);

    const fileLocks = await atomicRead(
      'coordination/file_locks.json',
      FileLockSchema
    );
    expect(fileLocks.locks).toEqual({});

    const epicState = await atomicRead(
      'status/epic_state.json',
      EpicStateSchema
    );
    expect(epicState.epic_id).toBe('epic-1');
    expect(epicState.status).toBe('planning');
    expect(epicState.total_tasks).toBe(0);
    expect(epicState.completed_tasks).toBe(0);
  });
});
