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
    const { projectId, planId, todoId } = await params;
    await requireProjectAccess(request, projectId);
    const body = await request.json();
    const { status } = body;

    if (!status || !['pending', 'in_progress', 'completed'].includes(status)) {
      return NextResponse.json(
        { error: 'status must be pending, in_progress, or completed' },
        { status: 400 },
      );
    }

    const plan = await updatePlanTodo(planId, todoId, status);
    if (!plan) {
      return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
    }

    return successResponse({ plan });
  } catch (error) {
    return handleAPIError(error);
  }
}
