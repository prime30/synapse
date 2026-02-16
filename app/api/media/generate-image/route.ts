import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { generateImage } from '@/lib/ai/media/image-generator';

/**
 * POST /api/media/generate-image
 *
 * Generate images using Nano Banana Pro (Gemini 3 Pro Image).
 *
 * Body: {
 *   prompt: string;
 *   numberOfImages?: number;   // 1-4
 *   aspectRatio?: string;      // 1:1, 16:9, 9:16, 4:3, 3:4
 *   negativePrompt?: string;
 *   referenceImages?: Array<{ data: string; mimeType: string }>;
 * }
 *
 * Returns: { images: Array<{ data: string; mimeType: string }>, model, prompt }
 */
export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const body = await request.json();

    if (!body.prompt || typeof body.prompt !== 'string') {
      throw APIError.badRequest('Missing required field: prompt');
    }

    if (body.prompt.length > 5000) {
      throw APIError.badRequest('Prompt must be under 5000 characters');
    }

    const result = await generateImage({
      prompt: body.prompt,
      numberOfImages: body.numberOfImages,
      aspectRatio: body.aspectRatio,
      negativePrompt: body.negativePrompt,
      referenceImages: body.referenceImages,
    });

    return successResponse(result);
  } catch (err) {
    return handleAPIError(err);
  }
}