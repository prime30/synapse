import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/middleware/auth';
import { validateBody } from '@/lib/middleware/validation';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { createPlan, listPlans } from '@/lib/services/plans';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

const todoSchema = z.object({
  id: z.string().min(1),
  content: z.string().min(1),
  status: z.enum(['pending', 'in_progress', 'completed']),
});

const createSchema = z.object({
  name: z.string().min(1).max(200),
  content: z.string(),
  todos: z.array(todoSchema).optional(),
});

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth(request);
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
    const body = await validateBody(createSchema)(request);

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
