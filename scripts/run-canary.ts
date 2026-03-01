/**
 * Canary Test Runner — Repeatable agent reliability testing with engineering analysis.
 *
 * Snapshots a theme, runs the agent N times with the same prompt, evaluates
 * pass/fail, generates LLM-powered engineering reports, resets theme between
 * runs, and produces a combined JSON + Markdown report.
 *
 * Usage:
 *   npx tsx scripts/run-canary.ts --project <id> [--runs 5] [--scenario restock-badge-lengths]
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
 *           Dev server running on localhost:3000
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync } from 'fs';
import { takeSnapshot, resetToSnapshot } from '../lib/agents/testing/theme-snapshot';
import { structureTranscript, type CanaryTranscript } from '../lib/agents/testing/transcript-capture';
import {
  analyzeTranscript,
  analyzeAggregateRuns,
  type EngineeringReport,
} from '../lib/agents/testing/transcript-analyzer';

// ── Environment ──────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const API_BASE = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// ── Scenario Definitions ─────────────────────────────────────────────────

interface CanaryScenario {
  id: string;
  description: string;
  prompt: string;
  intentMode: 'code' | 'debug';
  maxToolCalls: number;
  requiresEditTool: boolean;
  expectedFiles: string[];
  expectedPatterns: RegExp[];
}

const EDIT_TOOL_NAMES = new Set([
  'search_replace', 'propose_code_edit', 'edit_lines',
  'write_file', 'create_file', 'run_specialist',
]);

const SCENARIOS: CanaryScenario[] = [
  {
    id: 'restock-badge-lengths',
    description: 'Add available lengths under restock badge (the exact prompt that kept failing)',
    prompt:
      'On the product page template, update product-form-dynamic so out-of-stock color swatches with "Awaiting Restock" also show a second line listing available longer lengths for that color. Implement all three layers in one pass: (1) Liquid markup in snippets/product-form-dynamic.liquid, (2) styling in assets/product-form-dynamic.css, and (3) behavior/data handling in assets/product-form-dynamic.js. The length list must come from variant option1 availability and must exclude any lengths present in the product metafield list custom_values. Ensure text contrast is background-aware over swatch images.',
    intentMode: 'code',
    // This scenario now requires coordinated Liquid + CSS + JS edits; allow a wider budget.
    maxToolCalls: 35,
    requiresEditTool: true,
    expectedFiles: [
      'snippets/product-form-dynamic.liquid',
      'assets/product-form-dynamic.css',
      'assets/product-form-dynamic.js',
    ],
    expectedPatterns: [/available.*length/i, /restock/i],
  },
];

// ── SSE Types ────────────────────────────────────────────────────────────

interface SSEEvent {
  type: string;
  [key: string]: unknown;
}

// ── Auth Helper ──────────────────────────────────────────────────────────

async function getTestUserToken(projectId: string): Promise<{ token: string; userId: string }> {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: project } = await supabase
    .from('projects')
    .select('owner_id')
    .eq('id', projectId)
    .single();
  if (!project) throw new Error(`Project ${projectId} not found`);

  const { data: { user } } = await supabase.auth.admin.getUserById(project.owner_id);
  if (!user?.email) throw new Error(`User ${project.owner_id} not found or has no email`);

  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: user.email,
  });
  if (linkError) throw new Error(`Failed to generate link: ${linkError.message}`);

  const tokenHash = new URL(linkData.properties.action_link).searchParams.get('token');
  if (!tokenHash) throw new Error('No token in magic link');

  const { data: session, error: sessionError } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink',
  });
  if (sessionError) throw new Error(`OTP verification failed: ${sessionError.message}`);
  if (!session.session?.access_token) throw new Error('No access token in session');

  console.log(`  Auth: impersonating ${user.email}`);
  return { token: session.session.access_token, userId: project.owner_id };
}

// ── SSE Stream Parser ────────────────────────────────────────────────────

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
          events.push(JSON.parse(line.slice(6)));
        } catch {
          events.push({ type: 'text_chunk', text: line.slice(6) });
        }
      }
    }
  }

  return events;
}

// ── Pass/Fail Evaluation ─────────────────────────────────────────────────

function normalizePath(input: string): string {
  return String(input || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.?\//, '')
    .toLowerCase();
}

function pathsMatch(observedPath: string, expectedPath: string): boolean {
  const observed = normalizePath(observedPath);
  const expected = normalizePath(expectedPath);
  return observed === expected || observed.endsWith(`/${expected}`) || expected.endsWith(`/${observed}`);
}

function extractChangedFiles(
  events: SSEEvent[],
  executionData?: { proposed_changes?: Array<{ fileName: string }> } | null,
): string[] {
  const changed = new Set<string>();

  for (const event of events) {
    if (event.type === 'execution_outcome') {
      const cf = event.changedFiles;
      if (Array.isArray(cf)) {
        for (const file of cf) changed.add(String(file));
      }
    }

    if (event.type === 'change_preview') {
      const changes = (event.changes ?? []) as Array<{ filePath?: string; fileName?: string }>;
      for (const ch of changes) {
        if (ch.filePath) changed.add(String(ch.filePath));
        else if (ch.fileName) changed.add(String(ch.fileName));
      }
    }

    if (event.type === 'tool_call') {
      const input = (event.input ?? {}) as Record<string, unknown>;
      const filePath = input.filePath;
      if (typeof filePath === 'string' && filePath.trim()) changed.add(filePath);
    }
  }

  const proposed = executionData?.proposed_changes ?? [];
  for (const item of proposed) {
    if (item?.fileName) changed.add(String(item.fileName));
  }

  return [...changed];
}

function evaluateRun(
  events: SSEEvent[],
  scenario: CanaryScenario,
  changedFiles: string[],
): { passed: boolean; reason: string } {
  const toolCalls = events.filter(e => e.type === 'tool_call');
  const hasEdit = toolCalls.some(e => EDIT_TOOL_NAMES.has(String(e.name)));
  const hasContent = events.some(e => e.type === 'done' || e.type === 'execution_outcome');
  const totalTools = toolCalls.length;

  if (!hasContent) return { passed: false, reason: 'No done event — stream may have errored' };
  if (scenario.requiresEditTool && !hasEdit) return { passed: false, reason: 'No code change made' };
  if (totalTools > scenario.maxToolCalls)
    return { passed: false, reason: `Too many tool calls (${totalTools}/${scenario.maxToolCalls}) — looping` };

  const missingExpectedFiles = scenario.expectedFiles.filter(
    expected => !changedFiles.some(observed => pathsMatch(observed, expected)),
  );
  if (missingExpectedFiles.length > 0) {
    return {
      passed: false,
      reason: `Missing required file edits: ${missingExpectedFiles.join(', ')}`,
    };
  }

  // For strict multi-file scenarios, required-file mutation is the primary pass signal.
  // Some runs currently report execution_outcome=no-change despite persisted file mutations.
  if (scenario.requiresEditTool && hasEdit) {
    return {
      passed: true,
      reason: `Applied required files (${scenario.expectedFiles.length}/${scenario.expectedFiles.length}) in ${totalTools} tool calls`,
    };
  }

  const outcomeEvent = events.find(e => e.type === 'execution_outcome');
  if (outcomeEvent) {
    const status = String(outcomeEvent.outcome ?? outcomeEvent.status ?? '');
    const changedCount = Number(outcomeEvent.changedFiles ?? outcomeEvent.changeCount ?? changedFiles.length ?? 0);
    if (status === 'applied' && changedCount > 0)
      return {
        passed: true,
        reason: `Applied required files (${scenario.expectedFiles.length}/${scenario.expectedFiles.length}) in ${totalTools} tool calls`,
      };
    if (status === 'blocked-policy')
      return { passed: false, reason: `Blocked by policy: ${outcomeEvent.failureReason ?? 'unknown'}` };
    if (status === 'no-change')
      return { passed: false, reason: 'Agent completed but made no changes' };
  }

  if (hasEdit) return { passed: true, reason: `Made edit in ${totalTools} tool calls` };
  return { passed: false, reason: `No outcome or edit detected (${totalTools} tool calls)` };
}

// ── Pipeline info extraction ─────────────────────────────────────────────

function extractPipelineInfo(events: SSEEvent[]): { tier: string; strategy: string } {
  const metaEvent = events.find(
    e => e.type === 'thinking' && e.metadata &&
      ((e.metadata as Record<string, unknown>).routingTier || (e.metadata as Record<string, unknown>).strategy),
  );
  const meta = (metaEvent?.metadata ?? {}) as Record<string, unknown>;
  return {
    tier: String(meta.routingTier ?? meta.tier ?? 'unknown'),
    strategy: String(meta.strategy ?? 'unknown'),
  };
}

// ── Session Management ───────────────────────────────────────────────────

async function createSession(
  projectId: string,
  token: string,
): Promise<string> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/agent-chat/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ reuseEmpty: false, cleanStart: true }),
  });
  if (!res.ok) throw new Error(`Session create failed: HTTP ${res.status}`);
  const data = await res.json();
  return data.data?.id ?? data.id;
}

async function deleteSession(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<void> {
  await supabase.from('ai_messages').delete().eq('session_id', sessionId);
  await supabase.from('ai_sessions').delete().eq('id', sessionId);
}

// ── Usage Data ───────────────────────────────────────────────────────────

async function queryUsageData(
  supabase: SupabaseClient,
  projectId: string,
  startTime: string,
  endTime: string,
): Promise<{ costCents: number; inputTokens: number; outputTokens: number }> {
  const { data } = await supabase
    .from('usage_records')
    .select('cost_cents, input_tokens, output_tokens')
    .eq('project_id', projectId)
    .gte('created_at', startTime)
    .lte('created_at', endTime);

  if (!data || data.length === 0) return { costCents: 0, inputTokens: 0, outputTokens: 0 };

  type UsageRow = { cost_cents: number; input_tokens: number; output_tokens: number };
  const rows = data as unknown as UsageRow[];
  return {
    costCents: rows.reduce((s, r) => s + (r.cost_cents ?? 0), 0),
    inputTokens: rows.reduce((s, r) => s + (r.input_tokens ?? 0), 0),
    outputTokens: rows.reduce((s, r) => s + (r.output_tokens ?? 0), 0),
  };
}

// ── Execution Data ───────────────────────────────────────────────────────

async function queryExecutionData(
  supabase: SupabaseClient,
  projectId: string,
  startTime: string,
  endTime: string,
): Promise<{ execution_log?: unknown[]; proposed_changes?: Array<{ fileName: string; originalContent?: string; proposedContent?: string; reasoning?: string }> } | null> {
  const { data } = await supabase
    .from('agent_executions')
    .select('execution_log, proposed_changes')
    .eq('project_id', projectId)
    .gte('created_at', startTime)
    .lte('created_at', endTime)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  return data ?? null;
}

// ── Report Generation ────────────────────────────────────────────────────

interface RunResult {
  run: number;
  passed: boolean;
  reason: string;
  metrics: CanaryTranscript['metrics'];
  tier: string;
  strategy: string;
  changedFiles: string[];
  transcript: CanaryTranscript;
  analysis: EngineeringReport;
}

async function queryActualChangedExpectedFiles(
  supabase: SupabaseClient,
  projectId: string,
  expectedFiles: string[],
  baselineByPath: Map<string, string>,
): Promise<string[]> {
  if (expectedFiles.length === 0) return [];
  const { data, error } = await supabase
    .from('files')
    .select('path, content')
    .eq('project_id', projectId)
    .in('path', expectedFiles);
  if (error || !data) return [];

  const changed: string[] = [];
  for (const row of data as Array<{ path: string; content: string | null }>) {
    const current = row.content ?? '';
    const baseline = baselineByPath.get(normalizePath(row.path)) ?? '';
    if (current !== baseline) changed.push(row.path);
  }
  return changed;
}

interface CanaryReport {
  timestamp: string;
  projectId: string;
  scenario: string;
  prompt: string;
  totalRuns: number;
  results: RunResult[];
  summary: {
    passRate: string;
    avgToolCalls: number;
    avgTimeSeconds: number;
    totalCostCents: number;
    failureReasons: string[];
  };
  aggregateAnalysis: EngineeringReport;
}

function generateMarkdownReport(report: CanaryReport): string {
  const lines: string[] = [];

  lines.push(`# Canary Report: ${report.scenario}`);
  lines.push(`**Date:** ${report.timestamp}`);
  lines.push(`**Project:** ${report.projectId}`);
  lines.push(`**Runs:** ${report.totalRuns}`);
  lines.push(`**Pass Rate:** ${report.summary.passRate}`);
  lines.push('');

  // Summary table
  lines.push('## Results');
  lines.push('| Run | Pass | Reason | Tools | Time | Cost |');
  lines.push('|-----|------|--------|-------|------|------|');
  for (const r of report.results) {
    const pass = r.passed ? 'PASS' : 'FAIL';
    const time = `${Math.round(r.metrics.elapsedMs / 1000)}s`;
    const cost = `$${(r.metrics.costCents / 100).toFixed(3)}`;
    lines.push(`| ${r.run} | ${pass} | ${r.reason} | ${r.metrics.totalToolCalls} | ${time} | ${cost} |`);
  }
  lines.push('');

  // Aggregate analysis
  lines.push('## Aggregate Diagnosis');
  lines.push(`**Summary:** ${report.aggregateAnalysis.diagnosis.summary}`);
  lines.push('');
  lines.push(`**Root Cause:** ${report.aggregateAnalysis.diagnosis.rootCause}`);
  lines.push('');
  lines.push(`**Agent Behavior:** ${report.aggregateAnalysis.diagnosis.agentBehavior}`);
  lines.push('');

  // Patterns
  if (report.aggregateAnalysis.patterns) {
    const p = report.aggregateAnalysis.patterns;
    lines.push('## Patterns');
    if (p.consistentFailureMode) {
      lines.push(`**Consistent Failure Mode:** ${p.consistentFailureMode}`);
    }
    if (p.intermittentIssues.length > 0) {
      lines.push('**Intermittent Issues:**');
      for (const issue of p.intermittentIssues) lines.push(`- ${issue}`);
    }
    if (p.toolUsageAntiPatterns.length > 0) {
      lines.push('**Tool Anti-Patterns:**');
      for (const ap of p.toolUsageAntiPatterns) lines.push(`- ${ap}`);
    }
    if (p.contextGaps.length > 0) {
      lines.push('**Context Gaps:**');
      for (const gap of p.contextGaps) lines.push(`- ${gap}`);
    }
    lines.push('');
  }

  // Recommendations
  lines.push('## Recommendations');
  const allRecs = [
    ...report.aggregateAnalysis.recommendations,
    ...report.results.flatMap(r => r.analysis.recommendations),
  ];
  // Deduplicate by title
  const seen = new Set<string>();
  const uniqueRecs = allRecs.filter(r => {
    if (seen.has(r.title)) return false;
    seen.add(r.title);
    return true;
  });
  // Sort by priority
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  uniqueRecs.sort((a, b) => (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3));

  for (const rec of uniqueRecs) {
    lines.push(`### [${rec.priority.toUpperCase()}] ${rec.title}`);
    lines.push(`**Category:** ${rec.category} | **File:** \`${rec.targetFile}\` | **Area:** ${rec.targetArea}`);
    lines.push('');
    lines.push(rec.description);
    lines.push('');
    if (rec.suggestedChange) {
      lines.push('```');
      lines.push(rec.suggestedChange);
      lines.push('```');
      lines.push('');
    }
  }

  // Per-run details
  lines.push('## Per-Run Details');
  for (const r of report.results) {
    lines.push(`### Run ${r.run} — ${r.passed ? 'PASS' : 'FAIL'}`);
    lines.push(`**Reason:** ${r.reason}`);
    lines.push(`**Tier:** ${r.tier} | **Strategy:** ${r.strategy}`);
    lines.push(`**Tools:** ${r.metrics.totalToolCalls} (${r.metrics.editToolCalls} edits, ${r.metrics.readToolCalls} reads, ${r.metrics.searchToolCalls} searches)`);
    lines.push('');
    lines.push(`**Diagnosis:** ${r.analysis.diagnosis.summary}`);
    lines.push('');
    lines.push('**Tool Sequence:**');
    for (const t of r.transcript.toolSequence.slice(0, 20)) {
      const err = t.isError ? ' [ERROR]' : '';
      lines.push(`- \`${t.name}\`${err} (${t.elapsedMs}ms)`);
    }
    if (r.transcript.toolSequence.length > 20) {
      lines.push(`- ... and ${r.transcript.toolSequence.length - 20} more`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ── Single Run ───────────────────────────────────────────────────────────

async function runSingle(
  runNumber: number,
  scenario: CanaryScenario,
  projectId: string,
  token: string,
  supabase: SupabaseClient,
  baselineByPath: Map<string, string>,
): Promise<RunResult> {
  console.log(`\n--- Run ${runNumber} ---`);

  const runStartTime = new Date().toISOString();
  const start = Date.now();

  // 1. Create clean session
  let sessionId: string | null = null;
  try {
    sessionId = await createSession(projectId, token);
    console.log(`  Session: ${sessionId}`);
  } catch (err) {
    console.warn(`  Session creation failed: ${err}`);
  }

  // 2. Run agent via SSE
  let events: SSEEvent[] = [];
  try {
    const response = await fetch(`${API_BASE}/api/agents/stream/v2`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        projectId,
        request: scenario.prompt,
        intentMode: scenario.intentMode,
        history: [],
        ...(sessionId ? { sessionId } : {}),
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.log(`  HTTP ${response.status}: ${text.slice(0, 200)}`);
      events = [{ type: 'error', message: `HTTP ${response.status}: ${text.slice(0, 200)}` }];
    } else {
      events = await parseSSEStream(response);
    }
  } catch (err) {
    console.error(`  Stream failed: ${err}`);
    events = [{ type: 'error', message: String(err) }];
  }

  const elapsedMs = Date.now() - start;
  const runEndTime = new Date().toISOString();

  // 3. Pipeline info
  const pipeline = extractPipelineInfo(events);
  console.log(`  Pipeline: tier=${pipeline.tier} strategy=${pipeline.strategy}`);

  // 4. Query execution data
  let executionData: Awaited<ReturnType<typeof queryExecutionData>> = null;
  try {
    executionData = await queryExecutionData(supabase, projectId, runStartTime, runEndTime);
  } catch {
    console.warn('  Could not query execution data');
  }

  const observedChangedFiles = extractChangedFiles(events, executionData ?? undefined);
  const actualChangedExpectedFiles = await queryActualChangedExpectedFiles(
    supabase,
    projectId,
    scenario.expectedFiles,
    baselineByPath,
  );
  const changedFiles = [...new Set([...observedChangedFiles, ...actualChangedExpectedFiles])];

  // 5. Evaluate pass/fail (strict required-file gating)
  const evalResult = evaluateRun(events, scenario, changedFiles);
  console.log(`  ${evalResult.passed ? 'PASS' : 'FAIL'}: ${evalResult.reason} (${Math.round(elapsedMs / 1000)}s)`);
  if (changedFiles.length > 0) {
    console.log(`  Changed files observed: ${changedFiles.join(', ')}`);
  }

  // 6. Query usage data
  let usageData = { costCents: 0, inputTokens: 0, outputTokens: 0 };
  try {
    usageData = await queryUsageData(supabase, projectId, runStartTime, runEndTime);
  } catch {
    console.warn('  Could not query usage data');
  }

  // 7. Structure transcript
  const transcript = structureTranscript(
    events,
    `run-${runNumber}`,
    scenario.id,
    elapsedMs,
    executionData ?? undefined,
    usageData,
  );

  // 8. LLM analysis
  console.log('  Analyzing transcript...');
  let analysis: EngineeringReport;
  try {
    analysis = await analyzeTranscript(transcript, scenario.prompt);
    console.log(`  Analysis: ${analysis.recommendations.length} recommendation(s)`);
  } catch (err) {
    console.warn(`  Analysis failed: ${err}`);
    analysis = {
      diagnosis: { summary: 'Analysis failed', rootCause: String(err), agentBehavior: 'unknown' },
      recommendations: [],
    };
  }

  // 9. Delete session
  if (sessionId) {
    try {
      await deleteSession(supabase, sessionId);
      console.log('  Session cleaned up');
    } catch {
      console.warn('  Session cleanup failed');
    }
  }

  return {
    run: runNumber,
    passed: evalResult.passed,
    reason: evalResult.reason,
    metrics: transcript.metrics,
    tier: pipeline.tier,
    strategy: pipeline.strategy,
    changedFiles,
    transcript,
    analysis,
  };
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const projectIdx = args.indexOf('--project');
  const runsIdx = args.indexOf('--runs');
  const scenarioIdx = args.indexOf('--scenario');

  if (projectIdx === -1 || !args[projectIdx + 1]) {
    console.error('Usage: npx tsx scripts/run-canary.ts --project <id> [--runs 5] [--scenario restock-badge-lengths]');
    process.exit(1);
  }

  const projectId = args[projectIdx + 1];
  const totalRuns = runsIdx !== -1 ? parseInt(args[runsIdx + 1], 10) || 5 : 5;
  const scenarioId = scenarioIdx !== -1 ? args[scenarioIdx + 1] : 'restock-badge-lengths';

  const scenario = SCENARIOS.find(s => s.id === scenarioId);
  if (!scenario) {
    console.error(`Unknown scenario: ${scenarioId}. Available: ${SCENARIOS.map(s => s.id).join(', ')}`);
    process.exit(1);
  }

  console.log('Canary Test Runner');
  console.log(`  Project: ${projectId}`);
  console.log(`  Scenario: ${scenario.id} — ${scenario.description}`);
  console.log(`  Runs: ${totalRuns}`);
  console.log(`  API: ${API_BASE}`);
  console.log('');

  // Verify server
  try {
    const health = await fetch(`${API_BASE}/api/health`).catch(() => null);
    if (!health || !health.ok) {
      const fallback = await fetch(API_BASE).catch(() => null);
      if (!fallback) {
        console.error('Dev server not running. Start with: npm run dev');
        process.exit(1);
      }
    }
  } catch {
    console.error('Cannot reach dev server');
    process.exit(1);
  }

  // Auth
  const { token } = await getTestUserToken(projectId);
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Snapshot
  console.log('\nTaking theme snapshot...');
  const snapshot = await takeSnapshot(supabase, projectId);
  console.log(`  Captured ${snapshot.files.length} files`);

  // Run loop
  const results: RunResult[] = [];
  for (let i = 1; i <= totalRuns; i++) {
    const baselineByPath = new Map(
      snapshot.files.map((f) => [normalizePath(f.path), f.content ?? '']),
    );
    const result = await runSingle(i, scenario, projectId, token, supabase, baselineByPath);
    results.push(result);

    // Reset between runs (not after last run — leave final state for inspection)
    if (i < totalRuns) {
      console.log('  Resetting theme to snapshot...');
      const reset = await resetToSnapshot(supabase, projectId, snapshot);
      console.log(`  Reset: ${reset.updated} updated, ${reset.inserted} inserted, ${reset.deleted} deleted`);
    }
  }

  // Aggregate analysis
  console.log('\n--- Aggregate Analysis ---');
  const transcripts = results.map(r => r.transcript);
  let aggregateAnalysis: EngineeringReport;
  try {
    aggregateAnalysis = await analyzeAggregateRuns(transcripts, scenario.prompt);
    console.log(`  Cross-run analysis: ${aggregateAnalysis.recommendations.length} recommendation(s)`);
  } catch (err) {
    console.warn(`  Aggregate analysis failed: ${err}`);
    aggregateAnalysis = {
      diagnosis: { summary: 'Aggregate analysis failed', rootCause: String(err), agentBehavior: 'unknown' },
      recommendations: [],
    };
  }

  // Build report
  const passed = results.filter(r => r.passed).length;
  const report: CanaryReport = {
    timestamp: new Date().toISOString(),
    projectId,
    scenario: scenario.id,
    prompt: scenario.prompt,
    totalRuns,
    results,
    summary: {
      passRate: `${passed}/${totalRuns} (${Math.round((passed / totalRuns) * 100)}%)`,
      avgToolCalls: Math.round(results.reduce((s, r) => s + r.metrics.totalToolCalls, 0) / totalRuns),
      avgTimeSeconds: Math.round(results.reduce((s, r) => s + r.metrics.elapsedMs, 0) / totalRuns / 1000),
      totalCostCents: results.reduce((s, r) => s + r.metrics.costCents, 0),
      failureReasons: results.filter(r => !r.passed).map(r => r.reason),
    },
    aggregateAnalysis,
  };

  // Console summary
  console.log('\n' + '='.repeat(60));
  console.log('CANARY TEST SUMMARY');
  console.log('='.repeat(60));
  for (const r of results) {
    console.log(`  ${r.passed ? 'PASS' : 'FAIL'}  Run ${r.run} — ${r.reason} (${r.metrics.totalToolCalls} tools, ${Math.round(r.metrics.elapsedMs / 1000)}s) [${r.tier}/${r.strategy}]`);
  }
  console.log(`\nScore: ${report.summary.passRate}`);
  console.log(`Avg tool calls: ${report.summary.avgToolCalls}`);
  console.log(`Avg time: ${report.summary.avgTimeSeconds}s`);
  console.log(`Total cost: $${(report.summary.totalCostCents / 100).toFixed(3)}`);

  if (aggregateAnalysis.diagnosis.rootCause) {
    console.log(`\nRoot cause: ${aggregateAnalysis.diagnosis.rootCause}`);
  }
  if (aggregateAnalysis.patterns?.consistentFailureMode) {
    console.log(`Consistent failure: ${aggregateAnalysis.patterns.consistentFailureMode}`);
  }

  // Write reports
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const jsonFile = `.verification/canary-${scenario.id}-${ts}.json`;
  const mdFile = `.verification/canary-${scenario.id}-${ts}.md`;

  try {
    mkdirSync('.verification', { recursive: true });

    // JSON — strip large transcript data to keep file size reasonable
    const compactReport = {
      ...report,
      results: report.results.map(r => ({
        ...r,
        transcript: {
          ...r.transcript,
          // Keep tool sequence and decisions, strip large reasoning/response text
          reasoningBlocks: r.transcript.reasoningBlocks.map(rb => ({
            agent: rb.agent,
            text: rb.text.slice(0, 500),
          })),
          responseText: r.transcript.responseText.slice(0, 2000),
          executionLog: undefined,
          proposedChanges: r.transcript.proposedChanges?.map(pc => ({
            fileName: pc.fileName,
            reasoning: pc.reasoning,
          })),
        },
      })),
    };
    writeFileSync(jsonFile, JSON.stringify(compactReport, null, 2));
    console.log(`\nJSON report: ${jsonFile}`);

    // Markdown
    const md = generateMarkdownReport(report);
    writeFileSync(mdFile, md);
    console.log(`Markdown report: ${mdFile}`);
  } catch (err) {
    console.error('Could not write reports:', err);
    console.log(JSON.stringify(report.summary, null, 2));
  }

  process.exit(passed === totalRuns ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
