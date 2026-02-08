import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { setCoordinationRoot } from '../atomic';
import { initializeCoordination } from '../initialize';
import { acquireLock, releaseLock } from '../locking';

describe('locking', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'coordination-lock-'));
    setCoordinationRoot(tempDir);
    await initializeCoordination('epic-1');
  });

  afterEach(() => {
    setCoordinationRoot(null);
  });

  it('acquires lock when file is not locked', async () => {
    const ok = await acquireLock('src/foo.ts', 'agent-1', 'task-1');
    expect(ok).toBe(true);
  });

  it('returns false when file is already locked by another agent', async () => {
    await acquireLock('src/foo.ts', 'agent-1', 'task-1');
    const ok = await acquireLock('src/foo.ts', 'agent-2', 'task-2');
    expect(ok).toBe(false);
  });

  it('allows same agent to re-acquire (overwrite) - or different agent after release', async () => {
    await acquireLock('src/foo.ts', 'agent-1', 'task-1');
    await releaseLock('src/foo.ts', 'agent-1');
    const ok = await acquireLock('src/foo.ts', 'agent-2', 'task-2');
    expect(ok).toBe(true);
  });

  it('releaseLock does nothing when lock owned by another agent', async () => {
    await acquireLock('src/foo.ts', 'agent-1', 'task-1');
    await releaseLock('src/foo.ts', 'agent-2');
    const ok = await acquireLock('src/foo.ts', 'agent-2', 'task-2');
    expect(ok).toBe(false);
  });

  it('allows lock acquisition after expiry', async () => {
    await acquireLock('src/foo.ts', 'agent-1', 'task-1', 0.0001);
    await new Promise((r) => setTimeout(r, 10));
    const ok = await acquireLock('src/foo.ts', 'agent-2', 'task-2');
    expect(ok).toBe(true);
  });
});
