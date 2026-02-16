/**
 * @deprecated Use `lib/ai/providers/google.ts` (AIProviderInterface) instead.
 * This file is kept for backward compatibility but is no longer used by the Agent base class.
 */

import type { AIProviderClient } from './index';
import { GoogleGenAI } from '@google/genai';

/**
 * @deprecated Use `createGoogleProvider()` from `lib/ai/providers/google.ts` instead.
 */
export function createGoogleClient(
  model = 'gemini-3-flash-preview'
): AIProviderClient {
  return {
    async generateResponse(
      prompt: string,
      systemPrompt: string,
    ): Promise<string> {
      const apiKey = process.env.GOOGLE_AI_API_KEY;
      if (!apiKey) throw new Error('GOOGLE_AI_API_KEY is not set');

      const ai = new GoogleGenAI({ apiKey });
      const result = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { systemInstruction: systemPrompt },
      });

      return result.text ?? '';
    },
  };
}

/**
 * @deprecated Use `createGoogleProvider().stream()` from `lib/ai/providers/google.ts` instead.
 */
export async function streamGoogleResponse(
  prompt: string,
  systemPrompt: string,
  model = 'gemini-3-flash-preview'
): Promise<ReadableStream<string>> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_AI_API_KEY is not set');

  const ai = new GoogleGenAI({ apiKey });
  const result = await ai.models.generateContentStream({
    model,
    contents: prompt,
    config: { systemInstruction: systemPrompt },
  });

  const streamIterable = result as AsyncIterable<{ text?: string }>;

  return new ReadableStream<string>({
    async start(controller) {
      try {
        for await (const chunk of streamIterable) {
          const text = chunk.text;
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
