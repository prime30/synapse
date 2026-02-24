import { NextRequest } from 'next/server';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { createClient } from '@/lib/supabase/server';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/**
 * GET /api/projects/[projectId]/agent-chat/search
 *
 * Full-text search across messages.
 * Query params: q=search_term, sessionId? (optional filter), limit=20, offset=0
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId } = await params;
    await requireProjectAccess(request, projectId);

    const url = request.nextUrl;
    const q = url.searchParams.get('q')?.trim() ?? '';
    const sessionId = url.searchParams.get('sessionId') || undefined;
    const limit = Math.min(
      Math.max(parseInt(url.searchParams.get('limit') ?? '20', 10), 1),
      100,
    );
    const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0', 10), 0);

    if (!q) {
      return successResponse({ results: [], total: 0 });
    }

    const supabase = await createClient();

    const { data: messages, error: searchError } = await supabase.rpc(
      'search_ai_messages',
      {
        p_project_id: projectId,
        p_search_term: q,
        p_session_id: sessionId || null,
        p_limit: limit,
        p_offset: offset,
      },
    );

    if (searchError) {
      if (
        searchError.code === '42883' ||
        searchError.message?.includes('function') ||
        searchError.message?.includes('does not exist')
      ) {
        return successResponse({ results: [], total: 0 });
      }
      throw APIError.internal(searchError.message);
    }

    const { data: countData, error: countError } = await supabase.rpc(
      'count_search_ai_messages',
      {
        p_project_id: projectId,
        p_search_term: q,
        p_session_id: sessionId || null,
      },
    );

    const total = countError ? (messages?.length ?? 0) : (countData as number) ?? 0;

    const results = (messages ?? []).map(
      (m: { id: string; session_id: string; role: string; content: string; created_at: string; rank: number }) => ({
        id: m.id,
        sessionId: m.session_id,
        role: m.role,
        content: m.content,
        createdAt: m.created_at,
        rank: m.rank,
      }),
    );

    return successResponse({ results, total });
  } catch (error) {
    return handleAPIError(error);
  }
}
