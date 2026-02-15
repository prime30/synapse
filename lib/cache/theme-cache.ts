import { createClient } from '@/lib/supabase/server';

export interface CacheEntry<T = unknown> {
  id: string;
  project_id: string;
  cache_key: string;
  content_hash: string;
  data: T;
  expires_at: string | null;
  created_at: string;
}

/**
 * Compute a simple hash of content for cache invalidation.
 * Uses a fast FNV-1a-inspired hash (not cryptographic).
 */
export function contentHash(content: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < content.length; i++) {
    h ^= content.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Get a cached value by project + cache key.
 * Returns null if not found, expired, or content hash doesn't match.
 */
export async function getCached<T>(
  projectId: string,
  cacheKey: string,
  currentContentHash?: string,
): Promise<T | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('theme_cache')
    .select('*')
    .eq('project_id', projectId)
    .eq('cache_key', cacheKey)
    .single();

  if (!data) return null;

  // Check expiry
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    // Expired -- delete and return null
    await supabase.from('theme_cache').delete().eq('id', data.id);
    return null;
  }

  // Check content hash if provided
  if (currentContentHash && data.content_hash !== currentContentHash) {
    return null; // Content changed, cache stale
  }

  return data.data as T;
}

/**
 * Store a value in cache with optional expiry.
 */
export async function setCache<T>(
  projectId: string,
  cacheKey: string,
  data: T,
  hash: string,
  ttlMinutes?: number,
): Promise<void> {
  const supabase = await createClient();

  const expiresAt = ttlMinutes
    ? new Date(Date.now() + ttlMinutes * 60_000).toISOString()
    : null;

  // Upsert by project_id + cache_key
  const { error } = await supabase
    .from('theme_cache')
    .upsert(
      {
        project_id: projectId,
        cache_key: cacheKey,
        content_hash: hash,
        data,
        expires_at: expiresAt,
      },
      { onConflict: 'project_id,cache_key' }
    );

  if (error) {
    console.warn('[theme-cache] Failed to write cache:', error.message);
  }
}

/**
 * Invalidate (delete) a specific cache entry.
 */
export async function invalidateCache(
  projectId: string,
  cacheKey: string,
): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from('theme_cache')
    .delete()
    .eq('project_id', projectId)
    .eq('cache_key', cacheKey);
}

/**
 * Invalidate all cache entries for a project.
 * Call this when major theme changes occur (e.g., theme import).
 */
export async function invalidateProjectCache(projectId: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from('theme_cache')
    .delete()
    .eq('project_id', projectId);
}

/**
 * In-memory fallback cache for when Supabase table doesn't exist yet.
 * Used transparently when the DB table is missing.
 */
const memoryCache = new Map<string, { data: unknown; hash: string; expiresAt: number | null }>();
const MEMORY_CACHE_MAX = 200;

/**
 * Get cached value with in-memory fallback.
 * Tries Supabase first, falls back to memory cache.
 */
export async function getCachedWithFallback<T>(
  projectId: string,
  cacheKey: string,
  currentContentHash?: string,
): Promise<T | null> {
  try {
    return await getCached<T>(projectId, cacheKey, currentContentHash);
  } catch {
    // Table doesn't exist -- use memory cache
    const key = `${projectId}:${cacheKey}`;
    const entry = memoryCache.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      memoryCache.delete(key);
      return null;
    }
    if (currentContentHash && entry.hash !== currentContentHash) return null;
    return entry.data as T;
  }
}

/**
 * Set cache with in-memory fallback.
 */
export async function setCacheWithFallback<T>(
  projectId: string,
  cacheKey: string,
  data: T,
  hash: string,
  ttlMinutes?: number,
): Promise<void> {
  try {
    await setCache(projectId, cacheKey, data, hash, ttlMinutes);
  } catch {
    // Table doesn't exist -- use memory cache
    const key = `${projectId}:${cacheKey}`;
    if (memoryCache.size >= MEMORY_CACHE_MAX) {
      const firstKey = memoryCache.keys().next().value;
      if (firstKey) memoryCache.delete(firstKey);
    }
    memoryCache.set(key, {
      data,
      hash,
      expiresAt: ttlMinutes ? Date.now() + ttlMinutes * 60_000 : null,
    });
  }
}
