/**
 * Lightweight action history tracker for prompt suggestion scoring.
 * Tracks recent user/agent actions and which suggestions have been shown,
 * enabling frequency dampening and conversation arc detection.
 *
 * Stored in localStorage per project, capped at 50 entries.
 */

const MAX_ENTRIES = 50;
const MAX_SHOWN = 100;

export interface ActionEntry {
  type: 'code_change' | 'explanation' | 'fix' | 'test' | 'optimize' | 'deploy' | 'explore' | 'push' | 'pull' | 'implement';
  timestamp: number;
  context?: { filePath?: string; fileLanguage?: string };
}

function storageKey(projectId: string): string {
  return `synapse-action-history-${projectId}`;
}

function shownKey(projectId: string): string {
  return `synapse-shown-suggestions-${projectId}`;
}

/** Load action history from localStorage. */
export function getActionHistory(projectId: string): ActionEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(storageKey(projectId));
    return raw ? (JSON.parse(raw) as ActionEntry[]) : [];
  } catch {
    return [];
  }
}

/** Record a new action. */
export function recordAction(projectId: string, entry: ActionEntry): void {
  if (typeof window === 'undefined') return;
  try {
    const history = getActionHistory(projectId);
    history.push(entry);
    // Keep only the last N entries
    const trimmed = history.slice(-MAX_ENTRIES);
    localStorage.setItem(storageKey(projectId), JSON.stringify(trimmed));
  } catch { /* ignore */ }
}

/** Get the N most recent action types (for arc detection). */
export function getRecentActionTypes(projectId: string, n = 5): string[] {
  return getActionHistory(projectId)
    .slice(-n)
    .map((e) => e.type);
}

/** Detect the action type from an agent response. */
export function detectActionType(responseContent: string): ActionEntry['type'] {
  const lower = responseContent.toLowerCase();

  if (/\b(fix|fixed|error|bug|resolved|patched)\b/.test(lower)) return 'fix';
  if (/\b(created|added|wrote|built|implemented|modified)\b/.test(lower) && /\b(file|section|template|snippet|component)\b/.test(lower)) return 'code_change';
  if (/\b(optimiz|refactor|improv|clean|simplif)\b/.test(lower)) return 'optimize';
  if (/\b(test|verif|check|preview|render)\b/.test(lower)) return 'test';
  if (/\b(push|deploy|publish|ship)\b/.test(lower)) return 'deploy';
  if (/\b(analyz|review|audit|structur|explain)\b/.test(lower)) return 'explanation';

  return 'explanation'; // default
}

// ── Shown-suggestion tracking (frequency dampening) ──────────────────────────

/** Get the set of suggestion IDs shown in the last N turns. */
export function getRecentlyShownIds(projectId: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(shownKey(projectId));
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

/** Mark suggestion IDs as shown. */
export function markSuggestionsShown(projectId: string, ids: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = getRecentlyShownIds(projectId);
    ids.forEach((id) => existing.add(id));
    // Cap the set size
    const arr = Array.from(existing).slice(-MAX_SHOWN);
    localStorage.setItem(shownKey(projectId), JSON.stringify(arr));
  } catch { /* ignore */ }
}

/** Clear shown history (e.g. on new session). */
export function clearShownHistory(projectId: string): void {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(shownKey(projectId)); } catch { /* ignore */ }
}

// ── Per-suggestion usage stats (shown/used tracking) ─────────────────────────

export interface SuggestionStats {
  shownCount: number;
  usedCount: number;
  lastShownAt: number;
  lastUsedAt: number;
}

function statsKey(projectId: string): string {
  return `synapse-suggestion-stats-${projectId}`;
}

/** Get usage stats for all suggestions in this project. */
export function getSuggestionStats(projectId: string): Record<string, SuggestionStats> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(statsKey(projectId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Record that suggestions were shown to the user. */
export function recordSuggestionsShown(projectId: string, ids: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    const stats = getSuggestionStats(projectId);
    const now = Date.now();
    for (const id of ids) {
      const existing = stats[id] ?? { shownCount: 0, usedCount: 0, lastShownAt: 0, lastUsedAt: 0 };
      existing.shownCount++;
      existing.lastShownAt = now;
      stats[id] = existing;
    }
    localStorage.setItem(statsKey(projectId), JSON.stringify(stats));
  } catch { /* ignore */ }
}

/** Record that a suggestion was used (selected by the user). */
export function recordSuggestionUsed(projectId: string, id: string): void {
  if (typeof window === 'undefined') return;
  try {
    const stats = getSuggestionStats(projectId);
    const now = Date.now();
    const existing = stats[id] ?? { shownCount: 0, usedCount: 0, lastShownAt: 0, lastUsedAt: 0 };
    existing.usedCount++;
    existing.lastUsedAt = now;
    stats[id] = existing;
    localStorage.setItem(statsKey(projectId), JSON.stringify(stats));
  } catch { /* ignore */ }
}

/** Compute a dampening factor for a suggestion (0-1, lower = more dampened). */
export function getDampeningFactor(stats: SuggestionStats | undefined): number {
  if (!stats) return 1.0; // Never shown, no dampening
  const ratio = stats.usedCount / Math.max(stats.shownCount, 1);
  // If shown many times but rarely used, dampen heavily
  if (stats.shownCount >= 5 && ratio < 0.1) return 0.2;
  if (stats.shownCount >= 3 && ratio < 0.2) return 0.5;
  return 1.0;
}
