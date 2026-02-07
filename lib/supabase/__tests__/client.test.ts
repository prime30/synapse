import { describe, it, expect, vi, beforeEach } from "vitest";
import { createClient } from "../client";

describe("Supabase Browser Client", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("should create a browser client with environment variables", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";

    const client = createClient();
    expect(client).toBeDefined();
  });
});
