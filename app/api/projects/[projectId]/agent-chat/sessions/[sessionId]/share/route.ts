import { NextRequest } from 'next/server';
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
    .select('id, title, project_id, user_id')
    .eq('id', sessionId)
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!session) throw APIError.notFound('Session not found');
  return session;
}

/**
 * POST /api/projects/[projectId]/agent-chat/sessions/[sessionId]/share
 *
 * Create a shareable snapshot of a conversation session.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(request);
    const { projectId, sessionId } = await params;
    const supabase = await createClient();

    // Verify session ownership
    const session = await verifySession(supabase, sessionId, projectId, userId);

    // Fetch all messages for the session
    const { data: messages, error: messagesError } = await supabase
      .from('ai_messages')
      .select('role, content, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (messagesError) throw messagesError;

    const messageList = messages ?? [];

    // Create snapshot object
    const createdAt = new Date().toISOString();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    const expiresAtISO = expiresAt.toISOString();

    const snapshot = {
      sessionId: sessionId,
      title: session.title || 'Untitled Chat',
      messages: messageList.map((msg) => ({
        role: msg.role,
        content: msg.content,
        createdAt: msg.created_at,
      })),
      createdAt: createdAt,
      expiresAt: expiresAtISO,
    };

    // Upsert snapshot (one share per session)
    const { data: sharedSnapshot, error: upsertError } = await supabase
      .from('shared_snapshots')
      .upsert(
        {
          session_id: sessionId,
          project_id: projectId,
          user_id: userId,
          snapshot: snapshot,
          created_at: createdAt,
          expires_at: expiresAtISO,
        },
        {
          onConflict: 'session_id',
        }
      )
      .select('id')
      .single();

    if (upsertError) {
      // If table doesn't exist, the error will indicate that
      // For now, we'll throw it and let the error handler deal with it
      throw new APIError(
        'Failed to create snapshot: ' + upsertError.message,
        'SNAPSHOT_CREATE_FAILED',
        500
      );
    }

    if (!sharedSnapshot) {
      throw new APIError(
        'Failed to create snapshot',
        'SNAPSHOT_CREATE_FAILED',
        500
      );
    }

    const shareUrl = '/shared/' + sharedSnapshot.id;

    return successResponse({
      shareId: sharedSnapshot.id,
      shareUrl: shareUrl,
    });
  } catch (error) {
    return handleAPIError(error);
  }
}

/**
 * GET /api/projects/[projectId]/agent-chat/sessions/[sessionId]/share
 *
 * Check if a share exists for this session.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(request);
    const { projectId, sessionId } = await params;
    const supabase = await createClient();

    // Verify session ownership
    await verifySession(supabase, sessionId, projectId, userId);

    // Check if share exists
    const { data: sharedSnapshot, error } = await supabase
      .from('shared_snapshots')
      .select('id')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (error) throw error;

    if (!sharedSnapshot) {
      throw APIError.notFound('No share found for this session');
    }

    const shareUrl = '/shared/' + sharedSnapshot.id;

    return successResponse({
      shareId: sharedSnapshot.id,
      shareUrl: shareUrl,
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
