/**
 * Theme Map Cache — in-memory + disk persistence + IndexedDB browser fallback.
 *
 * The map is stored in memory for instant lookups and persisted to disk
 * (`.synapse-themes/<projectId>/.theme-map.json`) for cross-session survival.
 * In browser environments (no filesystem access), persists to IndexedDB instead.
 * On cold start, the disk/IndexedDB cache is loaded; if missing, indexing is triggered.
 */

import type { ThemeMap } from './types';

const memoryCache = new Map<string, ThemeMap>();

const isBrowserEnv = typeof window !== 'undefined';

async function getDiskHelpers() {
  const { readFile, writeFile, mkdir } = await import('fs/promises');
  const { join } = await import('path');
  const { homedir } = await import('os');
  return { readFile, writeFile, mkdir, join, homedir };
}

export function getThemeMap(projectId: string): ThemeMap | null {
  return memoryCache.get(projectId) ?? null;
}

export function setThemeMap(projectId: string, map: ThemeMap): void {
  memoryCache.set(projectId, map);
  persistToStorage(projectId, map).catch(err =>
    console.warn('[ThemeMapCache] Persist failed:', err),
  );
}

export async function loadFromDisk(projectId: string): Promise<ThemeMap | null> {
  if (memoryCache.has(projectId)) return memoryCache.get(projectId)!;

  if (isBrowserEnv) {
    return loadFromIndexedDB(projectId);
  }

  try {
    const { readFile, join, homedir } = await getDiskHelpers();
    const cachePath = join(homedir(), '.synapse-themes', projectId, '.theme-map.json');
    const raw = await readFile(cachePath, 'utf-8');
    const map = JSON.parse(raw) as ThemeMap;
    memoryCache.set(projectId, map);
    console.log(`[ThemeMapCache] Loaded from disk: ${Object.keys(map.files).length} files (v${map.version})`);
    return map;
  } catch {
    return null;
  }
}

async function loadFromIndexedDB(projectId: string): Promise<ThemeMap | null> {
  try {
    const { getCachedThemeMap } = await import('@/lib/cache/indexeddb-file-cache');
    const raw = await getCachedThemeMap(projectId);
    if (!raw) return null;
    const map = JSON.parse(raw) as ThemeMap;
    memoryCache.set(projectId, map);
    console.log(`[ThemeMapCache] Loaded from IndexedDB: ${Object.keys(map.files).length} files (v${map.version})`);
    return map;
  } catch {
    return null;
  }
}

export function invalidate(projectId: string): void {
  memoryCache.delete(projectId);
}

/**
 * Shift all ThemeMap line ranges for a file after an edit_lines operation.
 * Keeps the in-memory map approximately correct until the debounced
 * triggerFileReindex() runs a full re-chunk.
 */
export function shiftLineRanges(
  projectId: string,
  filePath: string,
  editStartLine: number,
  editEndLine: number,
  insertedLineCount: number,
  mode: 'replace' | 'insert_before' | 'insert_after',
): void {
  const map = memoryCache.get(projectId);
  if (!map) return;

  const fileEntry = map.files[filePath];
  if (!fileEntry) return;

  const removedCount = mode === 'replace' ? (editEndLine - editStartLine + 1) : 0;
  const delta = insertedLineCount - removedCount;
  if (delta === 0 && mode === 'replace') return;

  const insertionPoint = mode === 'insert_before' ? editStartLine
    : mode === 'insert_after' ? editEndLine + 1
    : editStartLine;

  for (const [key, feature] of Object.entries(fileEntry.features)) {
    const [featStart, featEnd] = feature.lines;
    if (featStart === 0 && featEnd === 0) continue;

    let newStart = featStart;
    let newEnd = featEnd;

    if (mode === 'replace') {
      if (featStart > editEndLine) {
        newStart = featStart + delta;
        newEnd = featEnd + delta;
      } else if (featEnd < editStartLine) {
        // entirely before edit — no change
      } else if (featStart >= editStartLine && featEnd <= editEndLine) {
        // entirely inside removed range — mark stale
        newStart = 0;
        newEnd = 0;
      } else {
        // overlaps edit region — extend end by delta
        newEnd = Math.max(featStart, featEnd + delta);
      }
    } else {
      // insert_before or insert_after
      if (featStart >= insertionPoint) {
        newStart = featStart + insertedLineCount;
        newEnd = featEnd + insertedLineCount;
      } else if (featEnd >= insertionPoint) {
        newEnd = featEnd + insertedLineCount;
      }
    }

    fileEntry.features[key] = { ...feature, lines: [newStart, newEnd] };
  }

  map.version += 1;
}

async function persistToStorage(projectId: string, map: ThemeMap): Promise<void> {
  const json = JSON.stringify(map);

  if (isBrowserEnv) {
    try {
      const { setCachedThemeMap } = await import('@/lib/cache/indexeddb-file-cache');
      await setCachedThemeMap(projectId, json);
      console.log(`[ThemeMapCache] Persisted to IndexedDB for ${projectId}`);
    } catch {
      // IndexedDB unavailable — skip
    }
    return;
  }

  try {
    const { writeFile, mkdir, join, homedir } = await getDiskHelpers();
    const dirPath = join(homedir(), '.synapse-themes', projectId);
    const filePath = join(dirPath, '.theme-map.json');
    await mkdir(dirPath, { recursive: true });
    await writeFile(filePath, json, 'utf-8');
    console.log(`[ThemeMapCache] Persisted to disk: ${filePath}`);
  } catch (err) {
    console.warn('[ThemeMapCache] Disk persist failed:', err);
  }
}
