import type { AIProvider, AIProviderInterface } from "./types";
import { createOpenAIProvider } from "./providers/openai";
import { createAnthropicProvider } from "./providers/anthropic";
import { createGoogleProvider } from "./providers/google";
import { createOpenAICompatProvider, type OpenAICompatConfig } from "./providers/openai-compat";

const providers: Record<string, AIProviderInterface> = {};

// EPIC E: Custom provider configs (in-memory cache, populated from env or DB)
const customProviderConfigs = new Map<string, OpenAICompatConfig>();

/**
 * Register a custom OpenAI-compatible provider at runtime.
 */
export function registerCustomProvider(config: OpenAICompatConfig): void {
  customProviderConfigs.set(config.name, config);
  // Clear cached instance so it picks up new config
  delete providers[config.name];
}

export function getAIProvider(provider: AIProvider = "openai"): AIProviderInterface {
  if (!providers[provider]) {
    if (provider === "openai") {
      providers.openai = createOpenAIProvider();
    } else if (provider === "anthropic") {
      providers.anthropic = createAnthropicProvider();
    } else if (provider === "google") {
      providers.google = createGoogleProvider();
    } else if (provider === "xai") {
      providers.xai = createOpenAICompatProvider({
        name: 'xai',
        baseURL: 'https://api.x.ai/v1',
        apiKey: process.env.XAI_API_KEY ?? '',
        defaultModel: 'grok-4',
      });
    } else if (customProviderConfigs.has(provider)) {
      // EPIC E: Custom OpenAI-compatible provider
      providers[provider] = createOpenAICompatProvider(customProviderConfigs.get(provider)!);
    } else {
      throw new Error(`Unknown AI provider: ${provider}. Register custom providers with registerCustomProvider().`);
    }
  }
  return providers[provider]!;
}
