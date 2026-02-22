import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { updatePlanTodo } from '@/lib/services/plans';

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
