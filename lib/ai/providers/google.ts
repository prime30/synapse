import { GoogleGenerativeAI } from '@google/generative-ai';
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
 * Google Gemini provider implementing the unified AIProviderInterface.
 *
 * Uses `@google/generative-ai` SDK (AI Studio, API key only).
 * Future: Upgrade to `@google-cloud/vertexai` for enterprise rate limits.
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

      const model = options?.model ?? 'gemini-2.0-flash';
      const systemMessage = messages.find((m) => m.role === 'system');
      const chatMessages = messages.filter((m) => m.role !== 'system');

      const genAI = new GoogleGenerativeAI(apiKey);
      const genModel = genAI.getGenerativeModel({
        model,
        ...(systemMessage ? { systemInstruction: systemMessage.content } : {}),
        generationConfig: {
          maxOutputTokens: options?.maxTokens ?? 1024,
          temperature: options?.temperature ?? 0.7,
        },
      });

      const prompt = chatMessages.map((m) => m.content).join('\n\n');
      let result;
      try {
        result = await genModel.generateContent(prompt);
      } catch (error) {
        throw classifyGoogleError(error);
      }

      const response = result.response;
      const content = response.text();
      if (!content) {
        throw new AIProviderError('EMPTY_RESPONSE', 'Google returned no content', 'google');
      }

      const usageMetadata = response.usageMetadata;
      return {
        content,
        provider: 'google',
        model,
        inputTokens: usageMetadata?.promptTokenCount,
        outputTokens: usageMetadata?.candidatesTokenCount,
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

      const model = options?.model ?? 'gemini-2.0-flash';
      const systemMessage = messages.find((m) => m.role === 'system');
      const chatMessages = messages.filter((m) => m.role !== 'system');

      const genAI = new GoogleGenerativeAI(apiKey);
      const genModel = genAI.getGenerativeModel({
        model,
        ...(systemMessage ? { systemInstruction: systemMessage.content } : {}),
        generationConfig: {
          maxOutputTokens: options?.maxTokens ?? 1024,
          temperature: options?.temperature ?? 0.7,
        },
      });

      const prompt = chatMessages.map((m) => m.content).join('\n\n');
      let result;
      try {
        result = await genModel.generateContentStream(prompt);
      } catch (error) {
        throw classifyGoogleError(error);
      }

      let inputTokens = 0;
      let outputTokens = 0;
      let usageResolve: (value: { inputTokens: number; outputTokens: number }) => void;
      const usagePromise = new Promise<{ inputTokens: number; outputTokens: number }>(
        (resolve) => { usageResolve = resolve; }
      );

      const stream = new ReadableStream<string>({
        async start(controller) {
          try {
            for await (const chunk of result.stream) {
              const text = chunk.text();
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
