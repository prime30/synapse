import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getAIProvider } from '@/lib/ai/get-provider';
import { requireAuth } from '@/lib/middleware/auth';
import { handleAPIError } from '@/lib/errors/handler';
import { validateBody } from '@/lib/middleware/validation';
import { checkRateLimit } from '@/lib/middleware/rate-limit';

const streamSchema = z.object({
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
    checkRateLimit(request, { windowMs: 60000, maxRequests: 20 });

    const body = await validateBody(streamSchema)(request);
    const provider = getAIProvider(body.provider);

    const stream = await provider.stream(body.messages, {
      model: body.model,
      maxTokens: body.maxTokens,
      temperature: body.temperature,
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
