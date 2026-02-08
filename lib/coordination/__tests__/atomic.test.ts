import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { z } from 'zod';
import {
  atomicWrite,
  atomicRead,
  setCoordinationRoot,
  getCoordinationRoot,
} from '../atomic';
import { TaskSchema } from '../schemas';

const SimpleSchema = z.object({ foo: z.string(), num: z.number() });

describe('atomic', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'coordination-test-'));
    setCoordinationRoot(tempDir);
  });

  afterEach(() => {
    setCoordinationRoot(null);
  });

  it('writes and reads valid JSON', async () => {
    const data = { foo: 'bar', num: 42 };
    await atomicWrite('test.json', data);
    const read = await atomicRead('test.json', SimpleSchema);
    expect(read).toEqual(data);
  });

  it('atomic write uses temp then rename', async () => {
    const data = { a: 1 };
    await atomicWrite('target.json', data);
    const targetPath = path.join(tempDir, 'target.json');
    const exists = await fs
      .stat(targetPath)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);
    const content = JSON.parse(
      await fs.readFile(targetPath, 'utf-8')
    );
    expect(content).toEqual(data);
  });

  it('atomicRead validates against schema and throws on invalid', async () => {
    await atomicWrite('invalid.json', { not: 'a task' });
    await expect(
      atomicRead('invalid.json', TaskSchema)
    ).rejects.toThrow(/Validation failed/);
  });

  it('atomicRead throws on missing file', async () => {
    await expect(
      atomicRead('nonexistent.json', TaskSchema)
    ).rejects.toThrow(/File not found/);
  });

  it('getCoordinationRoot returns temp when set', () => {
    expect(getCoordinationRoot()).toBe(tempDir);
  });
});
