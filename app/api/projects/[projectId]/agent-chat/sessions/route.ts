import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { createClientFromRequest } from '@/lib/supabase/server';

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
    const supabase = await createClientFromRequest(request);

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

    // Fix N+1: Single aggregate query for message counts instead of
    // fetching all message rows and counting in JS.
    const sessionIds = (sessions ?? []).map((s) => s.id);
    let messageCounts: Record<string, number> = {};

    if (sessionIds.length > 0) {
      const { data: countRows, error: countError } = await supabase
        .rpc('count_messages_by_session', { session_ids: sessionIds });

      if (!countError && countRows) {
        for (const row of countRows as Array<{ session_id: string; count: number }>) {
          messageCounts[row.session_id] = row.count;
        }
      } else {
        // Fallback: single query with group-by emulation if RPC not available
        const { data: rawCounts, error: rawError } = await supabase
          .from('ai_messages')
          .select('session_id')
          .in('session_id', sessionIds);

        if (!rawError && rawCounts) {
          messageCounts = rawCounts.reduce<Record<string, number>>((acc, row) => {
            acc[row.session_id] = (acc[row.session_id] ?? 0) + 1;
            return acc;
          }, {});
        }
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
    // If ai_sessions/ai_messages missing, auth, or any DB error, return empty so UI doesn't break
    return successResponse({ sessions: [], total: 0, hasMore: false });
  }
}

const postSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  /** Reuse the newest empty active session instead of always creating a new one. */
  reuseEmpty: z.boolean().optional(),
  /** When true, cross-session memory recall is suppressed — fully clean context. */
  cleanStart: z.boolean().optional(),
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
    const supabase = await createClientFromRequest(request);

    const body = await request.json().catch(() => ({}));
    const parsed = postSchema.safeParse(body);
    const title = parsed.success ? parsed.data.title : undefined;
    const reuseEmpty = parsed.success ? Boolean(parsed.data.reuseEmpty) : false;
    const cleanStart = parsed.success ? Boolean(parsed.data.cleanStart) : false;

    if (reuseEmpty) {
      // Reuse the newest active session with zero messages to avoid piling up empty drafts.
      const { data: candidates, error: candidateError } = await supabase
        .from('ai_sessions')
        .select('id, title, created_at, updated_at')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .is('archived_at', null)
        .order('updated_at', { ascending: false })
        .limit(50);

      if (candidateError) throw candidateError;

      const sessionIds = (candidates ?? []).map((s) => s.id);
      if (sessionIds.length > 0) {
        let countsBySession: Record<string, number> = {};
        const { data: countRows, error: countError } = await supabase
          .rpc('count_messages_by_session', { session_ids: sessionIds });

        if (!countError && countRows) {
          for (const row of countRows as Array<{ session_id: string; count: number }>) {
            countsBySession[row.session_id] = row.count;
          }
        } else {
          const { data: rawCounts, error: rawError } = await supabase
            .from('ai_messages')
            .select('session_id')
            .in('session_id', sessionIds);
          if (rawError) throw rawError;
          countsBySession = (rawCounts ?? []).reduce<Record<string, number>>((acc, row) => {
            acc[row.session_id] = (acc[row.session_id] ?? 0) + 1;
            return acc;
          }, {});
        }

        const reusable = (candidates ?? []).find((s) => (countsBySession[s.id] ?? 0) === 0);
        if (reusable) {
          if (cleanStart) {
            const updateResult = await supabase
              .from('ai_sessions')
              .update({ clean_start: true, title: title ?? 'New Chat' })
              .eq('id', reusable.id);
            // If clean_start column doesn't exist yet, at least update the title
            if (updateResult.error?.message?.includes('clean_start')) {
              await supabase
                .from('ai_sessions')
                .update({ title: title ?? 'New Chat' })
                .eq('id', reusable.id);
            }
          }
          return successResponse({
            id: reusable.id,
            title: title ?? reusable.title,
            createdAt: reusable.created_at,
            updatedAt: reusable.updated_at,
            messageCount: 0,
            reused: true,
            cleanStart,
          });
        }
      }
    }

    const insertPayload: Record<string, unknown> = {
      project_id: projectId,
      user_id: userId,
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      title: title ?? 'New Chat',
    };
    if (cleanStart) insertPayload.clean_start = true;

    let { data: session, error } = await supabase
      .from('ai_sessions')
      .insert(insertPayload)
      .select('id, title, created_at, updated_at')
      .single();

    // Retry without clean_start if the column doesn't exist yet
    if (error && cleanStart && error.message?.includes('clean_start')) {
      delete insertPayload.clean_start;
      ({ data: session, error } = await supabase
        .from('ai_sessions')
        .insert(insertPayload)
        .select('id, title, created_at, updated_at')
        .single());
    }

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
      reused: false,
      cleanStart,
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
