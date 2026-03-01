/**
 * Theme Map Trigger — synchronous indexing after import/sync.
 *
 * Since the programmatic indexer runs in <100ms, there's no need for
 * async state, timeouts, progress tracking, or polling infrastructure.
 *
 * triggerThemeMapIndexing() — full rebuild, called after import/sync
 * triggerFileReindex()      — incremental single-file update, debounced
 */

import type { FileContext } from '@/lib/types/agent';
import { indexTheme, reindexFile } from './indexer';
import { setThemeMap, getThemeMap } from './cache';
import { generateFileSummaries } from './summary-generator';

type FileTypeValue = FileContext['fileType'];

const REINDEX_DEBOUNCE_MS = 5_000;

type ReindexPayload = { path: string; content: string; fileId?: string; fileName?: string; fileType?: string };

const reindexPending = new Map<
  string,
  { dirty: Map<string, ReindexPayload>; timeoutId: ReturnType<typeof setTimeout> | null }
>();

async function computeContentHash(content: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoded = new TextEncoder().encode(content);
    const hash = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 0;
  for (let i = 0; i < content.length; i++) {
    h = ((h << 5) - h + content.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

function inferType(pathOrType: string): FileTypeValue {
  if (pathOrType === 'liquid' || pathOrType === 'javascript' || pathOrType === 'css' || pathOrType === 'other') {
    return pathOrType;
  }
  if (pathOrType.endsWith('.liquid')) return 'liquid';
  if (pathOrType.endsWith('.css') || pathOrType.endsWith('.scss')) return 'css';
  if (pathOrType.endsWith('.js') || pathOrType.endsWith('.ts')) return 'javascript';
  return 'other';
}

function toFileContext(file: ReindexPayload): FileContext {
  return {
    fileId: file.fileId ?? 'reindex-0',
    fileName: file.fileName ?? file.path,
    path: file.path,
    fileType: inferType(file.fileType ?? file.path),
    content: file.content,
  };
}

async function flushReindex(projectId: string): Promise<void> {
  const state = reindexPending.get(projectId);
  if (!state || state.dirty.size === 0) return;

  const files = [...state.dirty.values()];
  state.dirty.clear();
  state.timeoutId = null;
  reindexPending.delete(projectId);

  let map = getThemeMap(projectId);
  if (!map) return;

  let skipped = 0;
  for (const file of files) {
    const contentHash = await computeContentHash(file.content);
    const key = file.path ?? file.fileName ?? '';
    const existing = map.files[key];
    if (existing?.contentHash === contentHash) {
      skipped++;
      continue;
    }

    map = reindexFile(map, toFileContext(file));
    if (map.files[key]) {
      map.files[key].contentHash = contentHash;
    }
  }
  setThemeMap(projectId, map);
  const processed = files.length - skipped;
  console.log(`[ThemeMap] Re-indexed ${processed} file(s), skipped ${skipped} unchanged for ${projectId} (v${map.version})`);
}

/**
 * Trigger full theme map indexing for a project.
 * Synchronous — builds the programmatic map in <100ms.
 */
export function triggerThemeMapIndexing(
  projectId: string,
  files: Array<{ path: string; content: string; fileId?: string; fileName?: string; fileType?: string }>,
): void {
  const pending = reindexPending.get(projectId);
  if (pending?.timeoutId != null) {
    clearTimeout(pending.timeoutId);
    pending.dirty.clear();
    pending.timeoutId = null;
    reindexPending.delete(projectId);
  }

  const fileContexts: FileContext[] = files.map((f, i) => ({
    fileId: f.fileId ?? `map-${i}`,
    fileName: f.fileName ?? f.path,
    path: f.path,
    fileType: inferType(f.fileType ?? f.path),
    content: f.content,
  }));

  const existingMap = getThemeMap(projectId);
  if (existingMap) {
    existingMap.intelligenceStatus = 'indexing';
    setThemeMap(projectId, existingMap);
  }

  try {
    const map = indexTheme(projectId, fileContexts);
    map.intelligenceStatus = 'ready';
    setThemeMap(projectId, map);
    console.log(`[ThemeMap] Indexing complete: ${Object.keys(map.files).length} files mapped for project ${projectId}`);

    generateFileSummaries(projectId, files, map).catch(err => {
      console.warn('[trigger] Summary generation failed:', err);
    });
  } catch (err) {
    const staleMap = getThemeMap(projectId);
    if (staleMap) {
      staleMap.intelligenceStatus = 'stale';
      setThemeMap(projectId, staleMap);
    }
    throw err;
  }
}

/**
 * Trigger incremental re-indexing for a single file after an edit.
 * Debounced per project: multiple edits are batched and flushed together.
 */
export function triggerFileReindex(
  projectId: string,
  file: { path: string; content: string; fileId?: string; fileName?: string; fileType?: string },
): void {
  const existingMap = getThemeMap(projectId);
  if (!existingMap) return;

  let state = reindexPending.get(projectId);
  if (!state) {
    state = { dirty: new Map(), timeoutId: null };
    reindexPending.set(projectId, state);
  }

  state.dirty.set(file.path, { ...file });

  if (state.timeoutId != null) {
    clearTimeout(state.timeoutId);
  }

  state.timeoutId = setTimeout(() => {
    flushReindex(projectId);
  }, REINDEX_DEBOUNCE_MS);
}
