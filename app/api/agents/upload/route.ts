import { NextRequest } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const VISION_MODEL = 'gemini-2.5-flash';

const SYSTEM_PROMPT =
  'You are an AI assistant helping with Shopify theme development. ' +
  'Analyze the provided image in the context of web design, UI/UX, and Shopify theme building.';

/**
 * POST /api/agents/upload
 *
 * Multipart image upload for multi-modal AI input.
 * Accepts an image and optional text prompt, forwards to Gemini vision
 * for analysis, and returns the AI's response.
 *
 * EPIC 8: Multi-modal AI support.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);

    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      throw APIError.internal('Google AI API key is not configured');
    }

    const formData = await request.formData();

    const imageField = formData.get('image');
    if (!imageField || !(imageField instanceof File)) {
      throw APIError.badRequest('No image file provided', 'MISSING_IMAGE');
    }

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(imageField.type as AllowedMimeType)) {
      throw APIError.badRequest(
        `Invalid file type "${imageField.type}". Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`,
        'INVALID_FILE_TYPE',
      );
    }

    // Validate file size
    if (imageField.size > MAX_FILE_SIZE) {
      throw APIError.badRequest(
        `File too large (${(imageField.size / 1024 / 1024).toFixed(1)}MB). Maximum size is 10MB.`,
        'FILE_TOO_LARGE',
      );
    }

    const prompt = formData.get('prompt');
    const textPrompt = typeof prompt === 'string' ? prompt.trim() : '';

    // Convert image to base64
    const imageBuffer = Buffer.from(await imageField.arrayBuffer());
    const base64Image = imageBuffer.toString('base64');

    // Build Gemini request
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: VISION_MODEL,
      systemInstruction: SYSTEM_PROMPT,
    });

    const imagePart = {
      inlineData: {
        data: base64Image,
        mimeType: imageField.type,
      },
    };

    const parts: Array<{ text: string } | typeof imagePart> = [];

    if (textPrompt) {
      parts.push({ text: textPrompt });
    } else {
      parts.push({ text: 'Analyze this image.' });
    }
    parts.push(imagePart);

    const result = await model.generateContent(parts);
    const response = result.response;
    const analysis = response.text();

    return successResponse({
      analysis,
      model: VISION_MODEL,
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
