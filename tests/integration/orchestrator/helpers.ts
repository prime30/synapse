import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import {
  setCoordinationRoot,
  atomicWrite,
  getCoordinationRoot,
} from '../../../lib/coordination/atomic';
import { initializeCoordination } from '../../../lib/coordination/initialize';
import type { Task } from '../../../lib/coordination/schemas';

/**
 * Create isolated temp dir and set as coordination root. Returns cleanup fn.
 */
export async function setupTestEnvironment(): Promise<{
  tempDir: string;
  cleanup: () => void;
}> {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'orch-integration-')
  );
  setCoordinationRoot(tempDir);
  return {
    tempDir,
    cleanup: () => setCoordinationRoot(null),
  };
}

/** Valid UUID generator for test tasks */
let uuidCounter = 0;
export function testUuid(): string {
  uuidCounter++;
  const hex = uuidCounter.toString(16).padStart(12, '0');
  return `550e8400-e29b-41d4-a716-${hex}`;
}

export function resetUuidCounter(): void {
  uuidCounter = 0;
}

/** Create a test task with defaults */
export function makeTestTask(overrides: Partial<Task> & { task_id: string }): Task {
  return {
    requirement_id: 'REQ-TEST',
    title: 'Test task',
    description: '',
    status: 'pending',
    assigned_to: null,
    dependencies: [],
    blocks: [],
    files_to_modify: [],
    estimated_complexity: 3,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    completed_at: null,
    ...overrides,
  };
}

/** Write task file to coordination dir */
export async function writeTask(task: Task): Promise<void> {
  await atomicWrite(`tasks/${task.task_id}.json`, task);
}

/** Write dependency graph */
export async function writeDependencyGraph(
  tasks: Record<
    string,
    { depends_on: string[]; blocks: string[]; files: string[] }
  >
): Promise<void> {
  await atomicWrite('coordination/dependency-graph.json', {
    tasks,
    updated_at: new Date().toISOString(),
  });
}

/** Write agent status file */
export async function writeAgentStatus(
  agentId: string,
  overrides: Record<string, unknown> = {}
): Promise<void> {
  await atomicWrite(`status/agents/${agentId}.json`, {
    agent_id: agentId,
    status: 'idle',
    current_task_id: null,
    last_heartbeat: new Date().toISOString(),
    capabilities: ['frontend', 'backend'],
    error_message: null,
    started_at: new Date().toISOString(),
    ...overrides,
  });
}

/** Write agent pool */
export async function writeAgentPool(
  agents: Array<{
    agent_id: string;
    capabilities?: string[];
    status?: string;
  }>
): Promise<void> {
  await atomicWrite('coordination/agent-pool.json', {
    agents: agents.map((a) => ({
      agent_id: a.agent_id,
      capabilities: a.capabilities ?? ['frontend', 'backend'],
      max_concurrent_tasks: 1,
      status: a.status ?? 'available',
    })),
    updated_at: new Date().toISOString(),
  });
}

/** Simulate task completion by writing updated status */
export async function completeTask(taskId: string): Promise<void> {
  const { atomicRead } = await import('../../../lib/coordination/atomic');
  const { TaskSchema } = await import('../../../lib/coordination/schemas');
  const task = await atomicRead(`tasks/${taskId}.json`, TaskSchema);
  await atomicWrite(`tasks/${taskId}.json`, {
    ...task,
    status: 'completed',
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

/** Simulate task failure */
export async function failTask(taskId: string): Promise<void> {
  const { atomicRead } = await import('../../../lib/coordination/atomic');
  const { TaskSchema } = await import('../../../lib/coordination/schemas');
  const task = await atomicRead(`tasks/${taskId}.json`, TaskSchema);
  await atomicWrite(`tasks/${taskId}.json`, {
    ...task,
    status: 'failed',
    updated_at: new Date().toISOString(),
  });
}
