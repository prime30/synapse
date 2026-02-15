import { describe, it, expect, beforeEach } from "vitest";

import type { ValidationResult } from "../validator";
import { ValidationCache } from "../validation-cache";
import { setCacheAdapter, MemoryAdapter } from "@/lib/cache/cache-adapter";

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeResult(valid: boolean): ValidationResult {
  return { valid, errors: [], warnings: [] };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("ValidationCache", () => {
  let cache: ValidationCache;

  beforeEach(() => {
    // Ensure a clean memory adapter for each test
    setCacheAdapter(new MemoryAdapter());
    cache = new ValidationCache();
  });

  // ── Basic get / set ─────────────────────────────────────────────────────

  it("returns null on cache miss", async () => {
    expect(await cache.get("{% if true %}{% endif %}")).toBeNull();
  });

  it("returns cached result on cache hit", async () => {
    const template = "{% if product %}yes{% endif %}";
    const result = makeResult(true);

    await cache.set(template, result);
    expect(await cache.get(template)).toEqual(result);
  });

  it("treats different content as a cache miss", async () => {
    const template1 = "{% if a %}{% endif %}";
    const template2 = "{% if b %}{% endif %}";

    await cache.set(template1, makeResult(true));
    expect(await cache.get(template2)).toBeNull();
  });

  // ── TTL-based eviction (adapter handles expiry, no LRU) ────────────────

  it("stores and retrieves multiple entries", async () => {
    await cache.set("template-1", makeResult(true));
    await cache.set("template-2", makeResult(true));
    await cache.set("template-3", makeResult(true));
    await cache.set("template-4", makeResult(false));

    // All entries are accessible (no LRU limit in adapter mode)
    expect(await cache.get("template-4")).toEqual(makeResult(false));
  });

  // ── clear / size ──────────────────────────────────────────────────────

  it("clear() empties the cache", async () => {
    await cache.set("x", makeResult(true));
    await cache.set("y", makeResult(false));

    await cache.clear();
    expect(await cache.get("x")).toBeNull();
  });

  it("size() reflects approximate entry count", async () => {
    await cache.set("one", makeResult(true));
    await cache.set("two", makeResult(true));
    // size() returns total adapter size (may include other namespaces)
    const s = await cache.size();
    expect(s).toBeGreaterThanOrEqual(2);
  });
});
