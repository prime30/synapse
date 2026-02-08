import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import { setCoordinationRoot } from '../atomic';
import { atomicWrite } from '../atomic';
import { updateHeartbeat, detectStaleAgents } from '../heartbeat';
import { AgentStatusSchema } from '../schemas';

describe('heartbeat', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'coordination-hb-'));
    setCoordinationRoot(tempDir);
    await fs.mkdir(path.join(tempDir, 'status', 'agents'), {
      recursive: true,
    });
  });

  afterEach(() => {
    setCoordinationRoot(null);
    vi.restoreAllMocks();
  });

  it('updateHeartbeat updates last_heartbeat', async () => {
    const now = new Date().toISOString();
    await atomicWrite('status/agents/agent-1.json', {
      agent_id: 'agent-1',
      status: 'active',
      current_task_id: null,
      last_heartbeat: '2020-01-01T00:00:00Z',
      capabilities: ['frontend'],
      error_message: null,
      started_at: now,
    });

    await updateHeartbeat('agent-1');

    const content = await fs.readFile(
      path.join(tempDir, 'status', 'agents', 'agent-1.json'),
      'utf-8'
    );
    const parsed = JSON.parse(content);
    expect(new Date(parsed.last_heartbeat).getTime()).toBeGreaterThan(
      new Date('2020-01-01T00:00:00Z').getTime()
    );
  });

  it('updateHeartbeat marks stale as active', async () => {
    const now = new Date().toISOString();
    await atomicWrite('status/agents/agent-1.json', {
      agent_id: 'agent-1',
      status: 'stale',
      current_task_id: null,
      last_heartbeat: now,
      capabilities: [],
      error_message: null,
      started_at: now,
    });

    await updateHeartbeat('agent-1');

    const content = await fs.readFile(
      path.join(tempDir, 'status', 'agents', 'agent-1.json'),
      'utf-8'
    );
    const parsed = AgentStatusSchema.parse(JSON.parse(content));
    expect(parsed.status).toBe('active');
  });

  it('detectStaleAgents marks agents with old heartbeat as stale', async () => {
    const oldTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await atomicWrite('status/agents/agent-1.json', {
      agent_id: 'agent-1',
      status: 'active',
      current_task_id: null,
      last_heartbeat: oldTime,
      capabilities: [],
      error_message: null,
      started_at: oldTime,
    });

    const stale = await detectStaleAgents(5);
    expect(stale).toContain('agent-1');

    const content = await fs.readFile(
      path.join(tempDir, 'status', 'agents', 'agent-1.json'),
      'utf-8'
    );
    const parsed = JSON.parse(content);
    expect(parsed.status).toBe('stale');
  });

  it('detectStaleAgents returns empty when no agents', async () => {
    const stale = await detectStaleAgents(5);
    expect(stale).toEqual([]);
  });
});
