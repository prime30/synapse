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
 * List all agent chat sessions for the authenticated user on this project.
 * Ordered by updated_at desc. Includes message count per session.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(request);
    const { projectId } = await params;
    const supabase = await createClient();

    const { data: sessions, error } = await supabase
      .from('ai_sessions')
      .select('id, title, created_at, updated_at')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

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

    return successResponse(
      (sessions ?? []).map((s) => ({
        id: s.id,
        title: s.title,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
        messageCount: messageCounts[s.id] ?? 0,
      })),
    );
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
        model: 'claude-sonnet-4-20250514',
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
