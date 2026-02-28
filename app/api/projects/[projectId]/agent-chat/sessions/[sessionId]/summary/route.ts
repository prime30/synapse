import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { createReadClient } from '@/lib/supabase/server';
import { generateConversationSummary } from '@/lib/ai/conversation-summary';

interface RouteParams {
  params: Promise<{ projectId: string; sessionId: string }>;
}

/**
 * POST /api/projects/[projectId]/agent-chat/sessions/[sessionId]/summary
 *
 * Generate a concise conversation summary for handing off to a new chat session.
 * Uses the cheapest available model (Haiku) for cost efficiency.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(request);
    const { projectId, sessionId } = await params;
    const supabase = await createReadClient();

    const { data: session } = await supabase
      .from('ai_sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .single();

    if (!session) {
      throw new APIError('Session not found', 'NOT_FOUND', 404);
    }

    const { data: messages } = await supabase
      .from('ai_messages')
      .select('role, content')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .limit(60);

    if (!messages || messages.length === 0) {
      return successResponse({ summary: 'No messages to summarize.' });
    }

    const summary = await generateConversationSummary(
      messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content ?? '' })),
    );

    return successResponse({ summary });
  } catch (error) {
    return handleAPIError(error);
  }
}
