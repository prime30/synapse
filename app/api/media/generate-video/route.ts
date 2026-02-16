import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { generateVideo } from '@/lib/ai/media/video-generator';

/**
 * POST /api/media/generate-video
 *
 * Generate short videos using Veo 3.1.
 * This is a long-running operation (up to 5 minutes).
 *
 * Body: {
 *   prompt: string;
 *   durationSeconds?: 4 | 6 | 8;
 *   aspectRatio?: '16:9' | '9:16';
 *   referenceImage?: { data: string; mimeType: string };
 *   generateAudio?: boolean;
 * }
 *
 * Returns: { video: { data: string; mimeType: string }, model, prompt }
 */
export const maxDuration = 300; // 5 minutes for Vercel Pro

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

    const result = await generateVideo({
      prompt: body.prompt,
      durationSeconds: body.durationSeconds,
      aspectRatio: body.aspectRatio,
      referenceImage: body.referenceImage,
      generateAudio: body.generateAudio,
    });

    return successResponse(result);
  } catch (err) {
    return handleAPIError(err);
  }
}