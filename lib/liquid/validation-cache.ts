import { createHash } from "crypto";

import type { ValidationResult } from "./validator";

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Produce a SHA-256 hex digest of the template string.
 * Used as the cache key so content changes always invalidate.
 */
function hashContent(template: string): string {
  return createHash("sha256").update(template).digest("hex");
}

// ── LRU Validation Cache ────────────────────────────────────────────────────

const DEFAULT_MAX_ENTRIES = 1000;

/**
 * An LRU cache that maps template content (by SHA-256 hash) to its
 * {@link ValidationResult}.
 *
 * Insertion order is tracked via `Map` iteration order.  When the cache
 * exceeds `maxEntries`, the *oldest* entry (first key) is evicted.
 */
export class ValidationCache {
  private cache: Map<string, ValidationResult>;
  private readonly maxEntries: number;

  constructor(maxEntries: number = DEFAULT_MAX_ENTRIES) {
    this.cache = new Map();
    this.maxEntries = maxEntries;
  }

  /**
   * Look up a cached validation result for `template`.
   * Returns `null` on cache miss.
   *
   * On a hit the entry is "refreshed" (moved to the end of the Map) so it
   * won't be the next eviction candidate.
   */
  get(template: string): ValidationResult | null {
    const key = hashContent(template);
    const result = this.cache.get(key);

    if (result === undefined) {
      return null;
    }

    // Refresh: delete + re-insert moves entry to the end
    this.cache.delete(key);
    this.cache.set(key, result);

    return result;
  }

  /**
   * Store a validation result for `template`.
   * If the cache is already at capacity the oldest entry is evicted first.
   */
  set(template: string, result: ValidationResult): void {
    const key = hashContent(template);

    // If key already exists, delete first so re-insert moves it to the end
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Evict oldest entry when at capacity
    if (this.cache.size >= this.maxEntries) {
      const oldest = this.cache.keys().next().value as string;
      this.cache.delete(oldest);
    }

    this.cache.set(key, result);
  }

  /** Remove all entries from the cache. */
  clear(): void {
    this.cache.clear();
  }

  /** Return the number of entries currently in the cache. */
  size(): number {
    return this.cache.size;
  }
}
