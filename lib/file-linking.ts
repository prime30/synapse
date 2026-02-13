/**
 * Manual file linking system.
 *
 * Allows users (and the AI agent) to create bidirectional links between files
 * so that opening one file prompts opening its linked companions.
 *
 * Stored in localStorage per project. Bidirectional: linking A→B also links B→A.
 */

const STORAGE_KEY_PREFIX = 'synapse-file-links-';

interface LinkStore {
  /** Map of fileId → Set of linked fileIds (stored as arrays for JSON) */
  links: Record<string, string[]>;
}

function storageKey(projectId: string): string {
  return `${STORAGE_KEY_PREFIX}${projectId}`;
}

function load(projectId: string): LinkStore {
  if (typeof window === 'undefined') return { links: {} };
  try {
    const raw = localStorage.getItem(storageKey(projectId));
    return raw ? (JSON.parse(raw) as LinkStore) : { links: {} };
  } catch {
    return { links: {} };
  }
}

function save(projectId: string, store: LinkStore): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(storageKey(projectId), JSON.stringify(store));
  } catch { /* ignore */ }
}

/** Get all manual links for a project. */
export function getAllLinks(projectId: string): Record<string, string[]> {
  return load(projectId).links;
}

/** Get files manually linked to a specific file. */
export function getLinkedFileIds(projectId: string, fileId: string): string[] {
  const store = load(projectId);
  return store.links[fileId] ?? [];
}

/**
 * Add a bidirectional link between two files.
 * If A is linked to B, B is also linked to A.
 */
export function addLink(projectId: string, fileIdA: string, fileIdB: string): void {
  if (fileIdA === fileIdB) return;
  const store = load(projectId);

  if (!store.links[fileIdA]) store.links[fileIdA] = [];
  if (!store.links[fileIdB]) store.links[fileIdB] = [];

  if (!store.links[fileIdA].includes(fileIdB)) store.links[fileIdA].push(fileIdB);
  if (!store.links[fileIdB].includes(fileIdA)) store.links[fileIdB].push(fileIdA);

  save(projectId, store);
}

/**
 * Remove a bidirectional link between two files.
 */
export function removeLink(projectId: string, fileIdA: string, fileIdB: string): void {
  const store = load(projectId);

  if (store.links[fileIdA]) {
    store.links[fileIdA] = store.links[fileIdA].filter((id) => id !== fileIdB);
    if (store.links[fileIdA].length === 0) delete store.links[fileIdA];
  }

  if (store.links[fileIdB]) {
    store.links[fileIdB] = store.links[fileIdB].filter((id) => id !== fileIdA);
    if (store.links[fileIdB].length === 0) delete store.links[fileIdB];
  }

  save(projectId, store);
}

/**
 * Link multiple files together (all-to-all bidirectional).
 * Useful for "link all open tabs" action.
 */
export function linkMultiple(projectId: string, fileIds: string[]): void {
  if (fileIds.length < 2) return;
  const store = load(projectId);

  for (const a of fileIds) {
    if (!store.links[a]) store.links[a] = [];
    for (const b of fileIds) {
      if (a !== b && !store.links[a].includes(b)) {
        store.links[a].push(b);
      }
    }
  }

  save(projectId, store);
}

/**
 * Remove all links for a specific file.
 * Also removes reverse links from other files.
 */
export function unlinkAll(projectId: string, fileId: string): void {
  const store = load(projectId);
  const linked = store.links[fileId] ?? [];

  // Remove reverse links
  for (const otherId of linked) {
    if (store.links[otherId]) {
      store.links[otherId] = store.links[otherId].filter((id) => id !== fileId);
      if (store.links[otherId].length === 0) delete store.links[otherId];
    }
  }

  delete store.links[fileId];
  save(projectId, store);
}

/** Check if a dismissed-groups preference exists (to avoid re-prompting). */
export function isDismissed(projectId: string, groupKey: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem(`synapse-dismissed-groups-${projectId}`);
    const set: string[] = raw ? JSON.parse(raw) : [];
    return set.includes(groupKey);
  } catch {
    return false;
  }
}

/** Remember that a group prompt was dismissed. */
export function dismissGroup(projectId: string, groupKey: string): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(`synapse-dismissed-groups-${projectId}`);
    const set: string[] = raw ? JSON.parse(raw) : [];
    if (!set.includes(groupKey)) set.push(groupKey);
    localStorage.setItem(`synapse-dismissed-groups-${projectId}`, JSON.stringify(set.slice(-200)));
  } catch { /* ignore */ }
}
