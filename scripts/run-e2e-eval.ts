/**
 * E2E Bug Eval — Tests the REAL API route, not the harness shortcut.
 *
 * Calls the actual POST handler from app/api/agents/stream/v2/route.ts
 * with real Supabase auth, real file loading, and real SSE streaming.
 * This is the same code path the user hits in the IDE.
 *
 * Usage:
 *   npx tsx scripts/run-e2e-eval.ts --project <projectId>
 *   npx tsx scripts/run-e2e-eval.ts --project <projectId> --scenario css-display-none
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const API_BASE = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// ── Test scenarios ──────────────────────────────────────────────────────

interface E2EScenario {
  id: string;
  description: string;
  prompt: string;
  intentMode: 'code' | 'debug';
  successCheck: (events: SSEEvent[]) => { passed: boolean; reason: string };
}

interface SSEEvent {
  type: string;
  [key: string]: unknown;
}

// ── Shared helpers for success checks ────────────────────────────────

const EDIT_TOOL_NAMES = [
  'search_replace', 'propose_code_edit', 'edit_lines',
  'write_file', 'create_file', 'run_specialist',
];

function isEditTool(name: string): boolean {
  return EDIT_TOOL_NAMES.some(t => name.includes(t));
}

function isDiagnosticTool(name: string): boolean {
  return name.includes('trace_rendering_chain') ||
    name.includes('diagnose_visibility') ||
    name.includes('check_theme_setting');
}

function extractPipelineInfo(events: SSEEvent[]): { tier: string; strategy: string } {
  const strategyEvent = events.find(
    e => e.type === 'thinking' && (e as SSEEvent).phase === 'strategy',
  );
  const metaEvent = events.find(
    e => e.type === 'thinking' && (e as SSEEvent).metadata &&
      ((e.metadata as Record<string, unknown>).routingTier || (e.metadata as Record<string, unknown>).strategy),
  );
  const meta = (metaEvent?.metadata ?? strategyEvent?.metadata ?? {}) as Record<string, unknown>;
  return {
    tier: String(meta.routingTier ?? meta.tier ?? 'unknown'),
    strategy: String(meta.strategy ?? 'unknown'),
  };
}

const SCENARIOS: E2EScenario[] = [
  {
    id: 'debug-cart-css',
    description: 'Debug mini-cart CSS blocking quantity changes (the exact user report)',
    prompt: 'theres a bug that users report diables cart changes. Possibly some css blocking the quantity changes. Can you check what might be breaking the mini-cart?',
    intentMode: 'debug',
    successCheck: (events) => {
      const toolCalls = events.filter(e => e.type === 'tool_call');
      const hasSearch = toolCalls.some(e => String(e.name).includes('grep') || String(e.name).includes('search'));
      const hasEdit = toolCalls.some(e => isEditTool(String(e.name)));
      const hasDiagnostic = toolCalls.some(e => isDiagnosticTool(String(e.name)));
      const totalTools = toolCalls.length;
      const hasContent = events.some(e => e.type === 'done');

      if (!hasContent) return { passed: false, reason: 'No done event — stream may have errored' };
      if (totalTools > 30) return { passed: false, reason: `Too many tool calls (${totalTools}) — agent may be looping` };
      if (!hasSearch && !hasDiagnostic) return { passed: false, reason: 'No search or diagnostic tool used' };
      if (hasEdit) return { passed: true, reason: `Made a code change in ${totalTools} tool calls` };
      if (hasDiagnostic) return { passed: true, reason: `Used diagnostic tools, ${totalTools} tool calls total` };
      return { passed: false, reason: `Searched but no edit or diagnostic (${totalTools} tool calls)` };
    },
  },
  {
    id: 'fix-header-sticky',
    description: 'Make the header sticky on scroll',
    prompt: 'Make the header sticky so it stays at the top when users scroll down',
    intentMode: 'code',
    successCheck: (events) => {
      const toolCalls = events.filter(e => e.type === 'tool_call');
      const hasEdit = toolCalls.some(e => isEditTool(String(e.name)));
      const totalTools = toolCalls.length;
      if (!hasEdit) return { passed: false, reason: 'No code change made' };
      if (totalTools > 15) return { passed: false, reason: `Too many tool calls (${totalTools})` };
      return { passed: true, reason: `Made edit in ${totalTools} tool calls` };
    },
  },
  {
    id: 'explain-liquid',
    description: 'Ask about Liquid syntax (should NOT make code changes)',
    prompt: 'What does the {% render %} tag do and how is it different from {% include %}?',
    intentMode: 'debug',
    successCheck: (events) => {
      const toolCalls = events.filter(e => e.type === 'tool_call');
      const hasEdit = toolCalls.some(e => isEditTool(String(e.name)));
      const hasContent = events.some(e => e.type === 'done');
      if (!hasContent) return { passed: false, reason: 'No done event' };
      if (hasEdit) return { passed: false, reason: 'Made code changes on an explanation request' };
      return { passed: true, reason: `Answered without editing (${toolCalls.length} tool calls)` };
    },
  },
  {
    id: 'add-trust-badges',
    description: 'Add trust badges below add-to-cart (CX improvement)',
    prompt: 'Add trust badge icons below the add-to-cart button in snippets/product-form-dynamic.liquid — add a small div with "Free shipping", "Secure checkout", and "Money-back guarantee" text after the submit button',
    intentMode: 'code',
    successCheck: (events) => {
      const toolCalls = events.filter(e => e.type === 'tool_call');
      const hasEdit = toolCalls.some(e => isEditTool(String(e.name)));
      const totalTools = toolCalls.length;
      if (!hasEdit) return { passed: false, reason: 'No code change or specialist call made' };
      return { passed: true, reason: `Made changes in ${totalTools} tool calls` };
    },
  },
  {
    id: 'change-color',
    description: 'Simple CSS change — find and update a color value',
    prompt: 'In the mini-cart CSS (assets/mini-cart.css), change the checkout button background color from var(--color-button) to #28CD56',
    intentMode: 'code',
    successCheck: (events) => {
      const toolCalls = events.filter(e => e.type === 'tool_call');
      const hasEdit = toolCalls.some(e => isEditTool(String(e.name)));
      const totalTools = toolCalls.length;
      if (!hasEdit) return { passed: false, reason: 'No code change made' };
      if (totalTools > 10) return { passed: false, reason: `Too many tool calls (${totalTools})` };
      return { passed: true, reason: `Made edit in ${totalTools} tool calls` };
    },
  },
  {
    id: 'restock-badge-lengths',
    description: 'Add available lengths under restock badge (the exact prompt that kept failing)',
    prompt: 'Add available lengths text under the "Awaiting Restock" badge when a color is out of stock in the currently selected length but available in other lengths. Show which non-color options are still available for that color.',
    intentMode: 'code',
    successCheck: (events) => {
      const toolCalls = events.filter(e => e.type === 'tool_call');
      const hasEdit = toolCalls.some(e => isEditTool(String(e.name)));
      const hasContent = events.some(e => e.type === 'done');
      const totalTools = toolCalls.length;
      if (!hasContent) return { passed: false, reason: 'No done event — stream may have errored' };
      if (!hasEdit) return { passed: false, reason: 'No code change or specialist call made' };
      if (totalTools > 25) return { passed: false, reason: `Too many tool calls (${totalTools}) — agent may be looping` };
      return { passed: true, reason: `Made changes in ${totalTools} tool calls` };
    },
  },
];

// ── Auth helper ─────────────────────────────────────────────────────────

async function getTestUserToken(projectId: string): Promise<string> {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Find the project owner
  const { data: project } = await supabase
    .from('projects')
    .select('owner_id')
    .eq('id', projectId)
    .single();

  if (!project) throw new Error(`Project ${projectId} not found`);

  // Get the user's email
  const { data: { user } } = await supabase.auth.admin.getUserById(project.owner_id);
  if (!user?.email) throw new Error(`User ${project.owner_id} not found or has no email`);

  // Generate a real session token using admin impersonation
  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: user.email,
  });
  if (linkError) throw new Error(`Failed to generate link: ${linkError.message}`);

  // Exchange the OTP token for a session
  const tokenHash = new URL(linkData.properties.action_link).searchParams.get('token');
  if (!tokenHash) throw new Error('No token in magic link');

  const { data: session, error: sessionError } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink',
  });
  if (sessionError) throw new Error(`OTP verification failed: ${sessionError.message}`);
  if (!session.session?.access_token) throw new Error('No access token in session');

  console.log(`  Auth: impersonating ${user.email} (${project.owner_id})`);
  return session.session.access_token;
}

// ── SSE stream parser ───────────────────────────────────────────────────

async function parseSSEStream(response: Response): Promise<SSEEvent[]> {
  const events: SSEEvent[] = [];
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          events.push(data);
        } catch {
          // non-JSON SSE data (raw text chunks)
          events.push({ type: 'text_chunk', text: line.slice(6) });
        }
      }
    }
  }

  return events;
}

// ── Run a single scenario ───────────────────────────────────────────────

interface ScenarioResult {
  id: string; passed: boolean; reason: string;
  toolCalls: number; elapsedMs: number;
  tier?: string; strategy?: string; editToolCount?: number;
}

async function runScenario(
  scenario: E2EScenario,
  projectId: string,
  token: string,
): Promise<ScenarioResult> {
  console.log(`\n--- ${scenario.id}: ${scenario.description} ---`);

  const start = Date.now();

  try {
    const response = await fetch(`${API_BASE}/api/agents/stream/v2`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        projectId,
        request: scenario.prompt,
        intentMode: scenario.intentMode,
        history: [],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.log(`  HTTP ${response.status}: ${text.slice(0, 200)}`);
      return { id: scenario.id, passed: false, reason: `HTTP ${response.status}`, toolCalls: 0, elapsedMs: Date.now() - start };
    }

    const events = await parseSSEStream(response);
    const elapsedMs = Date.now() - start;
    const toolCalls = events.filter(e => e.type === 'tool_call').length;
    const toolCallNames = events
      .filter(e => e.type === 'tool_call')
      .map((e) => String(e.name ?? 'unknown'));
    const result = scenario.successCheck(events);

    const pipeline = extractPipelineInfo(events);
    const editTools = toolCallNames.filter(n => isEditTool(n));
    const readTools = toolCallNames.filter(n => n.includes('read_') || n.includes('extract_region'));
    const searchTools = toolCallNames.filter(n => n.includes('search') || n.includes('grep') || n.includes('semantic'));

    console.log(`  ${result.passed ? 'PASS' : 'FAIL'}: ${result.reason} (${Math.round(elapsedMs / 1000)}s, ${toolCalls} tool calls)`);
    console.log(`  Pipeline: tier=${pipeline.tier} strategy=${pipeline.strategy}`);
    console.log(`  Tools: ${toolCallNames.join(', ') || '(none)'}`);
    console.log(`  Breakdown: ${editTools.length} edits, ${readTools.length} reads, ${searchTools.length} searches`);

    return {
      id: scenario.id, passed: result.passed, reason: result.reason,
      toolCalls, elapsedMs,
      tier: pipeline.tier, strategy: pipeline.strategy,
      editToolCount: editTools.length,
    };
  } catch (err) {
    const elapsedMs = Date.now() - start;
    const reason = err instanceof Error ? err.message : String(err);
    console.log(`  ERROR: ${reason}`);
    return { id: scenario.id, passed: false, reason, toolCalls: 0, elapsedMs };
  }
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const projectIdx = args.indexOf('--project');
  const scenarioIdx = args.indexOf('--scenario');

  if (projectIdx === -1 || !args[projectIdx + 1]) {
    console.error('Usage: npx tsx scripts/run-e2e-eval.ts --project <projectId> [--scenario <scenarioId>]');
    console.error('\nThis runs E2E tests against the REAL API route with real auth and real file loading.');
    console.error('Requires the dev server running on localhost:3000.');
    process.exit(1);
  }

  const projectId = args[projectIdx + 1];
  const scenarioFilter = scenarioIdx !== -1 ? args[scenarioIdx + 1] : null;

  console.log(`E2E Bug Eval — Real API Route`);
  console.log(`Project: ${projectId}`);
  console.log(`API: ${API_BASE}`);
  console.log(`Scenarios: ${scenarioFilter || 'all'}\n`);

  // Verify server is running
  try {
    const health = await fetch(`${API_BASE}/api/health`).catch(() => null);
    if (!health || !health.ok) {
      console.log('Checking server...');
      const fallback = await fetch(API_BASE).catch(() => null);
      if (!fallback) {
        console.error('Dev server not running. Start with: npm run dev');
        process.exit(1);
      }
    }
  } catch {
    console.error('Cannot reach dev server. Start with: npm run dev');
    process.exit(1);
  }

  const token = await getTestUserToken(projectId);
  const scenarios = scenarioFilter
    ? SCENARIOS.filter(s => s.id === scenarioFilter)
    : SCENARIOS;

  if (scenarios.length === 0) {
    console.error(`No scenario matching "${scenarioFilter}". Available: ${SCENARIOS.map(s => s.id).join(', ')}`);
    process.exit(1);
  }

  const results = [];
  for (const scenario of scenarios) {
    const result = await runScenario(scenario, projectId, token);
    results.push(result);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('E2E EVAL SUMMARY');
  console.log('='.repeat(60));

  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  const avgToolCalls = Math.round(results.reduce((s, r) => s + r.toolCalls, 0) / total);
  const avgTime = Math.round(results.reduce((s, r) => s + r.elapsedMs, 0) / total / 1000);

  for (const r of results) {
    const pipeInfo = r.tier && r.tier !== 'unknown' ? ` [${r.tier}/${r.strategy}]` : '';
    const editInfo = r.editToolCount != null ? ` (${r.editToolCount} edits)` : '';
    console.log(`  ${r.passed ? 'PASS' : 'FAIL'}  ${r.id} — ${r.reason}${editInfo} (${r.toolCalls} calls, ${Math.round(r.elapsedMs / 1000)}s)${pipeInfo}`);
  }

  console.log(`\nScore: ${passed}/${total} (${Math.round(passed / total * 100)}%)`);
  console.log(`Avg tool calls: ${avgToolCalls}`);
  console.log(`Avg time: ${avgTime}s`);

  // Write JSON report
  const report = {
    timestamp: new Date().toISOString(),
    projectId,
    scenarios: results,
    summary: { passed, total, passRate: `${Math.round(passed / total * 100)}%`, avgToolCalls, avgTimeSeconds: avgTime },
  };

  const outFile = scenarioFilter
    ? `.verification/e2e-eval-${scenarioFilter}.json`
    : '.verification/e2e-eval-summary.json';

  try {
    const { mkdirSync, writeFileSync } = await import('fs');
    mkdirSync('.verification', { recursive: true });
    writeFileSync(outFile, JSON.stringify(report, null, 2));
    console.log(`\nReport: ${outFile}`);
  } catch {
    console.log('\nReport: (could not write to disk)');
    console.log(JSON.stringify(report, null, 2));
  }

  process.exit(passed === total ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
