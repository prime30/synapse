import { NextRequest } from 'next/server';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { listPlans, createPlan } from '@/lib/services/plans';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);
    const plans = await listPlans(projectId);
    return successResponse({ plans });
  } catch (error) {
    return handleAPIError(error);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    const userId = await requireProjectAccess(request, projectId);
    const body = await request.json();
    const { name, content, todos, sessionId } = body;

    if (!name || typeof name !== 'string') {
      return successResponse({ error: 'name is required' }, 400);
    }

    const plan = await createPlan(
      projectId,
      name,
      content ?? '',
      todos,
      userId,
      sessionId,
    );

    return successResponse({ plan }, 201);
  } catch (error) {
    return handleAPIError(error);
  }
}
