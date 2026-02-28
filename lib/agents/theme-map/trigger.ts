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

type FileTypeValue = FileContext['fileType'];

const REINDEX_DEBOUNCE_MS = 5_000;

type ReindexPayload = { path: string; content: string; fileId?: string; fileName?: string; fileType?: string };

const reindexPending = new Map<
  string,
  { dirty: Map<string, ReindexPayload>; timeoutId: ReturnType<typeof setTimeout> | null }
>();

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

function flushReindex(projectId: string): void {
  const state = reindexPending.get(projectId);
  if (!state || state.dirty.size === 0) return;

  const files = [...state.dirty.values()];
  state.dirty.clear();
  state.timeoutId = null;
  reindexPending.delete(projectId);

  let map = getThemeMap(projectId);
  if (!map) return;

  for (const file of files) {
    map = reindexFile(map, toFileContext(file));
  }
  setThemeMap(projectId, map);
  console.log(`[ThemeMap] Re-indexed ${files.length} file(s) for ${projectId} (v${map.version})`);
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

  const map = indexTheme(projectId, fileContexts);
  setThemeMap(projectId, map);
  console.log(`[ThemeMap] Indexing complete: ${Object.keys(map.files).length} files mapped for project ${projectId}`);
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
