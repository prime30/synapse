import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { createClient, createClientFromRequest } from '@/lib/supabase/server';

interface RouteParams {
  params: Promise<{ projectId: string }>;
}

/**
 * GET /api/projects/[projectId]/agent-chat
 *
 * Load the most recent agent chat session and its messages for the
 * authenticated user on this project.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(request);
    const { projectId } = await params;
    const supabase = await createClientFromRequest(request);

    // Find recent sessions for this user + project
    const { data: sessionCandidates, error: sessionError } = await supabase
      .from('ai_sessions')
      .select('id, title, created_at, updated_at')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(100);

    if (sessionError) throw sessionError;

    const candidates = sessionCandidates ?? [];
    if (candidates.length === 0) {
      return successResponse({ session: null, messages: [] });
    }

    const sessionIds = candidates.map((s) => s.id);
    let messageCounts: Record<string, number> = {};

    const { data: countRows, error: countError } = await supabase
      .rpc('count_messages_by_session', { session_ids: sessionIds });

    if (!countError && countRows) {
      for (const row of countRows as Array<{ session_id: string; count: number }>) {
        messageCounts[row.session_id] = row.count;
      }
    } else {
      const { data: rawCounts, error: rawError } = await supabase
        .from('ai_messages')
        .select('session_id')
        .in('session_id', sessionIds);
      if (rawError) throw rawError;
      messageCounts = (rawCounts ?? []).reduce<Record<string, number>>((acc, row) => {
        acc[row.session_id] = (acc[row.session_id] ?? 0) + 1;
        return acc;
      }, {});
    }

    // Prefer the newest non-empty session; if none have messages, still return the newest session (e.g. active chat not yet persisted or count RPC wrong).
    const session =
      candidates.find((s) => (messageCounts[s.id] ?? 0) > 0) ?? candidates[0] ?? null;
    if (!session) {
      return successResponse({ session: null, messages: [] });
    }

    // Load messages for this session
    const includeMetadata = request.nextUrl.searchParams.get('includeMetadata') === 'true';
    const selectColumns = includeMetadata
      ? 'id, role, content, metadata, created_at'
      : 'id, role, content, created_at';

    const { data: messages, error: messagesError } = await supabase
      .from('ai_messages')
      .select(selectColumns)
      .eq('session_id', session.id)
      .order('created_at', { ascending: true });

    if (messagesError) throw messagesError;

    type MessageRow = { id: string; role: string; content: string; created_at: string; metadata?: unknown };
    return successResponse({
      session,
      messages: ((messages ?? []) as unknown as MessageRow[])
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          timestamp: m.created_at,
          ...(includeMetadata && m.metadata ? { metadata: m.metadata } : {}),
        })),
    });
  } catch (error) {
    return handleAPIError(error);
  }
}

const postSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1),
  /** Optional: target a specific session instead of the most recent one. */
  sessionId: z.string().uuid().optional(),
  /** Optional: structured tool call metadata for context awareness. */
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

/**
 * POST /api/projects/[projectId]/agent-chat
 *
 * Save a message to the agent chat session. Creates a new session if
 * one doesn't exist for this user + project.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(request);
    const { projectId } = await params;
    const supabase = await createClientFromRequest(request);

    const body = await request.json().catch(() => ({}));
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      throw APIError.badRequest('Invalid message: role and content required');
    }
    const { role, content, sessionId: explicitSessionId, metadata } = parsed.data;

    // Find or create session
    let sessionId: string;

    if (explicitSessionId) {
      // Verify the explicit session belongs to this user + project
      const { data: target, error: targetError } = await supabase
        .from('ai_sessions')
        .select('id')
        .eq('id', explicitSessionId)
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .maybeSingle();

      if (targetError) throw targetError;
      if (!target) throw APIError.notFound('Session not found');
      sessionId = target.id;
    } else {
      const { data: existing, error: findError } = await supabase
        .from('ai_sessions')
        .select('id')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (findError) throw findError;

      if (existing) {
        sessionId = existing.id;
      } else {
        // Create a new session
        const { data: newSession, error: createError } = await supabase
          .from('ai_sessions')
          .insert({
            project_id: projectId,
            user_id: userId,
            provider: 'anthropic',
            model: 'claude-sonnet-4-6',
            title: 'Agent Chat',
          })
          .select('id')
          .single();

        if (createError || !newSession) {
          throw new APIError(
            `Failed to create session: ${createError?.message ?? 'Unknown error'}`,
            'SESSION_CREATE_FAILED',
            500
          );
        }
        sessionId = newSession.id;
      }
    }

    // Insert the message
    const { data: message, error: insertError } = await supabase
      .from('ai_messages')
      .insert({
        session_id: sessionId,
        role,
        content,
        ...(metadata ? { metadata } : {}),
      })
      .select('id, role, content, created_at')
      .single();

    if (insertError || !message) {
      throw new APIError(
        `Failed to save message: ${insertError?.message ?? 'Unknown error'}`,
        'MESSAGE_INSERT_FAILED',
        500
      );
    }

    // Touch session updated_at
    await supabase
      .from('ai_sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', sessionId);

    return successResponse({
      id: message.id,
      role: message.role,
      content: message.content,
      timestamp: message.created_at,
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
