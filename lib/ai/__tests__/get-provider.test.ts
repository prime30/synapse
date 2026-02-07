import { describe, it, expect, vi, beforeEach } from "vitest";
import { getAIProvider } from "../get-provider";

describe("AI Provider Factory", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("should return OpenAI provider by default", () => {
    const provider = getAIProvider();
    expect(provider.name).toBe("openai");
  });

  it("should return OpenAI provider when specified", () => {
    const provider = getAIProvider("openai");
    expect(provider.name).toBe("openai");
  });

  it("should return Anthropic provider when specified", () => {
    const provider = getAIProvider("anthropic");
    expect(provider.name).toBe("anthropic");
  });

  it("should throw error for unknown provider", () => {
    expect(() => {
      getAIProvider("unknown" as "openai" | "anthropic");
    }).toThrow("Unknown AI provider: unknown");
  });
});
