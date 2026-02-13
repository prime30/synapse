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
    .select('id')
    .eq('id', sessionId)
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!session) throw APIError.notFound('Session not found');
  return session;
}

/**
 * GET /api/projects/[projectId]/agent-chat/sessions/[sessionId]
 *
 * Load all messages for a specific session.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(request);
    const { projectId, sessionId } = await params;
    const supabase = await createClient();

    await verifySession(supabase, sessionId, projectId, userId);

    const { data: messages, error } = await supabase
      .from('ai_messages')
      .select('id, role, content, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return successResponse(
      (messages ?? [])
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          timestamp: m.created_at,
        })),
    );
  } catch (error) {
    return handleAPIError(error);
  }
}

const patchSchema = z.object({
  title: z.string().min(1).max(200),
});

/**
 * PATCH /api/projects/[projectId]/agent-chat/sessions/[sessionId]
 *
 * Update session title.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(request);
    const { projectId, sessionId } = await params;
    const supabase = await createClient();

    await verifySession(supabase, sessionId, projectId, userId);

    const body = await request.json().catch(() => ({}));
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      throw APIError.badRequest('title is required (1-200 chars)');
    }

    const { error } = await supabase
      .from('ai_sessions')
      .update({ title: parsed.data.title, updated_at: new Date().toISOString() })
      .eq('id', sessionId);

    if (error) throw error;

    return successResponse({ id: sessionId, title: parsed.data.title });
  } catch (error) {
    return handleAPIError(error);
  }
}

/**
 * DELETE /api/projects/[projectId]/agent-chat/sessions/[sessionId]
 *
 * Delete a session and all its messages (cascade via FK).
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(request);
    const { projectId, sessionId } = await params;
    const supabase = await createClient();

    await verifySession(supabase, sessionId, projectId, userId);

    const { error } = await supabase
      .from('ai_sessions')
      .delete()
      .eq('id', sessionId);

    if (error) throw error;

    return successResponse({ deleted: true });
  } catch (error) {
    return handleAPIError(error);
  }
}
