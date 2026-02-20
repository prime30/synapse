import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { checkIdempotency, recordIdempotencyResponse } from '@/lib/middleware/idempotency';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { validateBody } from '@/lib/middleware/validation';
import { createFileSchema } from '@/lib/api/validation';
import { createFile } from '@/lib/services/files';

export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const idempotencyCheck = await checkIdempotency(request);
    if (idempotencyCheck.isDuplicate) return idempotencyCheck.cachedResponse;

    const body = await validateBody(createFileSchema)(request);

    const file = await createFile({
      ...body,
      created_by: userId,
    });

    const response = successResponse(file, 201);
    await recordIdempotencyResponse(request, response);
    return response;
  } catch (error) {
    return handleAPIError(error);
  }
}
