const MAX_HISTORY = 20;
const STORAGE_KEY = (projectId: string) => `synapse-slash-history-${projectId}`;

export function getSlashHistory(projectId: string): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(projectId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addToSlashHistory(projectId: string, command: string): void {
  const trimmed = command.trim();
  if (!trimmed) return;
  try {
    const history = getSlashHistory(projectId);
    // Remove duplicate if exists
    const filtered = history.filter((h) => h !== trimmed);
    // Add to front
    filtered.unshift(trimmed);
    // Trim to max
    if (filtered.length > MAX_HISTORY) filtered.length = MAX_HISTORY;
    localStorage.setItem(STORAGE_KEY(projectId), JSON.stringify(filtered));
  } catch {
    // localStorage full or unavailable
  }
}

export function clearSlashHistory(projectId: string): void {
  try {
    localStorage.removeItem(STORAGE_KEY(projectId));
  } catch {
    // ignore
  }
}
