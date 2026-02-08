import { promises as fs } from 'fs';
import path from 'path';
import { atomicWrite, getCoordinationRoot } from './atomic';

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Initialize the coordination directory structure and default state files.
 */
export async function initializeCoordination(epicId: string): Promise<void> {
  const base = getCoordinationRoot();
  await ensureDir(path.join(base, 'tasks', 'assignments'));
  await ensureDir(path.join(base, 'status', 'agents'));
  await ensureDir(path.join(base, 'coordination'));

  const now = new Date().toISOString();

  await atomicWrite('coordination/dependency-graph.json', {
    tasks: {},
    updated_at: now,
  });

  await atomicWrite('coordination/agent-pool.json', {
    agents: [],
    updated_at: now,
  });

  await atomicWrite('coordination/file_locks.json', {
    locks: {},
    updated_at: now,
  });

  await atomicWrite('status/epic_state.json', {
    epic_id: epicId,
    status: 'planning',
    total_tasks: 0,
    completed_tasks: 0,
    failed_tasks: 0,
    blocked_tasks: 0,
    active_agents: [],
    started_at: now,
    updated_at: now,
    completed_at: null,
  });

  const gitignorePath = path.join(base, '.gitignore');
  await fs.writeFile(gitignorePath, '*\n!.gitignore\n', 'utf-8');
}
