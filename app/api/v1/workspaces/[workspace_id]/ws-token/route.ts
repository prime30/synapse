import { NextRequest } from 'next/server';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { randomBytes } from 'crypto';

interface RouteParams {
  params: Promise<{ workspace_id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { workspace_id } = await params;
    await requireProjectAccess(request, workspace_id);
    const token = randomBytes(24).toString('base64url');
    return successResponse({ token });
  } catch (error) {
    return handleAPIError(error);
  }
}
