import { createServiceClient } from '@/lib/supabase/admin';
import type { AIMessage } from '@/lib/ai/types';
import type { MessageMetadata } from '@/lib/types/database';

interface StructuredMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata: MessageMetadata | null;
  created_at: string;
}

/**
 * Persist a tool turn (assistant message with tool calls + user message with
 * tool results) to ai_messages.metadata. Non-blocking: failures are logged
 * but never propagated to callers.
 */
export async function persistToolTurn(
  sessionId: string,
  assistantToolCalls: unknown[] | undefined,
  toolResultBlocks: unknown[] | undefined,
): Promise<void> {
  try {
    const supabase = createServiceClient();

    const rows: Array<{
      session_id: string;
      role: string;
      content: string;
      metadata: MessageMetadata | null;
    }> = [];

    if (assistantToolCalls && assistantToolCalls.length > 0) {
      rows.push({
        session_id: sessionId,
        role: 'assistant',
        content: '',
        metadata: { toolCalls: assistantToolCalls as MessageMetadata['toolCalls'] },
      });
    }

    if (toolResultBlocks && toolResultBlocks.length > 0) {
      rows.push({
        session_id: sessionId,
        role: 'user',
        content: '',
        metadata: { toolResults: toolResultBlocks as MessageMetadata['toolResults'] },
      });
    }

    if (rows.length > 0) {
      const { error } = await supabase.from('ai_messages').insert(rows);
      if (error) {
        console.warn('[message-persistence] Failed to persist tool turn:', error.message);
      }
    }
  } catch (err) {
    console.warn('[message-persistence] persistToolTurn error:', err);
  }
}

/**
 * Load structured conversation history from the database, preserving actual
 * roles and tool metadata. Returns messages in chronological order.
 */
export async function loadStructuredHistory(
  sessionId: string,
  limit: number = 50,
): Promise<StructuredMessage[]> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from('ai_messages')
    .select('role, content, metadata, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.warn('[message-persistence] Failed to load structured history:', error.message);
    return [];
  }

  return (data ?? []).map((m) => ({
    role: m.role as StructuredMessage['role'],
    content: m.content ?? '',
    metadata: (m.metadata as MessageMetadata | null) ?? null,
    created_at: m.created_at,
  }));
}

/**
 * Search across past sessions for messages relevant to the current request.
 * Returns a compact summary of matching prior conversations for cross-session recall.
 */
export async function recallFromPastSessions(
  projectId: string,
  currentSessionId: string | undefined,
  query: string,
  maxResults: number = 5,
): Promise<string> {
  try {
    const supabase = createServiceClient();

    const keywords = query
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 3)
      .slice(0, 8);

    if (keywords.length === 0) return '';

    const { data: sessions } = await supabase
      .from('ai_sessions')
      .select('id, title, created_at')
      .eq('project_id', projectId)
      .neq('id', currentSessionId ?? '')
      .order('created_at', { ascending: false })
      .limit(20);

    if (!sessions || sessions.length === 0) return '';

    const sessionIds = sessions.map(s => s.id);

    const searchPattern = keywords.join(' | ');
    const { data: matches } = await supabase
      .from('ai_messages')
      .select('session_id, role, content, created_at')
      .in('session_id', sessionIds)
      .textSearch('content', searchPattern, { type: 'websearch', config: 'english' })
      .order('created_at', { ascending: false })
      .limit(maxResults * 2);

    if (!matches || matches.length === 0) {
      const { data: fallback } = await supabase
        .from('ai_messages')
        .select('session_id, role, content, created_at')
        .in('session_id', sessionIds)
        .ilike('content', `%${keywords[0]}%`)
        .order('created_at', { ascending: false })
        .limit(maxResults);

      if (!fallback || fallback.length === 0) return '';

      const sessionMap = new Map(sessions.map(s => [s.id, s]));
      const lines = fallback.slice(0, maxResults).map(m => {
        const session = sessionMap.get(m.session_id);
        const date = new Date(m.created_at).toLocaleDateString();
        const title = session?.title ?? 'Untitled';
        const excerpt = m.content.slice(0, 200).replace(/\n/g, ' ');
        return `- [${date} "${title}"] ${m.role}: ${excerpt}`;
      });

      return `Relevant context from past sessions:\n${lines.join('\n')}`;
    }

    const sessionMap = new Map(sessions.map(s => [s.id, s]));
    const seen = new Set<string>();
    const lines: string[] = [];

    for (const m of matches) {
      if (lines.length >= maxResults) break;
      const key = `${m.session_id}:${m.role}:${m.content.slice(0, 50)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const session = sessionMap.get(m.session_id);
      const date = new Date(m.created_at).toLocaleDateString();
      const title = session?.title ?? 'Untitled';
      const excerpt = m.content.slice(0, 200).replace(/\n/g, ' ');
      lines.push(`- [${date} "${title}"] ${m.role}: ${excerpt}`);
    }

    if (lines.length === 0) return '';
    return `Relevant context from past sessions:\n${lines.join('\n')}`;
  } catch (err) {
    console.warn('[message-persistence] recallFromPastSessions error:', err);
    return '';
  }
}

/**
 * Convert structured history from DB into AIMessage[] suitable for the
 * coordinator's message array. Restores __toolCalls and __toolResults
 * from the metadata column.
 *
 * Falls back to the legacy string-based approach when no sessionId is
 * available.
 */
export async function loadHistoryForCoordinator(
  sessionId: string | undefined,
  fallbackHistory?: string[],
): Promise<AIMessage[]> {
  if (!sessionId) {
    return (fallbackHistory ?? []).map((content, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content,
    }));
  }

  const structured = await loadStructuredHistory(sessionId);
  const messages: AIMessage[] = [];

  for (const msg of structured) {
    if (msg.role === 'system') continue;

    const aiMsg: AIMessage & { __toolCalls?: unknown[]; __toolResults?: unknown[] } = {
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    };

    if (msg.metadata?.toolCalls && msg.metadata.toolCalls.length > 0) {
      aiMsg.__toolCalls = msg.metadata.toolCalls;
    }
    if (msg.metadata?.toolResults && msg.metadata.toolResults.length > 0) {
      aiMsg.__toolResults = msg.metadata.toolResults;
    }

    messages.push(aiMsg as AIMessage);
  }

  return messages;
}
