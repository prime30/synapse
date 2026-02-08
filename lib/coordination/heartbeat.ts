import { promises as fs } from 'fs';
import path from 'path';
import { atomicRead, atomicWrite, getCoordinationRoot } from './atomic';
import { AgentStatusSchema } from './schemas';
import type { AgentStatus } from './schemas';

const AGENTS_DIR = 'status/agents';
const STALE_THRESHOLD_MINUTES = 5;

/**
 * Update agent heartbeat timestamp. If agent was stale, mark as active.
 */
export async function updateHeartbeat(agentId: string): Promise<void> {
  const statusPath = path.join(AGENTS_DIR, `${agentId}.json`);

  const status = await atomicRead(statusPath, AgentStatusSchema);
  const updated: AgentStatus = {
    ...status,
    last_heartbeat: new Date().toISOString(),
    status: status.status === 'stale' ? 'active' : status.status,
  };
  await atomicWrite(statusPath, updated);
}

/**
 * Detect agents whose last heartbeat is older than threshold. Mark them as stale and return their IDs.
 */
export async function detectStaleAgents(
  staleThresholdMinutes: number = STALE_THRESHOLD_MINUTES
): Promise<string[]> {
  const base = getCoordinationRoot();
  const agentsPath = path.join(base, AGENTS_DIR);

  let files: string[];
  try {
    files = await fs.readdir(agentsPath);
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === 'ENOENT') {
      return [];
    }
    throw err;
  }

  const staleAgents: string[] = [];
  const now = new Date();

  for (const file of files) {
    if (!file.endsWith('.json')) continue;

    const relativePath = path.join(AGENTS_DIR, file);
    const status = await atomicRead(relativePath, AgentStatusSchema);
    const lastHeartbeat = new Date(status.last_heartbeat);
    const minutesSince =
      (now.getTime() - lastHeartbeat.getTime()) / (60 * 1000);

    if (minutesSince > staleThresholdMinutes) {
      staleAgents.push(status.agent_id);
      const updated: AgentStatus = {
        ...status,
        status: 'stale',
      };
      await atomicWrite(relativePath, updated);
    }
  }

  return staleAgents;
}
