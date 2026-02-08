import { atomicRead, atomicWrite } from '../coordination/atomic';
import { TaskSchema } from '../coordination/schemas';
import { getIdleAgents, detectStaleAgents, recoverStaleAgent } from './agent-pool';
import type { ExecutionWave } from './types';
import { assignTasks } from './assignment';
const TASKS_DIR = 'tasks';
const POLL_INTERVAL_MS = 30_000;
const WAVE_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getTaskStatus(taskId: string): Promise<string> {
  try {
    const task = await atomicRead(
      `${TASKS_DIR}/${taskId}.json`,
      TaskSchema
    );
    return task.status;
  } catch {
    return 'failed';
  }
}

/**
 * Launch a wave: assign tasks to idle agents. assignTasks handles assignment files and task updates.
 */
export async function launchWave(wave: ExecutionWave): Promise<void> {
  const idleAgents = await getIdleAgents();
  await assignTasks(wave.tasks, idleAgents);
}

/**
 * Wait for wave to complete. Polls every 30s, handles stale agents, returns when all tasks done or failed.
 */
export async function waitForWaveCompletion(
  wave: ExecutionWave
): Promise<{ completed: string[]; failed: string[] }> {
  const start = Date.now();
  const completed: string[] = [];
  const failed: string[] = [];

  while (true) {
    const statuses = await Promise.all(
      wave.tasks.map(async (taskId) => ({
        taskId,
        status: await getTaskStatus(taskId),
      }))
    );

    for (const { taskId, status } of statuses) {
      if (status === 'completed' && !completed.includes(taskId)) {
        completed.push(taskId);
      } else if (status === 'failed' && !failed.includes(taskId)) {
        failed.push(taskId);
      }
    }

    const done = completed.length + failed.length;
    if (done === wave.tasks.length) {
      return { completed, failed };
    }

    if (Date.now() - start > WAVE_TIMEOUT_MS) {
      for (const { taskId, status } of statuses) {
        if (
          (status === 'in_progress' || status === 'assigned') &&
          !completed.includes(taskId) &&
          !failed.includes(taskId)
        ) {
          const task = await atomicRead(
            `${TASKS_DIR}/${taskId}.json`,
            TaskSchema
          );
          await atomicWrite(`${TASKS_DIR}/${taskId}.json`, {
            ...task,
            status: 'failed',
            updated_at: new Date().toISOString(),
          });
          failed.push(taskId);
        }
      }
      return { completed, failed };
    }

    const stale = await detectStaleAgents();
    for (const agentId of stale) {
      await recoverStaleAgent(agentId);
    }

    await sleep(POLL_INTERVAL_MS);
  }
}
