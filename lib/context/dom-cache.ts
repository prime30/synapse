/**
 * DOM context cache for preview bridge results.
 *
 * Stores inspection results with per-action TTLs so agents
 * don't re-scan the DOM on every query.
 */

interface DOMCacheEntry<T = unknown> {
  data: T;
  cachedAt: number;
  ttlMs: number;
}

interface DOMCacheStats {
  hits: number;
  misses: number;
  size: number;
}

/** Default TTLs per action type */
const DEFAULT_TTLS: Record<string, number> = {
  getPageSnapshot: 30_000,      // 30s — pages change on file save
  listAppElements: 600_000,     // 10 min — app elements don't change during a session
  getStylesheets: 300_000,      // 5 min — stylesheets rarely change
  inspect: 30_000,              // 30s — element state may change
  querySelector: 30_000,        // 30s
  ping: 5_000,                  // 5s
};

export class DOMContextCache {
  private cache: Map<string, DOMCacheEntry> = new Map();
  private hits = 0;
  private misses = 0;

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
  get<T = unknown>(projectId: string, action: string, selector?: string): T | null {
    const k = this.key(projectId, action, selector);
    const entry = this.cache.get(k);

    if (!entry) {
      this.misses++;
      return null;
    }

    if (Date.now() - entry.cachedAt > entry.ttlMs) {
      this.cache.delete(k);
      this.misses++;
      return null;
    }

    this.hits++;
    return entry.data as T;
  }

  /**
   * Store a result in the cache.
   */
  set<T = unknown>(projectId: string, action: string, data: T, selector?: string): void {
    const k = this.key(projectId, action, selector);
    const ttlMs = DEFAULT_TTLS[action] ?? 30_000;
    this.cache.set(k, { data, cachedAt: Date.now(), ttlMs });
  }

  /**
   * Invalidate all cached entries for a project.
   * Call this when the preview refreshes (file save).
   */
  invalidate(projectId: string): void {
    const prefix = `${projectId}:`;
    for (const k of this.cache.keys()) {
      if (k.startsWith(prefix)) {
        this.cache.delete(k);
      }
    }
  }

  /**
   * Invalidate only short-TTL entries (snapshots, inspections) but keep
   * long-lived ones (app elements, stylesheets).
   */
  invalidateVolatile(projectId: string): void {
    const prefix = `${projectId}:`;
    for (const [k, entry] of this.cache.entries()) {
      if (k.startsWith(prefix) && entry.ttlMs <= 60_000) {
        this.cache.delete(k);
      }
    }
  }

  /**
   * Get cache stats for debugging.
   */
  stats(): DOMCacheStats {
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
    };
  }

  /**
   * Clear the entire cache.
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }
}

/** Singleton instance for use across the app */
export const domCache = new DOMContextCache();
