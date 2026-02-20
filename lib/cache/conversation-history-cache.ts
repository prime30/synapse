/**
 * Local conversation history cache.
 *
 * Stores recent conversation turns per project on disk so that:
 * 1. Cross-turn prompt caching works (Anthropic caches matching prefixes)
 * 2. Context is preserved across page reloads / connection drops
 * 3. No Supabase round-trip to fetch conversation history
 *
 * Layout:
 *   .cache/history/{projectId}.json
 */

import fs from 'fs';
import path from 'path';

const CACHE_DIR = path.join(process.cwd(), '.cache', 'history');
const MAX_TURNS = 20;

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface ConversationCache {
  projectId: string;
  turns: ConversationTurn[];
  lastUpdated: string;
}

function ensureDir(): void {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function cachePath(projectId: string): string {
  const safe = projectId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(CACHE_DIR, safe + '.json');
}

/** Load cached conversation for a project. Returns empty if none. */
export function loadConversation(projectId: string): ConversationTurn[] {
  const p = cachePath(projectId);
  if (!fs.existsSync(p)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf-8')) as ConversationCache;
    return data.turns;
  } catch {
    return [];
  }
}

/** Append turns to the conversation cache. Trims to MAX_TURNS. */
export function appendConversation(
  projectId: string,
  newTurns: ConversationTurn[],
): void {
  ensureDir();
  let existing = loadConversation(projectId);
  existing = [...existing, ...newTurns].slice(-MAX_TURNS);
  const cache: ConversationCache = {
    projectId,
    turns: existing,
    lastUpdated: new Date().toISOString(),
  };
  fs.writeFileSync(cachePath(projectId), JSON.stringify(cache, null, 2), 'utf-8');
}

/** Clear conversation cache for a project. */
export function clearConversation(projectId: string): void {
  const p = cachePath(projectId);
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
  }
}

/**
 * Convert conversation turns to the recentMessages format
 * expected by V2CoordinatorOptions.
 */
export function turnsToRecentMessages(turns: ConversationTurn[]): string[] {
  return turns.map(t => t.content);
}
