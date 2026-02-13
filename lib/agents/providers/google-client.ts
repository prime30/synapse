/**
 * @deprecated Use `lib/ai/providers/google.ts` (AIProviderInterface) instead.
 * This file is kept for backward compatibility but is no longer used by the Agent base class.
 */

import type { AIProviderClient } from './anthropic-client';
import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * @deprecated Use `createGoogleProvider()` from `lib/ai/providers/google.ts` instead.
 */
export function createGoogleClient(
  model = 'gemini-2.0-flash'
): AIProviderClient {
  return {
    async generateResponse(
      prompt: string,
      systemPrompt: string,
    ): Promise<string> {
      const apiKey = process.env.GOOGLE_AI_API_KEY;
      if (!apiKey) throw new Error('GOOGLE_AI_API_KEY is not set');

      const genAI = new GoogleGenerativeAI(apiKey);
      const genModel = genAI.getGenerativeModel({
        model,
        systemInstruction: systemPrompt,
      });

      const result = await genModel.generateContent(prompt);
      const response = result.response;
      return response.text();
    },
  };
}

/**
 * @deprecated Use `createGoogleProvider().stream()` from `lib/ai/providers/google.ts` instead.
 */
export async function streamGoogleResponse(
  prompt: string,
  systemPrompt: string,
  model = 'gemini-2.0-flash'
): Promise<ReadableStream<string>> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_AI_API_KEY is not set');

  const genAI = new GoogleGenerativeAI(apiKey);
  const genModel = genAI.getGenerativeModel({
    model,
    systemInstruction: systemPrompt,
  });

  const result = await genModel.generateContentStream(prompt);

  return new ReadableStream<string>({
    async start(controller) {
      try {
        for await (const chunk of result.stream) {
          const text = chunk.text();
          if (text) {
            controller.enqueue(text);
          }
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}
