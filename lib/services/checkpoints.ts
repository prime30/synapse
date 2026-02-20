export interface CheckpointFile {
  fileId: string;
  path: string;
  content: string;
}

export interface Checkpoint {
  id: string;
  projectId: string;
  sessionId: string;
  label: string;
  createdAt: string;
  files: Map<string, CheckpointFile>;
}

const store = new Map<string, Checkpoint>();

export function createCheckpoint(
  projectId: string,
  sessionId: string,
  label: string,
  files: CheckpointFile[],
): Checkpoint {
  const id = crypto.randomUUID();
  const fileMap = new Map<string, CheckpointFile>();
  for (const f of files) {
    fileMap.set(f.fileId, f);
  }

  const checkpoint: Checkpoint = {
    id,
    projectId,
    sessionId,
    label,
    createdAt: new Date().toISOString(),
    files: fileMap,
  };

  store.set(id, checkpoint);
  return checkpoint;
}

export function listCheckpoints(projectId: string, sessionId?: string): Checkpoint[] {
  const results: Checkpoint[] = [];
  for (const cp of store.values()) {
    if (cp.projectId !== projectId) continue;
    if (sessionId && cp.sessionId !== sessionId) continue;
    results.push(cp);
  }
  results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return results;
}

export function getCheckpoint(checkpointId: string): Checkpoint | null {
  return store.get(checkpointId) ?? null;
}

export function revertToCheckpoint(checkpointId: string): CheckpointFile[] | null {
  const cp = store.get(checkpointId);
  if (!cp) return null;
  return Array.from(cp.files.values());
}

export function deleteCheckpoint(checkpointId: string): boolean {
  return store.delete(checkpointId);
}
