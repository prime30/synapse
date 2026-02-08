import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { SuggestionApplicationService } from '@/lib/suggestions/application-service';
import { APIError } from '@/lib/errors/handler';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth(request);
    const { id } = await params;

    const service = new SuggestionApplicationService();
    const suggestion = await service.getSuggestion(id);

    if (!suggestion) {
      throw APIError.notFound('Suggestion not found');
    }

    return successResponse(suggestion);
  } catch (error) {
    return handleAPIError(error);
  }
}
