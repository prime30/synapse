import { promises as fs } from 'fs';
import path from 'path';
import type { z } from 'zod';

const COORDINATION_BASE = '.cursor';

/** Override for tests: set coordination root to temp dir */
let coordinationRoot: string | null = null;

export function setCoordinationRoot(root: string | null): void {
  coordinationRoot = root;
}

export function getCoordinationRoot(): string {
  return (
    coordinationRoot ?? path.join(process.cwd(), COORDINATION_BASE)
  );
}

/**
 * Resolve path relative to coordination base (.cursor/)
 */
function resolvePath(relativePath: string): string {
  const base =
    coordinationRoot ?? path.join(process.cwd(), COORDINATION_BASE);
  const normalized = path
    .normalize(relativePath)
    .replace(/^(\.\.(\/|\\|$))+/, '');
  return path.join(base, normalized);
}

/**
 * Atomic write: write to temp file, then rename. Ensures file is either fully written or not present.
 */
export async function atomicWrite(filePath: string, data: object): Promise<void> {
  const fullPath = resolvePath(filePath);
  const dir = path.dirname(fullPath);
  const tempPath = `${fullPath}.tmp.${Date.now()}`;

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
  await fs.rename(tempPath, fullPath);
}

/**
 * Read and validate JSON file against Zod schema. Throws on parse/validation error.
 */
export async function atomicRead<T>(
  filePath: string,
  schema: z.ZodType<T>
): Promise<T> {
  const fullPath = resolvePath(filePath);

  let content: string;
  try {
    content = await fs.readFile(fullPath, 'utf-8');
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === 'ENOENT') {
      throw new Error(`File not found: ${filePath}`);
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    throw new Error(`Invalid JSON in ${filePath}: ${(err as Error).message}`);
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Validation failed for ${filePath}: ${result.error.message}`
    );
  }
  return result.data;
}
