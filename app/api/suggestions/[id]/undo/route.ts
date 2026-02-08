import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { SuggestionApplicationService } from '@/lib/suggestions/application-service';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth(request);
    const { id } = await params;

    const service = new SuggestionApplicationService();
    await service.undoSuggestion(id);

    return successResponse({ success: true });
  } catch (error) {
    return handleAPIError(error);
  }
}
