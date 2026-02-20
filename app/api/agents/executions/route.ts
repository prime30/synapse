import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError } from '@/lib/errors/handler';
import { createReadClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const supabase = await createReadClient();

    const projectId = request.nextUrl.searchParams.get('projectId');
    const limit = parseInt(request.nextUrl.searchParams.get('limit') ?? '20', 10);
    const page = parseInt(request.nextUrl.searchParams.get('page') ?? '1', 10);
    const offset = (page - 1) * limit;

    let query = supabase
      .from('agent_executions')
      .select('id, project_id, user_request, status, started_at, completed_at')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return successResponse(data);
  } catch (error) {
    return handleAPIError(error);
  }
}
