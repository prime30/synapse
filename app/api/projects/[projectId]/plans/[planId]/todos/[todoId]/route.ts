import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { validateBody } from '@/lib/middleware/validation';
import { z } from 'zod';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { updatePlanTodo } from '@/lib/services/plans';

const patchSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'completed']),
});

interface RouteParams {
  params: Promise<{ projectId: string; planId: string; todoId: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(request);
    const { planId, todoId } = await params;
    const body = await validateBody(patchSchema)(request);

    const plan = await updatePlanTodo(planId, todoId, userId, body.status);
    if (!plan) throw APIError.notFound('Plan or todo not found');

    return successResponse({ plan });
  } catch (error) {
    return handleAPIError(error);
  }
}
