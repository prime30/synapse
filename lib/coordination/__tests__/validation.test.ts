import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import { setCoordinationRoot } from '../atomic';
import { initializeCoordination } from '../initialize';
import { validateCoordinationState } from '../validation';

describe('validation', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'coordination-val-'));
    setCoordinationRoot(tempDir);
  });

  afterEach(() => {
    setCoordinationRoot(null);
  });

  it('returns valid when all state is correct', async () => {
    await initializeCoordination('epic-1');
    const result = await validateCoordinationState();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns error when required directory is missing', async () => {
    await fs.mkdir(path.join(tempDir, 'tasks'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'status'), { recursive: true });
    const result = await validateCoordinationState();
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Missing required directory'))).toBe(
      true
    );
  });

  it('returns error when JSON file is invalid', async () => {
    await initializeCoordination('epic-1');
    await fs.writeFile(
      path.join(tempDir, 'coordination', 'dependency-graph.json'),
      '{ invalid json',
      'utf-8'
    );
    const result = await validateCoordinationState();
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('dependency-graph'))).toBe(true);
  });
});
