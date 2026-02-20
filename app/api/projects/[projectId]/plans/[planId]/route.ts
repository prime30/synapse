import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/middleware/auth';
import { validateBody } from '@/lib/middleware/validation';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { getPlan, updatePlan, deletePlan } from '@/lib/services/plans';

interface RouteParams {
  params: Promise<{ projectId: string; planId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth(request);
    const { planId } = await params;

    const plan = getPlan(planId);
    if (!plan) throw APIError.notFound('Plan not found');

    return successResponse({ plan });
  } catch (error) {
    return handleAPIError(error);
  }
}

const todoSchema = z.object({
  id: z.string().min(1),
  content: z.string().min(1),
  status: z.enum(['pending', 'in_progress', 'completed']),
});

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  content: z.string().optional(),
  todos: z.array(todoSchema).optional(),
});

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth(request);
    const { planId } = await params;
    const body = await validateBody(updateSchema)(request);

    const plan = updatePlan(planId, body);
    if (!plan) throw APIError.notFound('Plan not found');

    return successResponse({ plan });
  } catch (error) {
    return handleAPIError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth(request);
    const { planId } = await params;

    const deleted = deletePlan(planId);
    if (!deleted) throw APIError.notFound('Plan not found');

    return successResponse({ deleted: true });
  } catch (error) {
    return handleAPIError(error);
  }
}
