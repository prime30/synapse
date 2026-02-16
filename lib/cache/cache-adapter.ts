/**
 * Unified cache adapter interface -- EPIC D
 *
 * All caches in Synapse flow through this interface.  Two implementations:
 * - UpstashRedisAdapter  (production, serverless-compatible)
 * - MemoryAdapter        (local dev, tests, or when Redis is unavailable)
 *
 * Selection is automatic: if UPSTASH_REDIS_REST_URL is set, Redis is used;
 * otherwise the in-memory fallback activates.
 */

import { getRedisClient, isRedisAvailable } from './redis-client';

// -- Public interface ----------------------------------------------------------

export interface CacheAdapter {
  get<T = unknown>(key: string): Promise<T | null>;
  set<T = unknown>(key: string, value: T, ttlMs?: number): Promise<void>;
  delete(key: string): Promise<void>;
  invalidatePattern(pattern: string): Promise<void>;
  stats(): Promise<CacheStats>;
}

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  backend: 'redis' | 'memory';
}

// -- Memory adapter ------------------------------------------------------------

interface MemoryEntry {
  value: unknown;
  expiresAt: number | null; // null = no expiry
}

export class MemoryAdapter implements CacheAdapter {
  private store = new Map<string, MemoryEntry>();
  private _hits = 0;
  private _misses = 0;

  async get<T = unknown>(key: string): Promise<T | null> {
    const entry = this.store.get(key);

    if (!entry) {
      this._misses++;
      return null;
    }

    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this._misses++;
      return null;
    }

    this._hits++;
    return entry.value as T;
  }

  async set<T = unknown>(key: string, value: T, ttlMs?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: ttlMs ? Date.now() + ttlMs : null,
    });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async invalidatePattern(pattern: string): Promise<void> {
    const prefix = pattern.replace(/\*$/, '');
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  async stats(): Promise<CacheStats> {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.expiresAt !== null && now > entry.expiresAt) {
        this.store.delete(key);
      }
    }

    return {
      hits: this._hits,
      misses: this._misses,
      size: this.store.size,
      backend: 'memory',
    };
  }

  resetStats(): void {
    this._hits = 0;
    this._misses = 0;
  }

  clear(): void {
    this.store.clear();
    this._hits = 0;
    this._misses = 0;
  }
}

// -- Upstash Redis adapter -----------------------------------------------------

export class UpstashRedisAdapter implements CacheAdapter {
  private _hits = 0;
  private _misses = 0;

  async get<T = unknown>(key: string): Promise<T | null> {
    try {
      const redis = getRedisClient();
      const value = await redis.get<T>(key);

      if (value === null || value === undefined) {
        this._misses++;
        return null;
      }

      this._hits++;
      return value;
    } catch {
      this._misses++;
      return null;
    }
  }

  async set<T = unknown>(key: string, value: T, ttlMs?: number): Promise<void> {
    try {
      const redis = getRedisClient();
      if (ttlMs && ttlMs > 0) {
        await redis.set(key, value, { px: ttlMs });
      } else {
        await redis.set(key, value);
      }
    } catch {
      // Fail-open: swallow write errors
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const redis = getRedisClient();
      await redis.del(key);
    } catch {
      // Fail-open
    }
  }

  async invalidatePattern(pattern: string): Promise<void> {
    try {
      const redis = getRedisClient();
      let cursor: number = 0;
      do {
        const result = await redis.scan(cursor, { match: pattern, count: 100 }) as unknown as [number, string[]];
        cursor = result[0];
        const keys = result[1];
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      } while (cursor !== 0);
    } catch {
      // Fail-open
    }
  }

  async stats(): Promise<CacheStats> {
    let size = 0;
    try {
      const redis = getRedisClient();
      size = await redis.dbsize();
    } catch {
      // Fail-open
    }

    return {
      hits: this._hits,
      misses: this._misses,
      size,
      backend: 'redis',
    };
  }
}

// -- Factory -------------------------------------------------------------------

let _instance: CacheAdapter | null = null;

/**
 * Get the global CacheAdapter singleton.
 *
 * Uses Upstash Redis when UPSTASH_REDIS_REST_URL is set,
 * otherwise falls back to in-memory Map.
 */
export function getCacheAdapter(): CacheAdapter {
  if (_instance) return _instance;

  if (isRedisAvailable()) {
    _instance = new UpstashRedisAdapter();
  } else {
    _instance = new MemoryAdapter();
  }

  return _instance;
}

/**
 * Replace the global adapter (useful for tests).
 */
export function setCacheAdapter(adapter: CacheAdapter): void {
  _instance = adapter;
}

/**
 * Create a namespaced cache that automatically prefixes all keys.
 * Prevents key collisions between different cache consumers.
 *
 * Usage:
 *   const cache = createNamespacedCache('ctx');
 *   await cache.get('proj-123');  // actual key:  synapse:ctx:proj-123
 */
export function createNamespacedCache(namespace: string): CacheAdapter {
  const adapter = getCacheAdapter();
  const prefix = 'synapse:' + namespace + ':';

  return {
    get: <T = unknown>(key: string) => adapter.get<T>(prefix + key),
    set: <T = unknown>(key: string, value: T, ttlMs?: number) =>
      adapter.set(prefix + key, value, ttlMs),
    delete: (key: string) => adapter.delete(prefix + key),
    invalidatePattern: (pattern: string) =>
      adapter.invalidatePattern(prefix + pattern),
    stats: () => adapter.stats(),
  };
}