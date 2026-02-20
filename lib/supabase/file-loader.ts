import { createClient } from '@/lib/supabase/server';
import { createNamespacedCache } from '@/lib/cache/cache-adapter';

/** Lazy load local-file-cache (uses Node `fs`) so bundlers don't try to resolve it in Edge/client. */
async function getLocalFileCache() {
  const { hasLocalCache, readCachedFilesByIds } = await import('@/lib/cache/local-file-cache');
  return { hasLocalCache, readCachedFilesByIds };
}
import type { FileContext } from '@/lib/types/agent';

// ── Lazy per-file content cache ─────────────────────────────────────
//
// Metadata (stubs): Cached in the adapter (Redis or Memory), keyed by projectId.
//   Invalidated on file create/delete/rename. NOT invalidated on content edits.
//
// Content: Cached per-file in process memory, keyed by fileId.
//   Invalidated only for the specific file that changed.
//   Loaded on-demand via async loadContent().

const METADATA_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CONTENT_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface FileContentEntry {
  content: string;
  cachedAt: number;
}

/** Per-file content cache (process memory). */
const fileContentCache = new Map<string, FileContentEntry>();

/** Adapter-level metadata cache (small stubs, shareable across instances). */
const metadataCache = createNamespacedCache('project-files');

/**
 * Invalidate metadata cache for a project. Call from createFile/deleteFile.
 * Content cache entries are NOT affected (file list changed, content didn't).
 */
export async function invalidateProjectFilesCache(projectId: string): Promise<void> {
  try {
    await metadataCache.delete(projectId);
  } catch {
    // fail-open
  }
}

/**
 * Invalidate a single file's content cache entry.
 * Call from updateFile (content changed, file list didn't).
 */
export function invalidateFileContent(fileId: string): void {
  fileContentCache.delete(fileId);
}

/**
 * Invalidate ALL caches for a project (metadata + all per-file content).
 * Call from bulk operations like pullTheme/pushTheme.
 */
export async function invalidateAllProjectCaches(projectId: string, fileIds: string[]): Promise<void> {
  await invalidateProjectFilesCache(projectId);
  for (const id of fileIds) {
    fileContentCache.delete(id);
  }
}

/** Evict stale entries from the per-file content cache. */
function sweepFileContentCache(): void {
  const now = Date.now();
  for (const [fid, entry] of fileContentCache) {
    if (now - entry.cachedAt > CONTENT_CACHE_TTL_MS) {
      fileContentCache.delete(fid);
    }
  }
}

/**
 * Metadata-only file representation (no content loaded).
 * Used for the initial fast query before ContextEngine selection.
 */
export interface FileMetadataRow {
  id: string;
  name: string;
  path: string | null;
  file_type: string;
  /** Approximate size of content in characters. */
  size_chars: number;
}

/**
 * Load file metadata (without content) for all files in a project.
 * This is the "Phase 1" fast query (~50KB for 150 files).
 */
export async function loadFileMetadata(projectId: string): Promise<FileMetadataRow[]> {
  const supabase = await createClient();
  // Use length(content) to get size without loading content
  const { data, error } = await supabase
    .rpc('get_file_metadata', { p_project_id: projectId })
    .select('*');

  if (error || !data) {
    // Fallback: load with content and extract metadata
    console.warn('[file-loader] RPC not available, falling back to full load for metadata');
    const { data: files } = await supabase
      .from('files')
      .select('id, name, path, file_type, content')
      .eq('project_id', projectId);

    return (files ?? []).map(f => ({
      id: f.id,
      name: f.name,
      path: f.path,
      file_type: f.file_type,
      size_chars: (f.content ?? '').length,
    }));
  }

  return data as FileMetadataRow[];
}

/**
 * Load full content for a specific set of files by ID.
 * This is the "Phase 2" targeted query (~200KB for 10 files).
 */
export async function loadFileContent(
  fileIds: string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any,
): Promise<Map<string, string>> {
  if (fileIds.length === 0) return new Map();

  const supabase = supabaseClient ?? await createClient();
  const { data } = await supabase
    .from('files')
    .select('id, content')
    .in('id', fileIds);

  const contentMap = new Map<string, string>();
  for (const file of data ?? []) {
    contentMap.set(file.id, file.content ?? '');
  }
  return contentMap;
}

/**
 * Convert metadata rows to FileContext objects with stub content.
 * Content is replaced with a size stub until loaded on-demand.
 */
export function metadataToFileContexts(rows: FileMetadataRow[]): FileContext[] {
  return rows.map(r => ({
    fileId: r.id,
    fileName: r.name,
    fileType: r.file_type as 'liquid' | 'javascript' | 'css' | 'other',
    content: `[${r.size_chars} chars — content not yet loaded]`,
    path: r.path ?? undefined,
  }));
}

/**
 * Hydrate FileContext objects with actual content from a content map.
 * Files not in the map keep their stub content.
 */
export function hydrateFileContexts(
  contexts: FileContext[],
  contentMap: Map<string, string>,
): FileContext[] {
  return contexts.map(fc => {
    const content = contentMap.get(fc.fileId);
    return content !== undefined ? { ...fc, content } : fc;
  });
}

/**
 * Async content hydrator function type.
 * Given file IDs, fetches content on-demand (with per-file caching)
 * and returns hydrated FileContext[] with real content.
 * Files not found are returned with stub content.
 */
export type LoadContentFn = (fileIds: string[]) => Promise<FileContext[]>;

/**
 * Convenience helper: hydrate ALL files with real content via `loadContent`.
 * Used by search tools (grep) that need to scan every file's content.
 */
export async function loadAllContent(
  files: FileContext[],
  loadContent: LoadContentFn,
): Promise<FileContext[]> {
  const allFileIds = files.map(f => f.fileId);
  return loadContent(allFileIds);
}

/**
 * Lazy loader: fetches file metadata (no content) from Supabase, returns stubs
 * and an async `loadContent` function that fetches content on-demand with
 * per-file caching. Content is never bulk-loaded — only requested files are fetched.
 *
 * Metadata cache: adapter-level, 5-minute TTL. Invalidated on create/delete.
 * Content cache: per-file process memory, 10-minute TTL. Invalidated per-file on edit.
 */
export async function loadProjectFiles(
  projectId: string,
  /** Optional Supabase client override — use the service client when called from
   *  API routes that may receive Bearer-token auth (no cookies). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any,
): Promise<{
  allFiles: FileContext[];
  loadContent: LoadContentFn;
}> {
  // ── Check metadata cache ──────────────────────────────────────────
  try {
    const cachedStubs = await metadataCache.get<FileContext[]>(projectId);
    if (cachedStubs) {
      console.log(`[file-loader] Metadata cache hit for ${projectId}: ${cachedStubs.length} files`);
      return {
        allFiles: cachedStubs,
        loadContent: buildAsyncLoadContent(projectId, cachedStubs, supabaseClient),
      };
    }
  } catch {
    // fail-open
  }

  // ── Cache miss — metadata-only query (no content column) ──────────
  const supabase = supabaseClient ?? await createClient();

  const { data: files } = await supabase
    .from('files')
    .select('id, name, path, file_type, size_bytes')
    .eq('project_id', projectId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allFiles: FileContext[] = (files ?? []).map((f: any) => ({
    fileId: f.id,
    fileName: f.name,
    fileType: f.file_type as 'liquid' | 'javascript' | 'css' | 'other',
    content: `[${f.size_bytes ?? 0} chars]`, // STUB — size from DB column
    path: f.path ?? undefined,
  }));

  // ── Cache metadata stubs ──────────────────────────────────────────
  try {
    await metadataCache.set(projectId, allFiles, METADATA_CACHE_TTL_MS);
  } catch {
    // fail-open
  }

  // Periodic sweep of stale per-file content entries
  if (fileContentCache.size > 500) {
    sweepFileContentCache();
  }

  console.log(`[file-loader] Loaded metadata for ${allFiles.length} files in ${projectId}`);

  return {
    allFiles,
    loadContent: buildAsyncLoadContent(projectId, allFiles, supabaseClient),
  };
}

/**
 * Build an async loadContent closure that fetches content on-demand
 * with per-file caching. Batch-fetches uncached files via loadFileContent().
 */
function buildAsyncLoadContent(
  projectId: string,
  allFiles: FileContext[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseClient?: any,
): LoadContentFn {
  return async (fileIds: string[]): Promise<FileContext[]> => {
    const idSet = new Set(fileIds);
    const stubs = allFiles.filter(f => idSet.has(f.fileId));

    // Separate cached vs uncached
    const cached = new Map<string, string>();
    const uncachedIds: string[] = [];
    const now = Date.now();

    for (const id of fileIds) {
      const entry = fileContentCache.get(id);
      if (entry && now - entry.cachedAt < CONTENT_CACHE_TTL_MS) {
        cached.set(id, entry.content);
      } else {
        uncachedIds.push(id);
      }
    }

    // Check local file cache before hitting Supabase (dynamic import avoids bundling `fs` in Edge)
    let localHits = 0;
    if (uncachedIds.length > 0) {
      const { hasLocalCache, readCachedFilesByIds } = await getLocalFileCache();
      if (hasLocalCache(projectId)) {
        const localContent = readCachedFilesByIds(projectId, uncachedIds);
        const stillUncached: string[] = [];
      for (const id of uncachedIds) {
        const localVal = localContent.get(id);
        if (localVal !== undefined) {
          cached.set(id, localVal);
          fileContentCache.set(id, { content: localVal, cachedAt: now });
          localHits++;
        } else {
          stillUncached.push(id);
        }
      }
      uncachedIds.length = 0;
      uncachedIds.push(...stillUncached);
      if (localHits > 0) {
        console.log(`[file-loader] Local cache hit: ${localHits} files from disk`);
      }
    }
    }

    // Batch-fetch uncached files from DB
    if (uncachedIds.length > 0) {
      try {
        const fetched = await loadFileContent(uncachedIds, supabaseClient);
        for (const [id, content] of fetched) {
          cached.set(id, content);
          fileContentCache.set(id, { content, cachedAt: now });
        }
      } catch (err) {
        console.warn(`[file-loader] loadContent failed for ${uncachedIds.length} files:`, err);
        // fail-open: cached files + stubs for failed files
      }
    }

    // Build result: hydrate stubs with real content where available
    const result: FileContext[] = [];
    for (const stub of stubs) {
      const content = cached.get(stub.fileId);
      if (content !== undefined) {
        result.push({ ...stub, content });
      } else {
        result.push(stub);
      }
    }

    const hydratedCount = result.filter(f => !f.content.startsWith('[')).length;
    console.log(`[file-loader] loadContent: hydrated ${hydratedCount}/${fileIds.length} files (${cached.size} cached, ${uncachedIds.length} fetched)`);

    return result;
  };
}

