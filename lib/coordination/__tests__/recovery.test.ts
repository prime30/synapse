import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import { setCoordinationRoot } from '../atomic';
import { atomicWrite, atomicRead } from '../atomic';
import { initializeCoordination } from '../initialize';
import { recoverCoordinationState } from '../recovery';
import { FileLockSchema, TaskSchema, TaskAssignmentSchema } from '../schemas';

describe('recovery', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'coordination-rec-'));
    setCoordinationRoot(tempDir);
  });

  afterEach(() => {
    setCoordinationRoot(null);
  });

  it('releases locks from stale agents', async () => {
    await initializeCoordination('epic-1');
    await atomicWrite('coordination/file_locks.json', {
      locks: {
        'src/foo.ts': {
          locked_by: 'stale-agent',
          task_id: 'task-1',
          locked_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 60000).toISOString(),
        },
      },
      updated_at: new Date().toISOString(),
    });

    await atomicWrite('status/agents/stale-agent.json', {
      agent_id: 'stale-agent',
      status: 'stale',
      current_task_id: 'task-1',
      last_heartbeat: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      capabilities: [],
      error_message: null,
      started_at: new Date().toISOString(),
    });

    await recoverCoordinationState();

    const locks = await atomicRead('coordination/file_locks.json', FileLockSchema);
    expect(locks.locks['src/foo.ts']).toBeUndefined();
  });

  it('unassigns tasks from stale agents', async () => {
    await initializeCoordination('epic-1');
    const taskId = '550e8400-e29b-41d4-a716-446655440000';
    await atomicWrite(`tasks/${taskId}.json`, {
      task_id: taskId,
      requirement_id: 'REQ-1',
      title: 'Test',
      description: 'Test task',
      status: 'in_progress',
      assigned_to: 'stale-agent',
      dependencies: [],
      blocks: [],
      files_to_modify: [],
      estimated_complexity: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: null,
    });
    await atomicWrite('tasks/assignments/stale-agent.json', {
      agent_id: 'stale-agent',
      task_id: taskId,
      assigned_at: new Date().toISOString(),
      status: 'working',
    });
    await atomicWrite('status/agents/stale-agent.json', {
      agent_id: 'stale-agent',
      status: 'stale',
      current_task_id: taskId,
      last_heartbeat: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      capabilities: [],
      error_message: null,
      started_at: new Date().toISOString(),
    });

    await recoverCoordinationState();

    const task = await atomicRead(`tasks/${taskId}.json`, TaskSchema);
    expect(task.status).toBe('pending');
    expect(task.assigned_to).toBeNull();

    const assignment = await atomicRead(
      'tasks/assignments/stale-agent.json',
      TaskAssignmentSchema
    );
    expect(assignment.task_id).toBeNull();
    expect(assignment.status).toBe('idle');
  });
});
