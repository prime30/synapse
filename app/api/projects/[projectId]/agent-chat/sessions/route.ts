import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { createClient } from '@/lib/supabase/server';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/**
 * GET /api/projects/[projectId]/agent-chat/sessions
 *
 * List agent chat sessions for the authenticated user on this project.
 * Ordered by updated_at desc. Includes message count per session.
 *
 * Query params:
 *   archived=true|false  (default: false — active sessions)
 *   q=...               (title ILIKE search)
 *   limit=20            (page size, max 100)
 *   offset=0            (pagination offset)
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(request);
    const { projectId } = await params;
    const supabase = await createClient();

    const url = new URL(request.url);
    const archived = url.searchParams.get('archived') === 'true';
    const q = url.searchParams.get('q')?.trim() ?? '';
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') ?? '20', 10) || 20, 1), 100);
    const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0', 10) || 0, 0);

    let query = supabase
      .from('ai_sessions')
      .select('id, title, created_at, updated_at, lines_added, lines_deleted, files_affected, archived_at', { count: 'exact' })
      .eq('project_id', projectId)
      .eq('user_id', userId);

    // Filter by archived status
    if (archived) {
      query = query.not('archived_at', 'is', null);
    } else {
      query = query.is('archived_at', null);
    }

    // Title search
    if (q) {
      query = query.ilike('title', `%${q}%`);
    }

    query = query
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: sessions, error, count } = await query;

    if (error) throw error;

    // Fetch message counts per session
    const sessionIds = (sessions ?? []).map((s) => s.id);
    let messageCounts: Record<string, number> = {};

    if (sessionIds.length > 0) {
      const { data: counts, error: countError } = await supabase
        .from('ai_messages')
        .select('session_id')
        .in('session_id', sessionIds);

      if (!countError && counts) {
        messageCounts = counts.reduce<Record<string, number>>((acc, row) => {
          acc[row.session_id] = (acc[row.session_id] ?? 0) + 1;
          return acc;
        }, {});
      }
    }

    const total = count ?? 0;
    const hasMore = offset + limit < total;

    return successResponse({
      sessions: (sessions ?? []).map((s) => ({
        id: s.id,
        title: s.title,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
        messageCount: messageCounts[s.id] ?? 0,
        linesAdded: s.lines_added ?? 0,
        linesDeleted: s.lines_deleted ?? 0,
        filesAffected: s.files_affected ?? 0,
        archivedAt: s.archived_at ?? null,
      })),
      total,
      hasMore,
    });
  } catch (error) {
    return handleAPIError(error);
  }
}

const postSchema = z.object({
  title: z.string().min(1).max(200).optional(),
});

/**
 * POST /api/projects/[projectId]/agent-chat/sessions
 *
 * Create a new empty agent chat session.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(request);
    const { projectId } = await params;
    const supabase = await createClient();

    const body = await request.json().catch(() => ({}));
    const parsed = postSchema.safeParse(body);
    const title = parsed.success ? parsed.data.title : undefined;

    const { data: session, error } = await supabase
      .from('ai_sessions')
      .insert({
        project_id: projectId,
        user_id: userId,
        provider: 'anthropic',
        model: 'claude-sonnet-4-5-20250929',
        title: title ?? 'New Chat',
      })
      .select('id, title, created_at, updated_at')
      .single();

    if (error || !session) {
      throw new APIError(
        `Failed to create session: ${error?.message ?? 'Unknown error'}`,
        'SESSION_CREATE_FAILED',
        500,
      );
    }

    return successResponse({
      id: session.id,
      title: session.title,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
      messageCount: 0,
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
