/**
 * Context cache with TTL and invalidation -- EPIC D migration
 *
 * Now delegates to CacheAdapter (Upstash Redis or in-memory fallback).
 * All methods are async.  Public API shape is preserved.
 */

import type { ProjectContext } from './types';
import { createNamespacedCache, type CacheAdapter } from '@/lib/cache/cache-adapter';

interface CacheStats {
  hits: number;
  misses: number;
  size: number;
}

const DEFAULT_TTL_MS = 300_000; // 5 minutes

export class ContextCache {
  private adapter: CacheAdapter;
  private ttlMs: number;

  constructor(ttlMs: number = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
    this.adapter = createNamespacedCache('ctx');
  }

  /**
   * Retrieve a cached context by project ID.
   * Returns null if the entry is expired or not found.
   */
  async get(projectId: string): Promise<ProjectContext | null> {
    return this.adapter.get<ProjectContext>(projectId);
  }

  /**
   * Store a context in the cache for the given project ID.
   */
  async set(projectId: string, context: ProjectContext): Promise<void> {
    await this.adapter.set(projectId, context, this.ttlMs);
  }

  /**
   * Remove a specific project's cached context.
   */
  async invalidate(projectId: string): Promise<void> {
    await this.adapter.delete(projectId);
  }

  /**
   * Remove all cached entries.
   */
  async clear(): Promise<void> {
    await this.adapter.invalidatePattern('*');
  }

  /**
   * Return current cache statistics.
   */
  async getStats(): Promise<CacheStats> {
    const s = await this.adapter.stats();
    return { hits: s.hits, misses: s.misses, size: s.size };
  }
}
