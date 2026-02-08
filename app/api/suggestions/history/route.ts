import { NextRequest } from 'next/server';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { SuggestionApplicationService } from '@/lib/suggestions/application-service';
import type { SuggestionStatus } from '@/lib/types/suggestion';
import { APIError } from '@/lib/errors/handler';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const projectId = searchParams.get('projectId');
    const status = searchParams.get('status') as SuggestionStatus | null;
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');

    if (!projectId) {
      throw APIError.badRequest('projectId query parameter is required');
    }

    await requireProjectAccess(request, projectId);

    const limit = limitParam ? parseInt(limitParam, 10) : 20;
    const offset = offsetParam ? parseInt(offsetParam, 10) : 0;

    if (isNaN(limit) || limit < 1 || limit > 100) {
      throw APIError.badRequest('limit must be between 1 and 100');
    }
    if (isNaN(offset) || offset < 0) {
      throw APIError.badRequest('offset must be a non-negative number');
    }

    const validStatuses: SuggestionStatus[] = [
      'pending',
      'applied',
      'rejected',
      'edited',
      'undone',
    ];
    if (status && !validStatuses.includes(status)) {
      throw APIError.badRequest(
        `status must be one of: ${validStatuses.join(', ')}`,
      );
    }

    const service = new SuggestionApplicationService();
    const suggestions = await service.listSuggestions(
      projectId,
      status || undefined,
      limit,
      offset,
    );

    return successResponse(suggestions);
  } catch (error) {
    return handleAPIError(error);
  }
}
