import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { PatternLearning } from '@/lib/agents/pattern-learning';

/** Get user preferences */
export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const fileType = request.nextUrl.searchParams.get('fileType') ?? undefined;

    const patternLearning = new PatternLearning();
    const preferences = await patternLearning.getPatterns(userId, fileType);

    return successResponse(preferences);
  } catch (error) {
    return handleAPIError(error);
  }
}

/** Update user preferences */
export async function PUT(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const body = await request.json();
    const { pattern, fileType, example, reasoning } = body;

    const patternLearning = new PatternLearning();
    await patternLearning.storePattern(userId, {
      pattern,
      fileType,
      example,
      reasoning,
    });

    return successResponse({ message: 'Preference saved' });
  } catch (error) {
    return handleAPIError(error);
  }
}
