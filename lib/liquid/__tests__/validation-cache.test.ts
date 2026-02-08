import { describe, it, expect, beforeEach } from "vitest";

import type { ValidationResult } from "../validator";
import { ValidationCache } from "../validation-cache";

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeResult(valid: boolean): ValidationResult {
  return { valid, errors: [], warnings: [] };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("ValidationCache", () => {
  let cache: ValidationCache;

  beforeEach(() => {
    cache = new ValidationCache();
  });

  // ── Basic get / set ─────────────────────────────────────────────────────

  it("returns null on cache miss", () => {
    expect(cache.get("{% if true %}{% endif %}")).toBeNull();
  });

  it("returns cached result on cache hit", () => {
    const template = "{% if product %}yes{% endif %}";
    const result = makeResult(true);

    cache.set(template, result);
    expect(cache.get(template)).toEqual(result);
  });

  it("treats different content as a cache miss", () => {
    const template1 = "{% if a %}{% endif %}";
    const template2 = "{% if b %}{% endif %}";

    cache.set(template1, makeResult(true));
    expect(cache.get(template2)).toBeNull();
  });

  // ── LRU eviction ───────────────────────────────────────────────────────

  it("evicts the oldest entry when exceeding max size", () => {
    const smallCache = new ValidationCache(3);

    smallCache.set("template-1", makeResult(true));
    smallCache.set("template-2", makeResult(true));
    smallCache.set("template-3", makeResult(true));

    // Cache is now full (3/3). Adding a 4th should evict template-1.
    smallCache.set("template-4", makeResult(false));

    expect(smallCache.size()).toBe(3);
    expect(smallCache.get("template-1")).toBeNull();
    expect(smallCache.get("template-4")).toEqual(makeResult(false));
  });

  it("evicts at the default 1000-entry limit", () => {
    const bigCache = new ValidationCache(1000);

    for (let i = 0; i < 1000; i++) {
      bigCache.set(`t-${i}`, makeResult(true));
    }
    expect(bigCache.size()).toBe(1000);

    // Adding entry 1001 should evict t-0
    bigCache.set("t-1000", makeResult(true));
    expect(bigCache.size()).toBe(1000);
    expect(bigCache.get("t-0")).toBeNull();
    expect(bigCache.get("t-1000")).toEqual(makeResult(true));
  });

  it("refreshes an entry on get so it is not evicted next", () => {
    const smallCache = new ValidationCache(3);

    smallCache.set("a", makeResult(true));
    smallCache.set("b", makeResult(true));
    smallCache.set("c", makeResult(true));

    // Access "a" to refresh it — "b" is now the oldest
    smallCache.get("a");

    // Add "d" — should evict "b", not "a"
    smallCache.set("d", makeResult(true));

    expect(smallCache.get("a")).not.toBeNull();
    expect(smallCache.get("b")).toBeNull();
  });

  // ── clear / size ──────────────────────────────────────────────────────

  it("clear() empties the cache", () => {
    cache.set("x", makeResult(true));
    cache.set("y", makeResult(false));
    expect(cache.size()).toBe(2);

    cache.clear();
    expect(cache.size()).toBe(0);
    expect(cache.get("x")).toBeNull();
  });

  it("size() reflects the number of cached entries", () => {
    expect(cache.size()).toBe(0);
    cache.set("one", makeResult(true));
    expect(cache.size()).toBe(1);
    cache.set("two", makeResult(true));
    expect(cache.size()).toBe(2);
  });
});
