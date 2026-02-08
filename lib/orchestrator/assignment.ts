import path from 'path';
import { promises as fs } from 'fs';
import { atomicRead, atomicWrite, getCoordinationRoot } from '../coordination/atomic';
import { TaskSchema, AgentStatusSchema } from '../coordination/schemas';
import { acquireLock, releaseLock } from '../coordination/locking';
import { assignTask } from './agent-pool';
import type { Task } from '../coordination/schemas';
import type { Assignment } from './types';

const TASKS_DIR = 'tasks';

/**
 * Find best agent for a task: prefer capability match, then load balance.
 */
function findBestAgent(
  task: Task,
  idleAgentIds: string[],
  agentCapabilities: Map<string, string[]>
): string | null {
  if (idleAgentIds.length === 0) return null;

  const taskCapHint = inferTaskCapability(task);
  const scored = idleAgentIds.map((id) => {
    const caps = agentCapabilities.get(id) ?? [];
    const hasMatch = taskCapHint && caps.includes(taskCapHint) ? 2 : 0;
    return { id, score: hasMatch };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.id ?? null;
}

function inferTaskCapability(task: Task): string | null {
  const title = (task.title + task.description).toLowerCase();
  if (
    title.includes('frontend') ||
    title.includes('ui') ||
    title.includes('component') ||
    title.includes('react')
  )
    return 'frontend';
  if (
    title.includes('backend') ||
    title.includes('api') ||
    title.includes('route') ||
    title.includes('service')
  )
    return 'backend';
  if (
    title.includes('infrastructure') ||
    title.includes('deploy') ||
    title.includes('ci')
  )
    return 'infrastructure';
  return null;
}

/**
 * Acquire locks for all files required by task. Returns true if all acquired.
 * Releases any acquired locks on partial failure.
 */
async function acquireFileLocks(
  files: string[],
  agentId: string,
  taskId: string
): Promise<boolean> {
  const acquired: string[] = [];
  for (const file of files) {
    const ok = await acquireLock(file, agentId, taskId);
    if (!ok) {
      for (const f of acquired) await releaseLock(f, agentId);
      return false;
    }
    acquired.push(file);
  }
  return true;
}

/**
 * Mark task as blocked with reason.
 */
async function markTaskBlocked(
  taskId: string,
  reason: string
): Promise<void> {
  const taskPath = `${TASKS_DIR}/${taskId}.json`;
  const task = await atomicRead(taskPath, TaskSchema);
  await atomicWrite(taskPath, {
    ...task,
    status: 'blocked',
    updated_at: new Date().toISOString(),
  });
}

/**
 * Load agent capabilities from status/agents.
 */
async function loadAgentCapabilities(): Promise<Map<string, string[]>> {
  const base = getCoordinationRoot();
  const agentsPath = path.join(base, 'status', 'agents');

  let files: string[];
  try {
    files = await fs.readdir(agentsPath);
  } catch {
    return new Map();
  }

  const result = new Map<string, string[]>();
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const status = await atomicRead(
        path.join('status', 'agents', file),
        AgentStatusSchema
      );
      result.set(status.agent_id, status.capabilities);
    } catch {
      continue;
    }
  }
  return result;
}

/**
 * Assign tasks to idle agents. Uses capability matching, load balancing, complexity order.
 * Acquires file locks before assignment.
 */
export async function assignTasks(
  taskIds: string[],
  idleAgentIds: string[]
): Promise<Assignment[]> {
  const assignments: Assignment[] = [];
  const agentCaps = await loadAgentCapabilities();

  const tasks: Task[] = [];
  for (const taskId of taskIds) {
    try {
      const task = await atomicRead(
        `${TASKS_DIR}/${taskId}.json`,
        TaskSchema
      );
      tasks.push(task);
    } catch {
      continue;
    }
  }

  tasks.sort((a, b) => (b.estimated_complexity ?? 0) - (a.estimated_complexity ?? 0));

  let availableAgents = [...idleAgentIds];

  for (const task of tasks) {
    if (availableAgents.length === 0) break;
    if (task.status !== 'pending') continue;

    const agentId = findBestAgent(task, availableAgents, agentCaps);
    if (!agentId) continue;

    const files = task.files_to_modify ?? [];
    const locksOk =
      files.length === 0 || (await acquireFileLocks(files, agentId, task.task_id));

    if (!locksOk) {
      await markTaskBlocked(task.task_id, 'file_locks_unavailable');
      continue;
    }

    await assignTask(agentId, task.task_id);
    assignments.push({
      agentId,
      taskId: task.task_id,
      reason: 'capability_match',
    });
    availableAgents = availableAgents.filter((a) => a !== agentId);
  }

  return assignments;
}
