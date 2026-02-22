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

    const plans = await listPlans(projectId);

    return successResponse({
      plans: plans.map((p) => {
        const total = p.todos.length;
        const completed = p.todos.filter((t) => t.status === 'completed').length;
        return {
          id: p.id,
          name: p.name,
          todoProgress: { completed, total },
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
        };
      }),
    });
  } catch (error) {
    return handleAPIError(error);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(request);
    const { projectId } = await params;
    const userId = await requireProjectAccess(request, projectId);
    const body = await request.json();
    const { name, content, todos, sessionId } = body;

    const plan = await createPlan(
      projectId,
      userId,
      body.name,
      body.content,
      body.todos?.map((t) => ({ content: t.content, status: t.status })),
    );

    return successResponse({ plan }, 201);
  } catch (error) {
    return handleAPIError(error);
  }
}
