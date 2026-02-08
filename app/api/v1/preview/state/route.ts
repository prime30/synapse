import { NextRequest } from 'next/server';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { validateBody } from '@/lib/middleware/validation';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { previewStateSchema } from '@/lib/api/validation';
import { upsertPreviewState } from '@/lib/preview/state-manager';

export async function PUT(request: NextRequest) {
  try {
    const body = await validateBody(previewStateSchema)(request);
    await requireProjectAccess(request, body.project_id);
    const state = await upsertPreviewState(body);
    return successResponse(state);
  } catch (error) {
    return handleAPIError(error);
  }
}
