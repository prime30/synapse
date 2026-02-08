import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { SuggestionApplicationService } from '@/lib/suggestions/application-service';
import { APIError } from '@/lib/errors/handler';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const body = await request.json();

    const editedCode = body.editedCode;
    if (editedCode !== undefined && typeof editedCode !== 'string') {
      throw APIError.badRequest('editedCode must be a string if provided');
    }

    const service = new SuggestionApplicationService();
    const result = await service.applySuggestion(id, editedCode);

    return successResponse(result);
  } catch (error) {
    return handleAPIError(error);
  }
}
