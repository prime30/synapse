/**
 * Context cache with TTL and invalidation - REQ-5 TASK-4
 */

import type { ProjectContext } from './types';

interface CacheEntry {
  context: ProjectContext;
  cachedAt: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  size: number;
}

const DEFAULT_TTL_MS = 300_000; // 5 minutes

export class ContextCache {
  private cache: Map<string, CacheEntry> = new Map();
  private hits = 0;
  private misses = 0;
  private ttlMs: number;

  constructor(ttlMs: number = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
  }

  /**
   * Retrieve a cached context by project ID.
   * Returns null if the entry is expired or not found.
   * Automatically cleans expired entries.
   */
  get(projectId: string): ProjectContext | null {
    this.cleanExpired();

    const entry = this.cache.get(projectId);

    if (!entry) {
      this.misses++;
      return null;
    }

    if (this.isExpired(entry)) {
      this.cache.delete(projectId);
      this.misses++;
      return null;
    }

    this.hits++;
    return entry.context;
  }

  /**
   * Store a context in the cache for the given project ID.
   */
  set(projectId: string, context: ProjectContext): void {
    this.cache.set(projectId, {
      context,
      cachedAt: Date.now(),
    });
  }

  /**
   * Remove a specific project's cached context.
   */
  invalidate(projectId: string): void {
    this.cache.delete(projectId);
  }

  /**
   * Remove all cached entries and reset stats.
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Return current cache statistics.
   */
  getStats(): CacheStats {
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
    };
  }

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.cachedAt >= this.ttlMs;
  }

  private cleanExpired(): void {
    for (const [key, entry] of this.cache) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
      }
    }
  }
}
