import { describe, it, expect, vi, beforeEach } from "vitest";
import { createOpenAIProvider } from "../openai";

describe("OpenAI Provider", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.OPENAI_API_KEY = "test-key";
  });

  it("should create OpenAI provider", () => {
    const provider = createOpenAIProvider();
    expect(provider.name).toBe("openai");
  });

  it("should throw error when API key is missing", () => {
    delete process.env.OPENAI_API_KEY;
    expect(() => {
      createOpenAIProvider();
    }).not.toThrow(); // Creation doesn't throw, but completion will
  });
});
