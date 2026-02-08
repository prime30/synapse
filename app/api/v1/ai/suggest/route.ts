import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { requestSuggestion } from '@/lib/ai/ai-service';

export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const body = (await request.json()) as {
      prompt: string;
      context: string;
      provider?: 'openai' | 'anthropic';
    };

    const result = await requestSuggestion(
      body.prompt,
      body.context,
      body.provider
    );
    return successResponse(result);
  } catch (error) {
    return handleAPIError(error);
  }
}
