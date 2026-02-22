import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

type ReviewSource = 'ai_session' | 'agent_execution' | 'raw';

interface ReviewRequest {
  source: ReviewSource;
  sessionId?: string;
  executionId?: string;
  transcript?: TranscriptMessage[];
  includeRaw?: boolean;
}

interface TranscriptMessage {
  role: string;
  content: string;
  createdAt?: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const LOOKUP_HINTS = [
  'read_file',
  'search_files',
  'grep_content',
  'glob_files',
  'found matches',
  'let me read',
  'let me search',
  'get the context',
];

const MUTATION_HINTS = [
  'edited ',
  'editing file',
  'applied',
  'updated',
  'created file',
  'proposed edit',
];

const COMPLETION_HINTS = [
  "### what i've changed",
  'validation confirmation',
  'review approved',
  'completed',
  'done',
  'success',
];

function json(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function toMessagesFromExecutionLog(log: unknown): TranscriptMessage[] {
  if (!Array.isArray(log)) return [];
  return log
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const obj = item as Record<string, unknown>;
      const role = typeof obj.role === 'string' ? obj.role : null;
      const payload = obj.payload as Record<string, unknown> | undefined;
      const content =
        typeof payload?.instruction === 'string'
          ? payload.instruction
          : typeof payload?.question === 'string'
            ? payload.question
            : typeof obj.messageType === 'string'
              ? obj.messageType
              : '';
      if (!role) return null;
      return {
        role,
        content,
        createdAt: typeof obj.timestamp === 'string' ? obj.timestamp : undefined,
      };
    })
    .filter((v): v is TranscriptMessage => Boolean(v));
}

function countContains(text: string, hints: string[]): number {
  const lower = text.toLowerCase();
  let count = 0;
  for (const h of hints) {
    if (lower.includes(h)) count++;
  }
  return count;
}

function analyzeTranscript(messages: TranscriptMessage[]) {
  const total = messages.length;
  const assistant = messages.filter((m) => m.role.includes('assistant') || m.role.includes('project_manager'));
  const user = messages.filter((m) => m.role === 'user');

  let lookupBursts = 0;
  let mutationMentions = 0;
  let completionMentions = 0;
  let repeatedAssistantText = 0;
  let consecutiveLookupWithoutCompletion = 0;

  let currentLookupStreak = 0;
  const normalizedSeen = new Set<string>();

  for (const msg of assistant) {
    const content = msg.content ?? '';
    const lookup = countContains(content, LOOKUP_HINTS) > 0;
    const mutate = countContains(content, MUTATION_HINTS) > 0;
    const complete = countContains(content, COMPLETION_HINTS) > 0;

    if (lookup) {
      lookupBursts++;
      currentLookupStreak++;
    } else {
      currentLookupStreak = 0;
    }

    if (currentLookupStreak >= 3 && !complete) {
      consecutiveLookupWithoutCompletion++;
    }

    if (mutate) mutationMentions++;
    if (complete) completionMentions++;

    const normalized = content.trim().toLowerCase().replace(/\s+/g, ' ');
    if (normalized.length > 0) {
      if (normalizedSeen.has(normalized)) repeatedAssistantText++;
      normalizedSeen.add(normalized);
    }
  }

  const loopRiskScore = Math.min(
    1,
    (lookupBursts * 0.12) +
      (consecutiveLookupWithoutCompletion * 0.2) +
      (repeatedAssistantText * 0.1) -
      (completionMentions * 0.15),
  );

  const likelyLooping =
    loopRiskScore >= 0.55 ||
    (lookupBursts >= 4 && completionMentions === 0) ||
    consecutiveLookupWithoutCompletion >= 2;

  const findings: Array<{ severity: 'info' | 'warning' | 'error'; message: string }> = [];
  if (likelyLooping) {
    findings.push({
      severity: 'warning',
      message:
        'The transcript shows repeated lookup-oriented assistant steps without a clear completion signal, consistent with a lookup/edit loop.',
    });
  }
  if (repeatedAssistantText > 0) {
    findings.push({
      severity: 'info',
      message: `Detected ${repeatedAssistantText} repeated assistant message(s), which can indicate retries or stalled state transitions.`,
    });
  }
  if (mutationMentions > 0 && completionMentions === 0) {
    findings.push({
      severity: 'warning',
      message:
        'Assistant mentions edits/mutations but does not provide a final completion structure, which can feel unfinished in the IDE.',
    });
  }
  if (findings.length === 0) {
    findings.push({
      severity: 'info',
      message: 'No strong loop pattern detected from heuristic analysis.',
    });
  }

  return {
    stats: {
      totalMessages: total,
      assistantMessages: assistant.length,
      userMessages: user.length,
      lookupBursts,
      mutationMentions,
      completionMentions,
      repeatedAssistantText,
      consecutiveLookupWithoutCompletion,
      loopRiskScore: Number(loopRiskScore.toFixed(3)),
    },
    diagnosis: {
      likelyLooping,
      summary: likelyLooping
        ? 'Likely looping: repeated lookup/retry activity without stable completion.'
        : 'No major loop signal detected.',
    },
    findings,
  };
}

async function fetchSessionMessages(
  supabase: ReturnType<typeof createClient>,
  sessionId: string,
): Promise<TranscriptMessage[]> {
  const { data, error } = await supabase
    .from('ai_messages')
    .select('role,content,created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Failed to fetch ai_messages: ${error.message}`);
  return (data ?? []).map((row) => ({
    role: String((row as { role?: string }).role ?? 'unknown'),
    content: String((row as { content?: string }).content ?? ''),
    createdAt: (row as { created_at?: string }).created_at,
  }));
}

async function fetchExecutionLogMessages(
  supabase: ReturnType<typeof createClient>,
  executionId: string,
): Promise<TranscriptMessage[]> {
  const { data, error } = await supabase
    .from('agent_executions')
    .select('execution_log')
    .eq('id', executionId)
    .single();

  if (error) throw new Error(`Failed to fetch agent_executions: ${error.message}`);
  return toMessagesFromExecutionLog((data as { execution_log?: unknown })?.execution_log);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed. Use POST.' });

  try {
    const body = (await req.json()) as ReviewRequest;
    const source = body?.source;
    if (source !== 'ai_session' && source !== 'agent_execution' && source !== 'raw') {
      return json(400, {
        error: "Invalid source. Use 'ai_session', 'agent_execution', or 'raw'.",
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const authHeader = req.headers.get('Authorization');
    if (!supabaseUrl || !supabaseAnonKey) {
      return json(500, { error: 'Supabase env not configured for edge function.' });
    }
    if (!authHeader) {
      return json(401, { error: 'Missing Authorization header.' });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    let messages: TranscriptMessage[] = [];
    if (source === 'raw') {
      messages = Array.isArray(body.transcript)
        ? body.transcript
            .map((m) => ({
              role: String(m.role ?? 'unknown'),
              content: String(m.content ?? ''),
              createdAt: m.createdAt,
            }))
            .filter((m) => m.content.length > 0)
        : [];
      if (messages.length === 0) {
        return json(400, { error: 'transcript[] is required for raw source.' });
      }
    } else if (source === 'ai_session') {
      if (!body.sessionId) return json(400, { error: 'sessionId is required for ai_session source.' });
      messages = await fetchSessionMessages(supabase, body.sessionId);
    } else {
      if (!body.executionId) return json(400, { error: 'executionId is required for agent_execution source.' });
      messages = await fetchExecutionLogMessages(supabase, body.executionId);
    }

    if (messages.length === 0) {
      return json(404, { error: 'No transcript messages found for the provided identifier.' });
    }

    const analysis = analyzeTranscript(messages);
    return json(200, {
      ok: true,
      source,
      analyzedAt: new Date().toISOString(),
      messageCount: messages.length,
      analysis,
      ...(body.includeRaw ? { transcript: messages } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json(500, { error: message });
  }
});
