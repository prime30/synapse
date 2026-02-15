import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getAIProvider } from '@/lib/ai/get-provider';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { validateBody } from '@/lib/middleware/validation';
import { checkRateLimit } from '@/lib/middleware/rate-limit';

const chatSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string(),
  })),
  provider: z.enum(['openai', 'anthropic']).optional(),
  model: z.string().optional(),
  maxTokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const rateLimit = await checkRateLimit(request, { windowMs: 60000, maxRequests: 30 });
    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'X-RateLimit-Limit': String(rateLimit.limit), 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': String(Math.ceil(rateLimit.resetAt / 1000)) },
      });
    }

    const body = await validateBody(chatSchema)(request);
    const provider = getAIProvider(body.provider);

    const result = await provider.complete(body.messages, {
      model: body.model,
      maxTokens: body.maxTokens,
      temperature: body.temperature,
    });

    return successResponse(result);
  } catch (error) {
    return handleAPIError(error);
  }
}
