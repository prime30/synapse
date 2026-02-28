import { type DBSchema, type IDBPDatabase, openDB } from 'idb';

// -- Types --------------------------------------------------------------------

export interface PendingWrite {
  fileId: string;
  projectId: string;
  content: string;
  queuedAt: number;
  attempts: number;
}

export const MAX_PENDING_WRITE_ATTEMPTS = 5;

// -- Environment detection ----------------------------------------------------

const isBrowser = typeof window !== 'undefined' && typeof indexedDB !== 'undefined';

// -- Browser: IndexedDB -------------------------------------------------------

interface PendingWritesDB extends DBSchema {
  pendingWrites: {
    key: string;
    value: PendingWrite & { _key: string };
    indexes: { byProject: string };
  };
}

const PW_DB_NAME = 'synapse-pending-writes';
const PW_DB_VERSION = 1;

let pwDbPromise: Promise<IDBPDatabase<PendingWritesDB>> | null = null;

function getPwDb(): Promise<IDBPDatabase<PendingWritesDB>> {
  if (!pwDbPromise) {
    pwDbPromise = openDB<PendingWritesDB>(PW_DB_NAME, PW_DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore('pendingWrites', { keyPath: '_key' });
        store.createIndex('byProject', 'projectId');
      },
    });
  }
  return pwDbPromise;
}

function compoundKey(projectId: string, fileId: string): string {
  return `${projectId}:${fileId}`;
}

// -- Server: JSON file --------------------------------------------------------

async function serverFilePath(projectId: string): Promise<string> {
  const pathMod = await import(/* webpackIgnore: true */ 'node:path');
  const safe = projectId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return pathMod.join(process.cwd(), '.cache', 'themes', safe, '_pending-writes.json');
}

async function readServerStore(projectId: string): Promise<PendingWrite[]> {
  try {
    const fsMod = await import(/* webpackIgnore: true */ 'node:fs');
    const filePath = await serverFilePath(projectId);
    if (!fsMod.existsSync(filePath)) return [];
    const raw = fsMod.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeServerStore(projectId: string, writes: PendingWrite[]): Promise<void> {
  try {
    const fsMod = await import(/* webpackIgnore: true */ 'node:fs');
    const pathMod = await import(/* webpackIgnore: true */ 'node:path');
    const filePath = await serverFilePath(projectId);
    fsMod.mkdirSync(pathMod.dirname(filePath), { recursive: true });
    fsMod.writeFileSync(filePath, JSON.stringify(writes, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[pending-writes-store] server write failed:', err);
  }
}

// -- Public API ---------------------------------------------------------------

export async function persistPendingWrite(
  projectId: string,
  fileId: string,
  content: string,
): Promise<void> {
  const entry: PendingWrite = {
    fileId,
    projectId,
    content,
    queuedAt: Date.now(),
    attempts: 0,
  };

  if (isBrowser) {
    try {
      const db = await getPwDb();
      await db.put('pendingWrites', { ...entry, _key: compoundKey(projectId, fileId) });
    } catch (err) {
      console.warn('[pending-writes-store] IndexedDB persist failed:', err);
    }
    return;
  }

  const existing = await readServerStore(projectId);
  const idx = existing.findIndex((w) => w.fileId === fileId);
  if (idx >= 0) {
    existing[idx] = entry;
  } else {
    existing.push(entry);
  }
  await writeServerStore(projectId, existing);
}

export async function clearPendingWrite(
  projectId: string,
  fileId: string,
): Promise<void> {
  if (isBrowser) {
    try {
      const db = await getPwDb();
      await db.delete('pendingWrites', compoundKey(projectId, fileId));
    } catch (err) {
      console.warn('[pending-writes-store] IndexedDB clear failed:', err);
    }
    return;
  }

  const existing = await readServerStore(projectId);
  const filtered = existing.filter((w) => w.fileId !== fileId);
  if (filtered.length !== existing.length) {
    await writeServerStore(projectId, filtered);
  }
}

export async function loadPendingWrites(projectId: string): Promise<PendingWrite[]> {
  if (isBrowser) {
    try {
      const db = await getPwDb();
      const all = await db.getAllFromIndex('pendingWrites', 'byProject', projectId);
      return all.map((entry) => ({
        fileId: entry.fileId,
        projectId: entry.projectId,
        content: entry.content,
        queuedAt: entry.queuedAt,
        attempts: entry.attempts,
      }));
    } catch (err) {
      console.warn('[pending-writes-store] IndexedDB load failed:', err);
      return [];
    }
  }

  return readServerStore(projectId);
}

export async function incrementWriteAttempts(
  projectId: string,
  fileId: string,
): Promise<void> {
  if (isBrowser) {
    try {
      const db = await getPwDb();
      const key = compoundKey(projectId, fileId);
      const entry = await db.get('pendingWrites', key);
      if (entry) {
        entry.attempts += 1;
        await db.put('pendingWrites', entry);
      }
    } catch (err) {
      console.warn('[pending-writes-store] IndexedDB increment failed:', err);
    }
    return;
  }

  const existing = await readServerStore(projectId);
  const target = existing.find((w) => w.fileId === fileId);
  if (target) {
    target.attempts += 1;
    await writeServerStore(projectId, existing);
  }
}

export async function clearAllPendingWrites(projectId: string): Promise<void> {
  if (isBrowser) {
    try {
      const db = await getPwDb();
      const tx = db.transaction('pendingWrites', 'readwrite');
      const store = tx.objectStore('pendingWrites');
      const idx = store.index('byProject');
      let cursor = await idx.openCursor(projectId);
      while (cursor) {
        await cursor.delete();
        cursor = await cursor.continue();
      }
      await tx.done;
    } catch (err) {
      console.warn('[pending-writes-store] IndexedDB clearAll failed:', err);
    }
    return;
  }

  await writeServerStore(projectId, []);
}
