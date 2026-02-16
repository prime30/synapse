import { GoogleGenAI } from '@google/genai';
import { AIProviderError, classifyNetworkError, formatSSEError } from '../errors';
import type {
  AIProviderInterface,
  AIMessage,
  AICompletionOptions,
  AICompletionResult,
  StreamResult,
} from '../types';

function classifyGoogleError(error: unknown): AIProviderError {
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();

  if (lower.includes('resource_exhausted')) {
    return new AIProviderError('RATE_LIMITED', msg, 'google');
  }
  if (lower.includes('invalid_argument') && lower.includes('token')) {
    return new AIProviderError('CONTEXT_TOO_LONG', msg, 'google');
  }
  if (lower.includes('permission_denied') || lower.includes('api_key_invalid')) {
    return new AIProviderError('AUTH_ERROR', msg, 'google');
  }
  if (lower.includes('safety') || lower.includes('blocked')) {
    return new AIProviderError('CONTENT_FILTERED', msg, 'google');
  }
  if (lower.includes('not_found')) {
    return new AIProviderError('MODEL_UNAVAILABLE', msg, 'google');
  }

  return classifyNetworkError(error, 'google');
}

/**
 * Map Synapse effort levels to Gemini thinking levels.
 */
function mapThinkingLevel(effort?: string): 'minimal' | 'low' | 'medium' | 'high' | undefined {
  if (!effort) return undefined;
  switch (effort) {
    case 'low': return 'low';
    case 'medium': return 'medium';
    case 'high': return 'high';
    case 'max': return 'high';
    default: return undefined;
  }
}

/**
 * Google Gemini provider using the unified @google/genai SDK.
 *
 * Supports:
 *  - Gemini 3 Flash with thinking levels
 *  - Gemini 2.0 Flash (legacy)
 *  - Streaming with token usage tracking
 */
export function createGoogleProvider(customApiKey?: string): AIProviderInterface {
  return {
    name: 'google',

    async complete(
      messages: AIMessage[],
      options?: Partial<AICompletionOptions>
    ): Promise<AICompletionResult> {
      const apiKey = customApiKey ?? process.env.GOOGLE_AI_API_KEY;
      if (!apiKey) {
        throw new AIProviderError('AUTH_ERROR', 'GOOGLE_AI_API_KEY is not set', 'google');
      }

      const model = options?.model ?? 'gemini-3-flash-preview';
      const systemMessage = messages.find((m) => m.role === 'system');
      const chatMessages = messages.filter((m) => m.role !== 'system');

      const ai = new GoogleGenAI({ apiKey });

      // Build config
      const thinkingLevel = mapThinkingLevel(options?.effort);
      const config: Record<string, unknown> = {
        maxOutputTokens: options?.maxTokens ?? 1024,
        temperature: options?.temperature ?? 0.7,
      };
      if (systemMessage) {
        config.systemInstruction = systemMessage.content;
      }
      if (thinkingLevel) {
        config.thinkingConfig = { thinkingLevel };
      }

      const prompt = chatMessages.map((m) => m.content).join('\n\n');

      let result;
      try {
        result = await ai.models.generateContent({
          model,
          contents: prompt,
          config,
        });
      } catch (error) {
        throw classifyGoogleError(error);
      }

      const content = result.text ?? '';
      if (!content) {
        throw new AIProviderError('EMPTY_RESPONSE', 'Google returned no content', 'google');
      }

      return {
        content,
        provider: 'google',
        model,
        inputTokens: result.usageMetadata?.promptTokenCount,
        outputTokens: result.usageMetadata?.candidatesTokenCount,
      };
    },

    async stream(
      messages: AIMessage[],
      options?: Partial<AICompletionOptions>
    ): Promise<StreamResult> {
      const apiKey = customApiKey ?? process.env.GOOGLE_AI_API_KEY;
      if (!apiKey) {
        throw new AIProviderError('AUTH_ERROR', 'GOOGLE_AI_API_KEY is not set', 'google');
      }

      const model = options?.model ?? 'gemini-3-flash-preview';
      const systemMessage = messages.find((m) => m.role === 'system');
      const chatMessages = messages.filter((m) => m.role !== 'system');

      const ai = new GoogleGenAI({ apiKey });

      const thinkingLevel = mapThinkingLevel(options?.effort);
      const config: Record<string, unknown> = {
        maxOutputTokens: options?.maxTokens ?? 4096,
        temperature: options?.temperature ?? 0.7,
      };
      if (systemMessage) {
        config.systemInstruction = systemMessage.content;
      }
      if (thinkingLevel) {
        config.thinkingConfig = { thinkingLevel };
      }

      const prompt = chatMessages.map((m) => m.content).join('\n\n');

      let inputTokens = 0;
      let outputTokens = 0;
      let usageResolve: (value: { inputTokens: number; outputTokens: number }) => void;
      const usagePromise = new Promise<{ inputTokens: number; outputTokens: number }>(
        (resolve) => { usageResolve = resolve; }
      );

      let streamResponse: AsyncIterable<{ text?: string; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }>;
      try {
        const result = await ai.models.generateContentStream({
          model,
          contents: prompt,
          config,
        });
        streamResponse = result as AsyncIterable<{ text?: string; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }>;
      } catch (error) {
        throw classifyGoogleError(error);
      }

      const stream = new ReadableStream<string>({
        async start(controller) {
          try {
            for await (const chunk of streamResponse) {
              const text = chunk.text;
              if (text) {
                controller.enqueue(text);
              }
              if (chunk.usageMetadata) {
                inputTokens = chunk.usageMetadata.promptTokenCount ?? 0;
                outputTokens = chunk.usageMetadata.candidatesTokenCount ?? 0;
              }
            }
            controller.close();
            usageResolve!({ inputTokens, outputTokens });
          } catch (error) {
            const providerError = classifyGoogleError(error);
            controller.enqueue(formatSSEError(providerError));
            controller.close();
            usageResolve!({ inputTokens, outputTokens });
          }
        },
      });

      return { stream, getUsage: () => usagePromise };
    },
  };
}
