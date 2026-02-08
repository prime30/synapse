import type { z } from 'zod';
import { promises as fs } from 'fs';
import path from 'path';
import { atomicRead, getCoordinationRoot } from './atomic';
import {
  DependencyGraphSchema,
  AgentPoolSchema,
  FileLockSchema,
  EpicStateSchema,
} from './schemas';
import { detectStaleAgents } from './heartbeat';

const REQUIRED_DIRS = [
  'tasks',
  'tasks/assignments',
  'status',
  'status/agents',
  'coordination',
] as const;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate coordination state: required dirs exist, JSON files valid, no orphaned locks.
 */
export async function validateCoordinationState(): Promise<ValidationResult> {
  const errors: string[] = [];
  const base = getCoordinationRoot();

  for (const dir of REQUIRED_DIRS) {
    const fullPath = path.join(base, dir);
    try {
      const stat = await fs.stat(fullPath);
      if (!stat.isDirectory()) {
        errors.push(`Not a directory: ${dir}`);
      }
    } catch (err) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code === 'ENOENT') {
        errors.push(`Missing required directory: .cursor/${dir}`);
      } else {
        errors.push(`Error checking ${dir}: ${(err as Error).message}`);
      }
    }
  }

  const filesToValidate: { path: string; schema: z.ZodType }[] = [
    { path: 'coordination/dependency-graph.json', schema: DependencyGraphSchema },
    { path: 'coordination/agent-pool.json', schema: AgentPoolSchema },
    { path: 'coordination/file_locks.json', schema: FileLockSchema },
    { path: 'status/epic_state.json', schema: EpicStateSchema },
  ];

  for (const { path: filePath, schema } of filesToValidate) {
    try {
      await atomicRead(filePath, schema);
    } catch (err) {
      errors.push(`Invalid ${filePath}: ${(err as Error).message}`);
    }
  }

  try {
    const staleAgents = await detectStaleAgents();
    const locks = await atomicRead('coordination/file_locks.json', FileLockSchema);

    for (const [file, lock] of Object.entries(locks.locks)) {
      if (staleAgents.includes(lock.locked_by)) {
        errors.push(
          `Orphaned lock on ${file} by stale agent ${lock.locked_by}`
        );
      }
    }
  } catch (err) {
    errors.push(`Error checking orphaned locks: ${(err as Error).message}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
