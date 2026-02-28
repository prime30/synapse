/**
 * Transcript Analyzer — LLM-powered engineering analysis of agent execution.
 *
 * Feeds structured transcripts to Claude Haiku and generates an engineering
 * report with behavioral diagnosis, code pointers, and suggested diffs.
 */

import type { CanaryTranscript } from './transcript-capture';
import { getAIProvider } from '@/lib/ai/get-provider';
import { MODELS } from '@/lib/agents/model-router';

// ── Types ────────────────────────────────────────────────────────────────

export interface EngineeringReport {
  diagnosis: {
    summary: string;
    rootCause: string;
    agentBehavior: string;
  };

  recommendations: Array<{
    priority: 'critical' | 'high' | 'medium' | 'low';
    category: 'prompt' | 'tools' | 'coordinator' | 'context' | 'validation' | 'strategy';
    title: string;
    description: string;
    targetFile: string;
    targetArea: string;
    suggestedChange: string;
  }>;

  patterns?: {
    consistentFailureMode: string | null;
    intermittentIssues: string[];
    toolUsageAntiPatterns: string[];
    contextGaps: string[];
  };
}

// ── Architecture context for the LLM ─────────────────────────────────────

const ARCHITECTURE_CONTEXT = `
## Agent Architecture

The Synapse V2 coordinator is a single-stream iterative agent loop:
think -> tool -> observe -> repeat (max 80 iterations).

Key components:
- **Coordinator** (lib/agents/coordinator-v2.ts): Main loop, strategy selection, context building, validation gates
- **PM Prompt** (lib/agents/prompts/v2-pm-prompt.ts): System prompt with tool instructions and Shopify knowledge
- **Tool Definitions** (lib/agents/tools/v2-tool-definitions.ts): Available tools (read_lines, edit_lines, grep_content, etc.)
- **Tool Executor** (lib/agents/tools/v2-tool-executor.ts): Executes run_specialist, run_review, get_second_opinion
- **Strategy** (lib/agents/strategy.ts): SIMPLE, HYBRID, GOD_MODE strategy selection based on tier
- **Orchestration Policy** (lib/agents/orchestration-policy.ts): Context gates, validation rules
- **Model Router** (lib/agents/model-router.ts): Model/tier routing (Haiku for classify, Opus for PM, Sonnet for specialists)
- **Scout** (lib/agents/scout/structural-scout.ts): Programmatic + optional LLM brief for file targeting
- **Theme Map** (lib/agents/theme-map/lookup.ts): Cached structural index for fast file lookup

## Key Source Files (where fixes would go)
- lib/agents/coordinator-v2.ts — Main orchestration loop, iteration limits, stagnation detection
- lib/agents/prompts/v2-pm-prompt.ts — System prompt, tool usage instructions, Shopify knowledge
- lib/agents/tools/v2-tool-definitions.ts — Tool schemas and descriptions
- lib/agents/tools/v2-tool-executor.ts — run_specialist, run_review execution
- lib/agents/strategy.ts — Strategy selection logic
- lib/agents/orchestration-policy.ts — Context gates and policy enforcement
- lib/agents/model-router.ts — Model selection per action
- lib/agents/scout/structural-scout.ts — Scout brief generation
- lib/agents/theme-map/lookup.ts — Theme map file lookup
- lib/agents/theme-map/cache.ts — Theme map caching and line range tracking
`.trim();

// ── Analysis prompts ─────────────────────────────────────────────────────

function buildSingleRunPrompt(transcript: CanaryTranscript, scenarioDescription: string): string {
  const toolSummary = transcript.toolSequence
    .map((t, i) => {
      const inputStr = t.input
        ? Object.entries(t.input)
            .filter(([, v]) => typeof v === 'string' && (v as string).length < 200)
            .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
            .join(', ')
        : '';
      const errorFlag = t.isError ? ' [ERROR]' : '';
      const resultPreview = t.result ? t.result.slice(0, 150) : '';
      return `  ${i + 1}. ${t.name}(${inputStr})${errorFlag} -> ${resultPreview}... [${t.elapsedMs}ms]`;
    })
    .join('\n');

  const decisionSummary = transcript.decisions
    .map(d => `  [${d.phase}] ${d.label}${d.detail ? ` (${d.detail})` : ''}`)
    .join('\n');

  const reasoningSummary = transcript.reasoningBlocks
    .slice(-5)
    .map(r => `  [${r.agent}]: ${r.text.slice(0, 500)}`)
    .join('\n');

  return `${ARCHITECTURE_CONTEXT}

## Scenario
Prompt: "${scenarioDescription}"
Actual outcome: ${transcript.outcome.status} (${transcript.outcome.changedFiles} files changed)
${transcript.outcome.failureReason ? `Failure reason: ${transcript.outcome.failureReason}` : ''}
${transcript.outcome.changeSummary ? `Change summary: ${transcript.outcome.changeSummary}` : ''}

## Metrics
- Tool calls: ${transcript.metrics.totalToolCalls} (${transcript.metrics.editToolCalls} edits, ${transcript.metrics.readToolCalls} reads, ${transcript.metrics.searchToolCalls} searches)
- Time: ${Math.round(transcript.metrics.elapsedMs / 1000)}s
- Cost: $${(transcript.metrics.costCents / 100).toFixed(4)}
- Tokens: ${transcript.metrics.inputTokens} in / ${transcript.metrics.outputTokens} out

## Decision Points
${decisionSummary || '(none captured)'}

## Tool Sequence (chronological)
${toolSummary || '(no tool calls)'}

## Agent Reasoning (last 5 blocks)
${reasoningSummary || '(no reasoning captured)'}

## Response Text (first 1000 chars)
${transcript.responseText.slice(0, 1000)}

## Your Task
1. DIAGNOSE: What did the agent do, step by step? Why did it fail (or succeed)?
2. ROOT CAUSE: Trace to the architectural reason. Which system component failed?
3. RECOMMEND: For each issue, specify:
   - The exact source file and area to change
   - What the change should do (pseudocode or diff)
   - Priority (critical/high/medium/low)
   - Category (prompt/tools/coordinator/context/validation/strategy)

Output ONLY valid JSON matching this schema:
{
  "diagnosis": { "summary": "string", "rootCause": "string", "agentBehavior": "string" },
  "recommendations": [{ "priority": "critical|high|medium|low", "category": "prompt|tools|coordinator|context|validation|strategy", "title": "string", "description": "string", "targetFile": "string", "targetArea": "string", "suggestedChange": "string" }]
}`;
}

function buildAggregatePrompt(transcripts: CanaryTranscript[], scenarioDescription: string): string {
  const runSummaries = transcripts
    .map((t, i) => {
      const toolNames = t.toolSequence.map(ts => ts.name).join(', ');
      const errors = t.toolSequence.filter(ts => ts.isError).map(ts => `${ts.name}: ${(ts.result ?? '').slice(0, 100)}`);
      return `Run ${i + 1}: ${t.outcome.status} (${t.outcome.changedFiles} files, ${t.metrics.totalToolCalls} tools, ${Math.round(t.metrics.elapsedMs / 1000)}s)
  Tools: ${toolNames}
  ${errors.length > 0 ? `Errors: ${errors.join('; ')}` : 'No errors'}
  ${t.outcome.failureReason ? `Failure: ${t.outcome.failureReason}` : ''}`;
    })
    .join('\n\n');

  const passCount = transcripts.filter(t => t.outcome.status === 'applied' && t.outcome.changedFiles > 0).length;

  return `${ARCHITECTURE_CONTEXT}

## Aggregate Analysis — ${transcripts.length} Runs of Same Scenario
Scenario: "${scenarioDescription}"
Pass rate: ${passCount}/${transcripts.length} (${Math.round((passCount / transcripts.length) * 100)}%)

## Per-Run Summaries
${runSummaries}

## Your Task
Analyze ALL runs together and identify:
1. DIAGNOSIS: Overall behavioral pattern across runs
2. ROOT CAUSE: The systemic issue (not per-run symptoms)
3. PATTERNS:
   - consistentFailureMode: Same root cause across all failed runs? (null if none)
   - intermittentIssues: Issues that appear in some runs but not others
   - toolUsageAntiPatterns: e.g. "reads same file 3x without editing", "calls grep after already reading the file"
   - contextGaps: Files the agent should have read but didn't
4. RECOMMENDATIONS: Prioritized fixes that would improve reliability across ALL runs

Output ONLY valid JSON matching this schema:
{
  "diagnosis": { "summary": "string", "rootCause": "string", "agentBehavior": "string" },
  "recommendations": [{ "priority": "critical|high|medium|low", "category": "prompt|tools|coordinator|context|validation|strategy", "title": "string", "description": "string", "targetFile": "string", "targetArea": "string", "suggestedChange": "string" }],
  "patterns": { "consistentFailureMode": "string|null", "intermittentIssues": ["string"], "toolUsageAntiPatterns": ["string"], "contextGaps": ["string"] }
}`;
}

// ── Analysis functions ───────────────────────────────────────────────────

async function callAnalyzer(prompt: string): Promise<EngineeringReport> {
  const provider = getAIProvider('anthropic');
  const result = await provider.complete(
    [
      {
        role: 'system',
        content: 'You are an AI systems engineer analyzing agent execution transcripts. Output ONLY valid JSON. No markdown, no explanation, no preamble.',
      },
      { role: 'user', content: prompt },
    ],
    { model: MODELS.CLAUDE_HAIKU, maxTokens: 4096 },
  );

  const raw = (result.content ?? '').trim();

  // Extract JSON from response (handle potential markdown wrapping)
  let jsonStr = raw;
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) jsonStr = jsonMatch[0];

  try {
    return JSON.parse(jsonStr) as EngineeringReport;
  } catch {
    return {
      diagnosis: {
        summary: 'Failed to parse LLM analysis output',
        rootCause: 'Analysis output was not valid JSON',
        agentBehavior: raw.slice(0, 500),
      },
      recommendations: [],
    };
  }
}

/**
 * Analyze a single canary run transcript and generate an engineering report.
 */
export async function analyzeTranscript(
  transcript: CanaryTranscript,
  scenarioDescription: string,
): Promise<EngineeringReport> {
  const prompt = buildSingleRunPrompt(transcript, scenarioDescription);
  return callAnalyzer(prompt);
}

/**
 * Analyze multiple runs of the same scenario to detect cross-run patterns.
 */
export async function analyzeAggregateRuns(
  transcripts: CanaryTranscript[],
  scenarioDescription: string,
): Promise<EngineeringReport> {
  const prompt = buildAggregatePrompt(transcripts, scenarioDescription);
  return callAnalyzer(prompt);
}
