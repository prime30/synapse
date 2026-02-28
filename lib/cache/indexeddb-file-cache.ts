'use client';

import { type DBSchema, type IDBPDatabase, openDB } from 'idb';

// -- Schema -------------------------------------------------------------------

interface FileContentEntry {
  fileId: string;
  projectId: string;
  content: string;
  contentHash: string;
  cachedAt: number;
  lastAccessed: number;
}

interface ProjectMetaEntry {
  projectId: string;
  version: number;
  fileCount: number;
  lastSyncedAt: number;
}

interface ThemeMapEntry {
  projectId: string;
  map: string;
  cachedAt: number;
}

interface SynapseFileCacheDB extends DBSchema {
  fileContent: {
    key: string;
    value: FileContentEntry;
    indexes: { byProject: string; byLastAccessed: [string, number] };
  };
  projectMeta: {
    key: string;
    value: ProjectMetaEntry;
  };
  themeMap: {
    key: string;
    value: ThemeMapEntry;
  };
}

// -- Environment check --------------------------------------------------------

export function isIndexedDBAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof indexedDB === 'undefined') return false;
  if ('electronAPI' in window) return false;
  return true;
}

// -- DB singleton -------------------------------------------------------------

const DB_NAME = 'synapse-file-cache';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<SynapseFileCacheDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<SynapseFileCacheDB>> {
  if (!isIndexedDBAvailable()) {
    return Promise.reject(new Error('IndexedDB not available'));
  }

  if (!dbPromise) {
    dbPromise = openDB<SynapseFileCacheDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const fileStore = db.createObjectStore('fileContent', { keyPath: 'fileId' });
        fileStore.createIndex('byProject', 'projectId');
        fileStore.createIndex('byLastAccessed', ['projectId', 'lastAccessed']);

        db.createObjectStore('projectMeta', { keyPath: 'projectId' });
        db.createObjectStore('themeMap', { keyPath: 'projectId' });
      },
    });
  }

  return dbPromise;
}

// -- Content hash -------------------------------------------------------------

function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// -- File content operations --------------------------------------------------

export async function getCachedFileContent(fileId: string): Promise<string | null> {
  if (!isIndexedDBAvailable()) return null;
  try {
    const db = await getDb();
    const entry = await db.get('fileContent', fileId);
    if (!entry) return null;

    const tx = db.transaction('fileContent', 'readwrite');
    const store = tx.objectStore('fileContent');
    await store.put({ ...entry, lastAccessed: Date.now() });
    await tx.done;

    return entry.content;
  } catch {
    return null;
  }
}

export async function getCachedFileContents(fileIds: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (!isIndexedDBAvailable() || fileIds.length === 0) return result;

  try {
    const db = await getDb();
    const tx = db.transaction('fileContent', 'readwrite');
    const store = tx.objectStore('fileContent');
    const now = Date.now();

    for (const fileId of fileIds) {
      const entry = await store.get(fileId);
      if (entry) {
        result.set(fileId, entry.content);
        await store.put({ ...entry, lastAccessed: now });
      }
    }

    await tx.done;
  } catch {
    // Return whatever we gathered
  }

  return result;
}

export async function setCachedFileContent(
  fileId: string,
  projectId: string,
  content: string,
): Promise<void> {
  if (!isIndexedDBAvailable()) return;
  try {
    await writeFileEntry(fileId, projectId, content);
  } catch (err) {
    if (isQuotaError(err)) {
      await evictLRU(projectId);
      try {
        await writeFileEntry(fileId, projectId, content);
      } catch {
        // Gave up after eviction retry
      }
    }
  }
}

export async function setCachedFileContents(
  entries: Array<{ fileId: string; projectId: string; content: string }>,
): Promise<void> {
  if (!isIndexedDBAvailable() || entries.length === 0) return;
  try {
    await writeFileEntries(entries);
  } catch (err) {
    if (isQuotaError(err)) {
      const projects = Array.from(new Set(entries.map((e) => e.projectId)));
      for (const pid of projects) await evictLRU(pid);
      try {
        await writeFileEntries(entries);
      } catch {
        // Gave up after eviction retry
      }
    }
  }
}

export async function deleteCachedFileContent(fileId: string): Promise<void> {
  if (!isIndexedDBAvailable()) return;
  try {
    const db = await getDb();
    await db.delete('fileContent', fileId);
  } catch {
    // Fail-open
  }
}

// -- Project metadata ---------------------------------------------------------

export async function getProjectCacheVersion(projectId: string): Promise<number | null> {
  if (!isIndexedDBAvailable()) return null;
  try {
    const db = await getDb();
    const entry = await db.get('projectMeta', projectId);
    return entry?.version ?? null;
  } catch {
    return null;
  }
}

export async function setProjectCacheVersion(
  projectId: string,
  version: number,
  fileCount: number,
): Promise<void> {
  if (!isIndexedDBAvailable()) return;
  try {
    const db = await getDb();
    await db.put('projectMeta', {
      projectId,
      version,
      fileCount,
      lastSyncedAt: Date.now(),
    });
  } catch {
    // Fail-open
  }
}

// -- Theme map ----------------------------------------------------------------

export async function getCachedThemeMap(projectId: string): Promise<string | null> {
  if (!isIndexedDBAvailable()) return null;
  try {
    const db = await getDb();
    const entry = await db.get('themeMap', projectId);
    return entry?.map ?? null;
  } catch {
    return null;
  }
}

export async function setCachedThemeMap(projectId: string, mapJson: string): Promise<void> {
  if (!isIndexedDBAvailable()) return;
  try {
    const db = await getDb();
    await db.put('themeMap', {
      projectId,
      map: mapJson,
      cachedAt: Date.now(),
    });
  } catch (err) {
    if (isQuotaError(err)) {
      await evictLRU(projectId);
      try {
        const db = await getDb();
        await db.put('themeMap', { projectId, map: mapJson, cachedAt: Date.now() });
      } catch {
        // Gave up
      }
    }
  }
}

// -- Invalidation -------------------------------------------------------------

export async function invalidateProjectCache(projectId: string): Promise<void> {
  if (!isIndexedDBAvailable()) return;
  try {
    const db = await getDb();

    const tx = db.transaction(['fileContent', 'projectMeta', 'themeMap'], 'readwrite');
    const fileStore = tx.objectStore('fileContent');
    const idx = fileStore.index('byProject');

    let cursor = await idx.openCursor(projectId);
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }

    await tx.objectStore('projectMeta').delete(projectId);
    await tx.objectStore('themeMap').delete(projectId);
    await tx.done;
  } catch {
    // Fail-open
  }
}

// -- LRU eviction -------------------------------------------------------------

const DEFAULT_MAX_BYTES = 100 * 1024 * 1024;

export async function evictLRU(
  projectId: string,
  maxBytes: number = DEFAULT_MAX_BYTES,
): Promise<number> {
  if (!isIndexedDBAvailable()) return 0;

  try {
    const db = await getDb();

    const tx = db.transaction('fileContent', 'readwrite');
    const store = tx.objectStore('fileContent');
    const idx = store.index('byProject');

    const entries: Array<{ fileId: string; size: number; lastAccessed: number }> = [];
    let cursor = await idx.openCursor(projectId);
    while (cursor) {
      const val = cursor.value;
      entries.push({
        fileId: val.fileId,
        size: val.content.length * 2, // JS strings are ~2 bytes per char
        lastAccessed: val.lastAccessed,
      });
      cursor = await cursor.continue();
    }
    await tx.done;

    let totalBytes = entries.reduce((sum, e) => sum + e.size, 0);
    if (totalBytes <= maxBytes) return 0;

    entries.sort((a, b) => a.lastAccessed - b.lastAccessed);

    let evicted = 0;
    const toDelete: string[] = [];

    for (const entry of entries) {
      if (totalBytes <= maxBytes) break;
      toDelete.push(entry.fileId);
      totalBytes -= entry.size;
      evicted++;
    }

    if (toDelete.length > 0) {
      const delTx = db.transaction('fileContent', 'readwrite');
      const delStore = delTx.objectStore('fileContent');
      for (const id of toDelete) {
        await delStore.delete(id);
      }
      await delTx.done;
    }

    return evicted;
  } catch {
    return 0;
  }
}

// -- Internal helpers ---------------------------------------------------------

async function writeFileEntry(fileId: string, projectId: string, content: string): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.put('fileContent', {
    fileId,
    projectId,
    content,
    contentHash: djb2(content),
    cachedAt: now,
    lastAccessed: now,
  });
}

async function writeFileEntries(
  entries: Array<{ fileId: string; projectId: string; content: string }>,
): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('fileContent', 'readwrite');
  const store = tx.objectStore('fileContent');
  const now = Date.now();

  for (const { fileId, projectId, content } of entries) {
    await store.put({
      fileId,
      projectId,
      content,
      contentHash: djb2(content),
      cachedAt: now,
      lastAccessed: now,
    });
  }

  await tx.done;
}

function isQuotaError(err: unknown): boolean {
  if (err instanceof DOMException) {
    return err.name === 'QuotaExceededError' || err.code === 22;
  }
  return false;
}
