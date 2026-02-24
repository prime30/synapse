import { NextRequest } from 'next/server';
import { requireProjectAccess } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { createClient } from '@/lib/supabase/server';
import { sanitizeSummary } from '@/lib/ai/summary-sanitizer';
import { randomUUID } from 'node:crypto';

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
  userId: string
) {
  const { data: session, error } = await supabase
    .from('ai_sessions')
    .select('id, title')
    .eq('id', sessionId)
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!session) throw APIError.notFound('Session not found');
  return session;
}

/**
 * POST /api/projects/[projectId]/agent-chat/sessions/[sessionId]/share-summary
 *
 * Creates a shareable link for the session summary. Returns a token and URL.
 * The shared summary expires after 7 days.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { projectId, sessionId } = await params;
    const userId = await requireProjectAccess(request, projectId);
    const supabase = await createClient();

    const session = await verifySession(supabase, sessionId, projectId, userId);

    const { data: messages, error: messagesError } = await supabase
      .from('ai_messages')
      .select('role, content')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (messagesError) throw messagesError;

    const summaryParts = (messages ?? [])
      .filter((m) => m.role !== 'system')
      .map((m) => `[${m.role}]: ${m.content}`);
    const rawSummary = summaryParts.join('\n\n');
    const sanitizedContent = sanitizeSummary(rawSummary);

    const token = randomUUID().replace(/-/g, '');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const { error: insertError } = await supabase
      .from('shared_session_summaries')
      .insert({
        session_id: sessionId,
        token,
        sanitized_content: sanitizedContent,
        title: session.title ?? 'Session Summary',
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) throw insertError;

    return successResponse({
      token,
      url: `/s/${token}`,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
