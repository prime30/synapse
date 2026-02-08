import { atomicRead } from '../coordination/atomic';
import {
  EpicStateSchema,
  TaskSchema,
  AgentStatusSchema,
} from '../coordination/schemas';
import { promises as fs } from 'fs';
import path from 'path';
import { getCoordinationRoot } from '../coordination/atomic';
import { detectBlockers } from './blockers';
import type { DashboardState, BlockerInfo, AgentDashboardInfo } from './types';

const STATUS_AGENTS_DIR = 'status/agents';
const TASKS_DIR = 'tasks';

/**
 * Build dashboard state from coordination files.
 */
export async function buildDashboardState(
  epicId: string,
  currentWaveNum: number,
  totalWaves: number,
  waveTaskIds: string[],
  nextWaveTaskIds: string[]
): Promise<DashboardState> {
  const epicState = await atomicRead(
    'status/epic_state.json',
    EpicStateSchema
  );

  const base = getCoordinationRoot();
  const agentsPath = path.join(base, STATUS_AGENTS_DIR);

  let agentFiles: string[] = [];
  try {
    agentFiles = await fs.readdir(agentsPath);
  } catch {
    // ignore
  }

  const agents: AgentDashboardInfo[] = [];
  for (const file of agentFiles) {
    if (!file.endsWith('.json')) continue;
    try {
      const status = await atomicRead(
        path.join(STATUS_AGENTS_DIR, file),
        AgentStatusSchema
      );
      agents.push({
        agentId: status.agent_id,
        status: status.status,
        currentTask: status.current_task_id,
        lastHeartbeat: new Date(status.last_heartbeat),
      });
    } catch {
      continue;
    }
  }

  let completed = 0;
  let failed = 0;
  let inProgress = 0;
  let blocked = 0;
  const nextWaveTitles: string[] = [];

  for (const taskId of waveTaskIds) {
    try {
      const task = await atomicRead(
        path.join(TASKS_DIR, `${taskId}.json`),
        TaskSchema
      );
      if (task.status === 'completed') completed++;
      else if (task.status === 'failed') failed++;
      else if (task.status === 'in_progress' || task.status === 'assigned')
        inProgress++;
      else if (task.status === 'blocked') blocked++;
    } catch {
      continue;
    }
  }

  for (const taskId of nextWaveTaskIds) {
    try {
      const task = await atomicRead(
        path.join(TASKS_DIR, `${taskId}.json`),
        TaskSchema
      );
      nextWaveTitles.push(task.title);
    } catch {
      nextWaveTitles.push(taskId);
    }
  }

  const blockers: BlockerInfo[] = await detectBlockers(waveTaskIds);

  const total = epicState.total_tasks || 1;
  const epicProgress = Math.round(
    ((epicState.completed_tasks + epicState.failed_tasks) / total) * 100
  );
  const waveTotal = waveTaskIds.length || 1;
  const waveProgress = Math.round(
    ((completed + failed) / waveTotal) * 100
  );

  return {
    epic: {
      id: epicId,
      name: epicId,
      totalTasks: total,
      completedTasks: epicState.completed_tasks,
      failedTasks: epicState.failed_tasks,
      progressPercent: epicProgress,
    },
    currentWave: {
      number: currentWaveNum,
      totalWaves,
      tasks: waveTotal,
      completed,
      failed,
      inProgress,
      blocked,
      progressPercent: waveProgress,
    },
    agents: agents as AgentDashboardInfo[],
    blockers,
    nextWave: {
      number: currentWaveNum + 1,
      tasks: nextWaveTitles,
    },
    lastUpdated: new Date(),
  };
}
