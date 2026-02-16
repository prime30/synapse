/**
 * Nano Banana Pro (Gemini 3 Pro Image) -- Image Generation
 *
 * Uses the @google/genai unified SDK to generate images via the
 * gemini-3-pro-image-preview model. Supports:
 *  - Text-to-image generation
 *  - Reference image guidance (up to 14 images)
 *  - Up to 4K resolution output
 *  - Accurate multi-language text rendering
 */

import { GoogleGenAI } from '@google/genai';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ImageGenerationOptions {
  /** The prompt describing the image to generate. */
  prompt: string;
  /** Model override. Defaults to gemini-3-pro-image-preview. */
  model?: string;
  /** Number of images to generate (1-4). Defaults to 1. */
  numberOfImages?: number;
  /** Aspect ratio. Defaults to 16:9. */
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
  /** Reference images as base64-encoded strings with MIME types. */
  referenceImages?: Array<{ data: string; mimeType: string }>;
  /** Optional negative prompt. */
  negativePrompt?: string;
}

export interface GeneratedImage {
  /** Base64-encoded image data. */
  data: string;
  /** MIME type (image/png). */
  mimeType: string;
}

export interface ImageGenerationResult {
  images: GeneratedImage[];
  model: string;
  prompt: string;
}

/* ------------------------------------------------------------------ */
/*  Generator                                                          */
/* ------------------------------------------------------------------ */

const DEFAULT_MODEL = 'gemini-3-pro-image-preview';

export async function generateImage(
  options: ImageGenerationOptions,
  apiKey?: string,
): Promise<ImageGenerationResult> {
  const key = apiKey ?? process.env.GOOGLE_AI_API_KEY;
  if (!key) {
    throw new Error('GOOGLE_AI_API_KEY is not set');
  }

  const ai = new GoogleGenAI({ apiKey: key });
  const model = options.model ?? DEFAULT_MODEL;

  // Build content parts
  const parts: Array<Record<string, unknown>> = [];

  // Add reference images first if provided
  if (options.referenceImages && options.referenceImages.length > 0) {
    for (const ref of options.referenceImages) {
      parts.push({ inlineData: { data: ref.data, mimeType: ref.mimeType } });
    }
  }

  // Build the text prompt
  let textPrompt = options.prompt;
  if (options.negativePrompt) {
    textPrompt += '\n\nAvoid: ' + options.negativePrompt;
  }
  parts.push({ text: textPrompt });

  // Config for image generation
  const config: Record<string, unknown> = {
    responseModalities: ['IMAGE', 'TEXT'],
  };
  if (options.numberOfImages && options.numberOfImages > 1) {
    config.candidateCount = Math.min(options.numberOfImages, 4);
  }

  const response = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts }],
    config,
  });

  // Extract images from response
  const images: GeneratedImage[] = [];
  const candidates = (response as unknown as Record<string, unknown>).candidates as Array<Record<string, unknown>> | undefined;
  if (candidates) {
    for (const candidate of candidates) {
      const content = candidate.content as Record<string, unknown> | undefined;
      const responseParts = (content?.parts ?? []) as Array<Record<string, unknown>>;
      for (const part of responseParts) {
        const inlineData = part.inlineData as { data: string; mimeType: string } | undefined;
        if (inlineData) {
          images.push({
            data: inlineData.data,
            mimeType: inlineData.mimeType,
          });
        }
      }
    }
  }

  if (images.length === 0) {
    throw new Error('Image generation returned no images. The prompt may have been filtered.');
  }

  return { images, model, prompt: options.prompt };
}