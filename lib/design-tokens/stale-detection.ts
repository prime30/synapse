/**
 * Phase 8b: File-change stale detection.
 * In-memory implementation until design_tokens_stale_since column is added to projects.
 */

const staleTimestamps = new Map<string, number>();

const TOKEN_SOURCE_PATTERNS = [
  /^config\/settings_schema\.json$/,
  /^config\/settings_data\.json$/,
  /^assets\/.*\.(css|scss)$/,
];

/** Liquid files can contain <style> or {% stylesheet %} blocks with token definitions. */
function isTokenSourceFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  if (TOKEN_SOURCE_PATTERNS.some((p) => p.test(normalized))) return true;
  return /\.liquid$/.test(normalized);
}

export function markTokensStale(projectId: string): void {
  staleTimestamps.set(projectId, Date.now());
}

export function clearTokensStale(projectId: string): void {
  staleTimestamps.delete(projectId);
}

export async function isTokensStale(projectId: string): Promise<boolean> {
  return staleTimestamps.has(projectId);
}

export function checkAndMarkStale(
  projectId: string,
  changedFiles: string[],
): void {
  const hasTokenSource = changedFiles.some(isTokenSourceFile);
  if (hasTokenSource) {
    markTokensStale(projectId);
  }
}
