import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { createClient } from '@/lib/supabase/server';

interface RouteParams {
  params: Promise<{ projectId: string; sessionId: string }>;
}

/**
 * Verify the session belongs to the authenticated user and project.
 */
async function verifySession(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessionId: string,
  projectId: string,
  userId: string,
) {
  const { data: session, error } = await supabase
    .from('ai_sessions')
    .select('id, title, project_id, user_id, provider, model')
    .eq('id', sessionId)
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!session) throw APIError.notFound('Session not found');
  return session;
}

const forkSchema = z.object({
  branchPointIndex: z.number().int().min(0),
});

/**
 * POST /api/projects/[projectId]/agent-chat/sessions/[sessionId]/fork
 *
 * Fork/branch a conversation at a specific message index.
 * Creates a new session with messages copied from index 0 to branchPointIndex (inclusive).
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(request);
    const { projectId, sessionId } = await params;
    const supabase = await createClient();

    // Verify the original session exists and belongs to the user
    const originalSession = await verifySession(supabase, sessionId, projectId, userId);

    // Parse and validate request body
    const body = await request.json().catch(() => ({}));
    const parsed = forkSchema.safeParse(body);
    if (!parsed.success) {
      throw APIError.badRequest('Invalid request body: branchPointIndex must be a non-negative integer');
    }

    const { branchPointIndex } = parsed.data;

    // Fetch all messages for the session, ordered by created_at
    const { data: messages, error: messagesError } = await supabase
      .from('ai_messages')
      .select('id, role, content, input_tokens, output_tokens, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (messagesError) throw messagesError;

    const messageList = messages ?? [];

    // Validate branchPointIndex is within bounds
    if (branchPointIndex >= messageList.length) {
      throw APIError.badRequest(
        'branchPointIndex out of bounds: ' + branchPointIndex + ' (session has ' + messageList.length + ' messages)'
      );
    }

    // Create new session with forked title
    const originalTitle = originalSession.title || 'Untitled Chat';
    const forkedTitle = 'Fork of ' + originalTitle;

    const { data: newSession, error: sessionError } = await supabase
      .from('ai_sessions')
      .insert({
        project_id: originalSession.project_id,
        user_id: originalSession.user_id,
        provider: originalSession.provider,
        model: originalSession.model,
        title: forkedTitle,
      })
      .select('id, title')
      .single();

    if (sessionError || !newSession) {
      throw new APIError(
        'Failed to create forked session: ' + (sessionError?.message ?? 'Unknown error'),
        'SESSION_FORK_FAILED',
        500
      );
    }

    // Copy messages from index 0 to branchPointIndex (inclusive)
    const messagesToCopy = messageList.slice(0, branchPointIndex + 1);
    
    if (messagesToCopy.length > 0) {
      const messagesToInsert = messagesToCopy.map((msg) => ({
        session_id: newSession.id,
        role: msg.role,
        content: msg.content,
        input_tokens: msg.input_tokens,
        output_tokens: msg.output_tokens,
      }));

      const { error: insertError } = await supabase
        .from('ai_messages')
        .insert(messagesToInsert);

      if (insertError) {
        // Clean up the new session if message insertion fails
        await supabase.from('ai_sessions').delete().eq('id', newSession.id);
        throw new APIError(
          'Failed to copy messages: ' + insertError.message,
          'MESSAGE_COPY_FAILED',
          500
        );
      }
    }

    return successResponse({
      id: newSession.id,
      title: newSession.title,
      parentSessionId: sessionId,
      branchPointIndex,
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
