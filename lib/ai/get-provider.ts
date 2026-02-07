import type { AIProvider, AIProviderInterface } from "./types";
import { createOpenAIProvider } from "./providers/openai";
import { createAnthropicProvider } from "./providers/anthropic";

const providers: Partial<Record<AIProvider, AIProviderInterface>> = {};

export function getAIProvider(provider: AIProvider = "openai"): AIProviderInterface {
  if (!providers[provider]) {
    if (provider === "openai") {
      providers.openai = createOpenAIProvider();
    } else if (provider === "anthropic") {
      providers.anthropic = createAnthropicProvider();
    } else {
      throw new Error(`Unknown AI provider: ${provider}`);
    }
  }
  return providers[provider]!;
}
