import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const sessionId = process.argv[2];
const inspectExecutionId = process.argv[3] || null;
if (!sessionId) {
  console.error('Usage: node scripts/inspect-chat-session.mjs <session-id>');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !serviceKey) {
  console.error('Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL + service key/anon key).');
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

const LOOKUP_HINTS = ['read_file', 'searching for', 'let me read', 'let me search', 'ptc:code_execution'];
const ENACT_HINTS = ['propose_code_edit', 'search_replace', 'create_file', 'edited ', 'applied', 'updated'];
const BLOCK_HINTS = ['plan-first policy', 'needs clarification', 'no code changes were applied'];

function countContains(text, hints) {
  const lower = (text || '').toLowerCase();
  return hints.reduce((sum, h) => sum + (lower.includes(h) ? 1 : 0), 0);
}

const { data: session, error: sessionErr } = await supabase
  .from('ai_sessions')
  .select('id,project_id,user_id,title,updated_at,created_at,archived_at')
  .eq('id', sessionId)
  .maybeSingle();

if (sessionErr) {
  console.error('Failed to fetch session:', sessionErr.message);
  process.exit(1);
}
if (!session) {
  console.error('Session not found.');
  process.exit(1);
}

const { data: messages, error: msgErr } = await supabase
  .from('ai_messages')
  .select('id,role,content,created_at')
  .eq('session_id', sessionId)
  .order('created_at', { ascending: true });

if (msgErr) {
  console.error('Failed to fetch messages:', msgErr.message);
  process.exit(1);
}

const assistant = (messages || []).filter((m) => String(m.role) === 'assistant');
const stats = {
  totalMessages: (messages || []).length,
  assistantMessages: assistant.length,
  lookupMentions: assistant.reduce((n, m) => n + (countContains(m.content, LOOKUP_HINTS) > 0 ? 1 : 0), 0),
  enactMentions: assistant.reduce((n, m) => n + (countContains(m.content, ENACT_HINTS) > 0 ? 1 : 0), 0),
  blockMentions: assistant.reduce((n, m) => n + (countContains(m.content, BLOCK_HINTS) > 0 ? 1 : 0), 0),
};

console.log('Session');
console.log(JSON.stringify(session, null, 2));
console.log('\nStats');
console.log(JSON.stringify(stats, null, 2));

const recent = (messages || []).slice(-18).map((m) => ({
  at: m.created_at,
  role: m.role,
  snippet: String(m.content || '').replace(/\s+/g, ' ').slice(0, 220),
}));
console.log('\nRecent messages');
for (const m of recent) {
  console.log(`- [${m.at}] ${m.role}: ${m.snippet}`);
}

const { data: executions, error: execErr } = await supabase
  .from('agent_executions')
  .select('id,status,user_request,started_at,completed_at,proposed_changes')
  .eq('project_id', session.project_id)
  .eq('user_id', session.user_id)
  .gte('started_at', new Date(new Date(session.created_at).getTime() - 60 * 60 * 1000).toISOString())
  .order('started_at', { ascending: false })
  .limit(20);

if (!execErr && executions) {
  console.log('\nRecent executions (same user/project window)');
  for (const ex of executions) {
    const changeCount = Array.isArray(ex.proposed_changes) ? ex.proposed_changes.length : 0;
    const req = String(ex.user_request || '').replace(/\s+/g, ' ').slice(0, 130);
    console.log(`- [${ex.started_at}] ${ex.status} changes=${changeCount} id=${ex.id} req="${req}"`);
  }
}

if (inspectExecutionId) {
  const { data: ex, error: exErr } = await supabase
    .from('agent_executions')
    .select('id,status,user_request,started_at,completed_at,proposed_changes,execution_log')
    .eq('id', inspectExecutionId)
    .maybeSingle();
  if (exErr) {
    console.error('\nExecution fetch failed:', exErr.message);
  } else if (ex) {
    console.log('\nExecution detail');
    const changes = Array.isArray(ex.proposed_changes) ? ex.proposed_changes.length : 0;
    console.log(`id=${ex.id} status=${ex.status} changes=${changes} started=${ex.started_at}`);
    const log = Array.isArray(ex.execution_log) ? ex.execution_log : [];
    console.log(`log entries=${log.length}`);
    for (const item of log.slice(-16)) {
      const role = String(item?.role ?? 'unknown');
      const type = String(item?.messageType ?? item?.type ?? '');
      const payload = item?.payload ?? {};
      const instruction = String(payload?.instruction ?? payload?.question ?? payload?.detail ?? '').replace(/\s+/g, ' ').slice(0, 180);
      console.log(`- ${role} ${type} ${instruction}`);
    }
  }
}
