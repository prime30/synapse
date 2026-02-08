import { promises as fs } from 'fs';
import path from 'path';
import {
  atomicRead,
  atomicWrite,
  getCoordinationRoot,
} from '../coordination/atomic';
import {
  AgentStatusSchema,
  TaskAssignmentSchema,
  TaskSchema,
  AgentPoolSchema,
} from '../coordination/schemas';
import { detectStaleAgents as detectStale } from '../coordination/heartbeat';
import { recoverCoordinationState } from '../coordination/recovery';
import type { AgentState } from './types';

const STATUS_AGENTS_DIR = 'status/agents';
const ASSIGNMENTS_DIR = 'tasks/assignments';
const TASKS_DIR = 'tasks';
const AGENT_POOL_PATH = 'coordination/agent-pool.json';

/**
 * Load agent state from status/agents and assignments.
 */
async function loadAgentStates(): Promise<Map<string, AgentState>> {
  const base = getCoordinationRoot();
  const agentsPath = path.join(base, STATUS_AGENTS_DIR);

  let files: string[];
  try {
    files = await fs.readdir(agentsPath);
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === 'ENOENT') return new Map();
    throw err;
  }

  const result = new Map<string, AgentState>();
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const relativePath = path.join(STATUS_AGENTS_DIR, file);
    try {
      const status = await atomicRead(relativePath, AgentStatusSchema);
      const assignmentPath = path.join(ASSIGNMENTS_DIR, `${status.agent_id}.json`);
      let taskId: string | null = null;
      const tasksCompleted = 0;
      const tasksFailed = 0;
      try {
        const assignment = await atomicRead(assignmentPath, TaskAssignmentSchema);
        taskId = assignment.task_id;
      } catch {
        // No assignment
      }

      const poolStatus = status.status;
      const mapStatus: AgentState['status'] =
        poolStatus === 'active' || poolStatus === 'idle'
          ? taskId
            ? 'busy'
            : 'idle'
          : poolStatus === 'stale'
            ? 'stale'
            : poolStatus === 'error'
              ? 'blocked'
              : 'idle';

      result.set(status.agent_id, {
        agentId: status.agent_id,
        status: mapStatus,
        currentTask: taskId,
        capabilities: status.capabilities,
        lastHeartbeat: new Date(status.last_heartbeat),
        tasksCompleted,
        tasksFailed,
      });
    } catch {
      continue;
    }
  }
  return result;
}

/**
 * Get agent IDs that are idle and ready for work.
 */
export async function getIdleAgents(): Promise<string[]> {
  const states = await loadAgentStates();
  const idle: string[] = [];
  for (const [id, state] of states) {
    if (state.status === 'idle') idle.push(id);
  }
  return idle;
}

/**
 * Assign a task to an agent. Updates assignment file and task status.
 */
export async function assignTask(
  agentId: string,
  taskId: string
): Promise<void> {
  const now = new Date().toISOString();
  await atomicWrite(path.join(ASSIGNMENTS_DIR, `${agentId}.json`), {
    agent_id: agentId,
    task_id: taskId,
    assigned_at: now,
    status: 'working',
  });

  const taskPath = path.join(TASKS_DIR, `${taskId}.json`);
  const task = await atomicRead(taskPath, TaskSchema);
  await atomicWrite(taskPath, {
    ...task,
    status: 'assigned',
    assigned_to: agentId,
    updated_at: now,
  });
}

/**
 * Release agent from current task. Clears assignment and sets task back to pending if needed.
 */
export async function releaseAgent(agentId: string): Promise<void> {
  const assignmentPath = path.join(ASSIGNMENTS_DIR, `${agentId}.json`);
  let taskId: string | null = null;
  try {
    const assignment = await atomicRead(assignmentPath, TaskAssignmentSchema);
    taskId = assignment.task_id;
  } catch {
    return;
  }

  if (taskId) {
    const taskPath = path.join(TASKS_DIR, `${taskId}.json`);
    try {
      const task = await atomicRead(taskPath, TaskSchema);
      await atomicWrite(taskPath, {
        ...task,
        status: 'pending',
        assigned_to: null,
        updated_at: new Date().toISOString(),
      });
    } catch {
      // Task may not exist
    }
  }

  await atomicWrite(assignmentPath, {
    agent_id: agentId,
    task_id: null,
    assigned_at: null,
    status: 'idle',
  });
}

/**
 * Detect stale agents (heartbeat > 5 min). Returns their IDs.
 */
export async function detectStaleAgents(): Promise<string[]> {
  return detectStale(5);
}

/**
 * Recover stale agent: release locks, unassign tasks, mark idle.
 */
export async function recoverStaleAgent(_agentId: string): Promise<void> {
  await recoverCoordinationState();
}
