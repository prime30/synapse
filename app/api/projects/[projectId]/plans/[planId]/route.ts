import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { getPlan, updatePlan, deletePlan } from '@/lib/services/plans';

interface RouteParams {
  params: Promise<{ projectId: string; planId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, planId } = await params;
    await requireProjectAccess(request, projectId);
    const plan = await getPlan(planId);
    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }
    return successResponse({ plan });
  } catch (error) {
    return handleAPIError(error);
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, planId } = await params;
    const userId = await requireProjectAccess(request, projectId);
    const body = await request.json();
    const { name, content, status, expectedVersion } = body;

    const result = await updatePlan(
      planId,
      { name, content, status },
      userId,
      expectedVersion,
    );

    if (!result) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    if ('conflict' in result) {
      return NextResponse.json(
        { error: 'Version conflict', currentVersion: result.currentVersion },
        { status: 409 },
      );
    }

    return successResponse({ plan: result });
  } catch (error) {
    return handleAPIError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, planId } = await params;
    await requireProjectAccess(request, projectId);
    const deleted = await deletePlan(planId);
    if (!deleted) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }
    return successResponse({ deleted: true });
  } catch (error) {
    return handleAPIError(error);
  }
}
