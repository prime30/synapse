/**
 * Phase 8c: Drift event tracking.
 * In-memory implementation for drift feedback loop.
 */

export interface DriftEvent {
  projectId: string;
  filePath: string;
  hardcodedValue: string;
  expectedToken?: string;
  count: number;
  lastSeen: number;
}

const driftByProject = new Map<string, Map<string, DriftEvent>>();

function key(filePath: string, hardcodedValue: string): string {
  return `${filePath}:${hardcodedValue}`;
}

export function upsertDriftEvent(
  projectId: string,
  filePath: string,
  hardcodedValue: string,
  expectedToken?: string,
): void {
  const map = driftByProject.get(projectId) ?? new Map();
  const k = key(filePath, hardcodedValue);
  const existing = map.get(k);
  if (existing) {
    existing.count += 1;
    existing.lastSeen = Date.now();
    if (expectedToken) existing.expectedToken = expectedToken;
  } else {
    map.set(k, {
      projectId,
      filePath,
      hardcodedValue,
      expectedToken,
      count: 1,
      lastSeen: Date.now(),
    });
  }
  driftByProject.set(projectId, map);
}

export function getDriftEvents(
  projectId: string,
  minCount = 1,
): DriftEvent[] {
  const map = driftByProject.get(projectId);
  if (!map) return [];
  return Array.from(map.values()).filter((e) => e.count >= minCount);
}
