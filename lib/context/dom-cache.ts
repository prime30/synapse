/**
 * DOM context cache for preview bridge results -- EPIC D migration
 *
 * Now delegates to CacheAdapter (Upstash Redis or in-memory fallback).
 * Per-action TTLs are passed through as cache TTL values.
 * All methods are async.
 */

import { createNamespacedCache, type CacheAdapter } from '@/lib/cache/cache-adapter';

interface DOMCacheStats {
  hits: number;
  misses: number;
  size: number;
}

/** Default TTLs per action type (milliseconds) */
const DEFAULT_TTLS: Record<string, number> = {
  getPageSnapshot: 30_000,      // 30s -- pages change on file save
  listAppElements: 600_000,     // 10 min -- app elements don't change during a session
  getStylesheets: 300_000,      // 5 min -- stylesheets rarely change
  inspect: 30_000,              // 30s -- element state may change
  querySelector: 30_000,        // 30s
  getConsoleLogs: 5_000,        // 5s -- console logs change frequently
  getNetworkRequests: 5_000,    // 5s -- network requests change frequently
  ping: 5_000,                  // 5s
};

export class DOMContextCache {
  private adapter: CacheAdapter;

  constructor() {
    this.adapter = createNamespacedCache('dom');
  }

  /**
   * Build a cache key from project + action + optional selector.
   */
  private key(projectId: string, action: string, selector?: string): string {
    return selector
      ? `${projectId}:${action}:${selector}`
      : `${projectId}:${action}`;
  }

  /**
   * Get a cached result. Returns null if expired or not found.
   */
  async get<T = unknown>(projectId: string, action: string, selector?: string): Promise<T | null> {
    return this.adapter.get<T>(this.key(projectId, action, selector));
  }

  /**
   * Store a result in the cache with per-action TTL.
   */
  async set<T = unknown>(projectId: string, action: string, data: T, selector?: string): Promise<void> {
    const ttlMs = DEFAULT_TTLS[action] ?? 30_000;
    await this.adapter.set(this.key(projectId, action, selector), data, ttlMs);
  }

  /**
   * Invalidate all cached entries for a project.
   * Call this when the preview refreshes (file save).
   */
  async invalidate(projectId: string): Promise<void> {
    await this.adapter.invalidatePattern(`${projectId}:*`);
  }

  /**
   * Invalidate volatile (short-TTL) entries for a project.
   *
   * Note: With a remote cache backend we cannot inspect per-key TTLs,
   * so this invalidates ALL entries for the project -- equivalent to
   * a full invalidate.  This is safe because long-lived entries will
   * be repopulated on next access.
   */
  async invalidateVolatile(projectId: string): Promise<void> {
    await this.adapter.invalidatePattern(`${projectId}:*`);
  }

  /**
   * Get cache stats for debugging.
   */
  async stats(): Promise<DOMCacheStats> {
    const s = await this.adapter.stats();
    return { hits: s.hits, misses: s.misses, size: s.size };
  }

  /**
   * Clear the entire DOM cache.
   */
  async clear(): Promise<void> {
    await this.adapter.invalidatePattern('*');
  }
}

/** Singleton instance for use across the app */
export const domCache = new DOMContextCache();
