import { NextRequest } from 'next/server';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { validateBody } from '@/lib/middleware/validation';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { previewStateSchema } from '@/lib/api/validation';

export async function POST(request: NextRequest) {
  try {
    const body = await validateBody(previewStateSchema)(request);
    await requireProjectAccess(request, body.project_id);
    return successResponse({ refreshed: true });
  } catch (error) {
    return handleAPIError(error);
  }
}
