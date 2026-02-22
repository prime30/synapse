import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/middleware/auth';
import { successResponse } from '@/lib/api/response';
import { handleAPIError, APIError } from '@/lib/errors/handler';
import { createClient } from '@/lib/supabase/server';

interface RouteParams {
  params: Promise<{ projectId: string; sessionId: string }>;
}

type ReviewAnalysis = {
  diagnosis: {
    likelyLooping: boolean;
    summary: string;
  };
  findings: Array<{ severity: 'info' | 'warning' | 'error'; message: string }>;
  stats?: Record<string, unknown>;
};

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

function analyzeTranscriptFallback(
  transcript: Array<{ role: string; content: string; createdAt?: string }>,
): ReviewAnalysis {
  const assistant = transcript.filter((m) => m.role.includes('assistant') || m.role.includes('project_manager'));
  const lookupHints = ['read_file', 'searching for', 'let me read', 'let me search', 'ptc:code_execution'];
  const mutateHints = ['edited ', 'applied', 'updated', 'propose_code_edit', 'search_replace', 'create_file'];
  const completionHints = ['what i changed', 'completed', 'done', 'verification', 'review approved'];

  let lookupBursts = 0;
  let mutationMentions = 0;
  let completionMentions = 0;

  for (const msg of assistant) {
    const lower = (msg.content ?? '').toLowerCase();
    if (lookupHints.some((h) => lower.includes(h))) lookupBursts++;
    if (mutateHints.some((h) => lower.includes(h))) mutationMentions++;
    if (completionHints.some((h) => lower.includes(h))) completionMentions++;
  }

  const likelyLooping = lookupBursts >= 4 && completionMentions === 0;
  const findings: ReviewAnalysis['findings'] = [];
  if (likelyLooping) {
    findings.push({
      severity: 'warning',
      message:
        'Detected repeated lookup/execution activity without a stable completion signal, consistent with a loop.',
    });
  } else {
    findings.push({
      severity: 'info',
      message: 'No strong loop signal detected by fallback heuristic.',
    });
  }

  if (mutationMentions > 0 && completionMentions === 0) {
    findings.push({
      severity: 'warning',
      message: 'Edit attempts were mentioned, but no clear completion signal was detected.',
    });
  }

  return {
    diagnosis: {
      likelyLooping,
      summary: likelyLooping
        ? 'Likely looping: repeated lookup/retry behavior without stable completion.'
        : 'No major loop pattern detected by fallback review.',
    },
    findings,
    stats: {
      totalMessages: transcript.length,
      assistantMessages: assistant.length,
      lookupBursts,
      mutationMentions,
      completionMentions,
      reviewer: 'fallback-local',
    },
  };
}

/**
 * POST /api/projects/[projectId]/agent-chat/sessions/[sessionId]/review
 *
 * Calls the review-transcript edge function for this chat session and returns
 * a structured loop/CX diagnosis payload to the UI.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(request);
    const { projectId, sessionId } = await params;
    const supabase = await createClient();

    await verifySession(supabase, sessionId, projectId, userId);

    // Read messages with user-level auth, then analyze via edge function in raw mode.
    const { data: rows, error } = await supabase
      .from('ai_messages')
      .select('role,content,created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });
    if (error) throw error;

    const transcript = (rows ?? []).map((m) => ({
      role: String(m.role ?? 'unknown'),
      content: String(m.content ?? ''),
      createdAt: m.created_at ?? undefined,
    }));
    if (transcript.length === 0) {
      throw APIError.notFound('No messages found for this session');
    }

    const { data: reviewData, error: invokeError } = await supabase.functions.invoke(
      'review-transcript',
      {
        body: {
          source: 'raw',
          transcript,
          includeRaw: false,
        },
      },
    );
    const analysisFromFunction =
      (reviewData as { analysis?: ReviewAnalysis } | null | undefined)?.analysis;
    const analysis = !invokeError && analysisFromFunction
      ? analysisFromFunction
      : analyzeTranscriptFallback(transcript);

    return successResponse({
      sessionId,
      projectId,
      review: {
        analysis,
        source: invokeError ? 'fallback-local' : 'edge-function',
        ...(invokeError ? { warning: `Edge function unavailable: ${invokeError.message}` } : {}),
      },
    });
  } catch (error) {
    return handleAPIError(error);
  }
}
