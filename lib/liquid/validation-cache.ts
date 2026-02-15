/**
 * Validation cache -- EPIC D migration
 *
 * Maps template content (by SHA-256 hash) to validation results.
 * Now delegates to CacheAdapter with a 1-hour TTL.
 * LRU eviction is handled by the cache backend (Redis TTL or memory adapter).
 */

import { createHash } from 'crypto';

import type { ValidationResult } from './validator';
import { createNamespacedCache, type CacheAdapter } from '@/lib/cache/cache-adapter';

// -- Helpers ------------------------------------------------------------------

function hashContent(template: string): string {
  return createHash('sha256').update(template).digest('hex');
}

// -- Constants ----------------------------------------------------------------

/** Validation results are keyed by content hash, so 1 hour is safe. */
const VALIDATION_TTL_MS = 3_600_000; // 1 hour

// -- Cache --------------------------------------------------------------------

export class ValidationCache {
  private adapter: CacheAdapter;

  constructor(_maxEntries?: number) {
    // maxEntries kept for backward compat but no longer used --
    // eviction is handled by TTL in the cache adapter.
    this.adapter = createNamespacedCache('val');
  }

  /**
   * Look up a cached validation result for `template`.
   * Returns `null` on cache miss.
   */
  async get(template: string): Promise<ValidationResult | null> {
    const key = hashContent(template);
    return this.adapter.get<ValidationResult>(key);
  }

  /**
   * Store a validation result for `template` with a 1-hour TTL.
   */
  async set(template: string, result: ValidationResult): Promise<void> {
    const key = hashContent(template);
    await this.adapter.set(key, result, VALIDATION_TTL_MS);
  }

  /** Remove all validation cache entries. */
  async clear(): Promise<void> {
    await this.adapter.invalidatePattern('*');
  }

  /** Return approximate number of entries (from cache stats). */
  async size(): Promise<number> {
    const s = await this.adapter.stats();
    return s.size;
  }
}
