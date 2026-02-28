import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { validateBody } from '@/lib/middleware/validation';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { getPlan, updatePlan, deletePlan } from '@/lib/services/plans';

interface RouteParams {
  params: Promise<{ projectId: string; planId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth(request);
    const { planId } = await params;

    const plan = await getPlan(planId);
    if (!plan) throw APIError.notFound('Plan not found');

    return successResponse({ plan });
  } catch (error) {
    return handleAPIError(error);
  }
}

const putSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  content: z.string().optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
  expectedVersion: z.number().int().min(0).optional(),
});

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(request);
    const { planId } = await params;
    const body = await validateBody(putSchema)(request);

    const result = await updatePlan(
      planId,
      userId,
      { name: body.name, content: body.content, status: body.status },
      body.expectedVersion ?? 0,
    );
    if (!result) throw APIError.notFound('Plan not found');
    if ('conflict' in result) {
      return successResponse({ conflict: true, currentVersion: result.currentVersion }, 409);
    }

    return successResponse({ plan: result });
  } catch (error) {
    return handleAPIError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth(request);
    const { planId } = await params;

    const deleted = await deletePlan(planId);
    if (!deleted) throw APIError.notFound('Plan not found');

    return successResponse({ deleted: true });
  } catch (error) {
    return handleAPIError(error);
  }
}
