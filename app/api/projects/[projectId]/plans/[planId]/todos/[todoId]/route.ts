import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/middleware/auth';
import { validateBody } from '@/lib/middleware/validation';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { updatePlanTodo } from '@/lib/services/plans';

interface RouteParams {
  params: Promise<{ projectId: string; planId: string; todoId: string }>;
}

const patchSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'completed']),
});

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth(request);
    const { planId, todoId } = await params;
    const body = await validateBody(patchSchema)(request);

    const plan = updatePlanTodo(planId, todoId, body.status);
    if (!plan) throw APIError.notFound('Plan or todo not found');

    return successResponse({ plan });
  } catch (error) {
    return handleAPIError(error);
  }
}
