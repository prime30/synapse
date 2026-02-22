/**
 * Short-lived TTL cache for user preferences and developer memory.
 * Avoids re-fetching from Supabase on every agent stream call within
 * a session. Write-through: every save path must call the corresponding
 * invalidate function.
 */

import { createNamespacedCache } from './cache-adapter';
import type { CacheAdapter } from './cache-adapter';

const PREF_TTL_MS = 60_000;   // 60 seconds
const MEMORY_TTL_MS = 30_000; // 30 seconds

let prefCache: CacheAdapter | null = null;
let memCache: CacheAdapter | null = null;

function getPrefCache(): CacheAdapter {
  if (!prefCache) prefCache = createNamespacedCache('user-prefs');
  return prefCache;
}

function getMemCache(): CacheAdapter {
  if (!memCache) memCache = createNamespacedCache('dev-memory');
  return memCache;
}

export async function getCachedPreferences<T>(
  userId: string,
  fetchFn: () => Promise<T>,
): Promise<T> {
  const cache = getPrefCache();
  const key = `prefs:${userId}`;
  const cached = await cache.get<T>(key);
  if (cached !== null) return cached;
  const fresh = await fetchFn();
  await cache.set(key, fresh, PREF_TTL_MS);
  return fresh;
}

export async function getCachedMemoryContext(
  userId: string,
  projectId: string,
  fetchFn: () => Promise<string>,
): Promise<string> {
  const cache = getMemCache();
  const key = `mem:${userId}:${projectId}`;
  const cached = await cache.get<string>(key);
  if (cached !== null) return cached;
  const fresh = await fetchFn();
  await cache.set(key, fresh, MEMORY_TTL_MS);
  return fresh;
}

export async function invalidatePreferences(userId: string): Promise<void> {
  const cache = getPrefCache();
  await cache.delete(`prefs:${userId}`);
}

export async function invalidateMemory(userId: string, projectId: string): Promise<void> {
  const cache = getMemCache();
  await cache.delete(`mem:${userId}:${projectId}`);
}

export async function invalidateAllMemoryForUser(userId: string): Promise<void> {
  const cache = getMemCache();
  await cache.invalidatePattern(`mem:${userId}:*`);
}
