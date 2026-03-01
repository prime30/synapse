/**
 * Evaluation runner for fine-tuned model contenders.
 *
 * Runs the prompt-first CX scenarios against both baseline (current production)
 * and the tuned model, scoring each with the full eval dimensions from behavior spec.
 *
 * Usage:
 *   npx tsx scripts/run-finetune-eval.ts [--mode v2|bugs]
 *     [--json-file <path>] [--fail-on-regression]
 *
 * Modes:
 *   v2   - CX scenarios (mode inference, conversation quality, etc.)
 *   bugs - Real-bug eval suite (10 scenarios, fix correctness scoring)
 *
 * Outputs a comparison summary showing where the tuned model improves or regresses.
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import {
  createHarnessFixtureFiles,
  runSynapseHarness,
} from '../lib/agents/testing/synapse-harness';
import { BUG_SCENARIOS } from '../lib/agents/testing/bug-scenarios';
import { generateThemeFixture } from '../lib/agents/testing/theme-fixtures';
import {
  scoreModeInference,
  scoreClarificationQuality,
  scorePlanDecomposition,
  scoreHallucination,
  scoreAntiPatterns,
  scoreConversationQuality,
  buildEvalSummary,
  type FinetuneEvalResult,
} from '../lib/finetune/eval-dimensions';
import {
  scoreBugFix,
  type BugFixScore,
  type AgentBugFixOutput,
} from '../lib/finetune/bug-fix-scoring';
import type { IntentMode } from '../lib/finetune/behavior-spec';
import type { FileContext } from '../lib/types/agent';

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseArg(name: string): string | undefined {
  const idx = process.argv.findIndex((a) => a === `--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

type Mode = 'v2' | 'bugs';

function inferIntent(prompt: string): IntentMode {
  const p = prompt.toLowerCase();
  if (/^\s*(plan|create a plan|propose a plan|draft a plan)\b/.test(p)) return 'plan';
  if (/\b(debug|diagnose|why .*not|failing|broken|error|regression|investigate)\b/.test(p))
    return 'debug';
  if (
    /\b(plan|roadmap|step-by-step|steps|architecture|strategy|scope)\b/.test(p) &&
    !/\bimplement|apply|edit|change|fix\b/.test(p)
  )
    return 'plan';
  if (/^(how|what|where|why)\b/.test(p) || /\bexplain|help me understand|walk me through\b/.test(p))
    return 'ask';
  return 'code';
}

// ── Eval Scenarios ───────────────────────────────────────────────────────────

interface EvalScenario {
  label: string;
  prompt: string;
  expectedMode: IntentMode;
  recentMessages?: string[];
  expectedFailure?: string;
}

const EVAL_SCENARIOS: EvalScenario[] = [
  {
    label: 'ask_composition',
    prompt: 'How is the product page composed and where should I change card radius?',
    expectedMode: 'ask',
  },
  {
    label: 'ask_explain',
    prompt: 'Explain what the product card snippet does and how it connects to the section schema.',
    expectedMode: 'ask',
  },
  {
    label: 'plan_redesign',
    prompt: 'Plan a multi-file product card redesign with schema changes and CSS updates.',
    expectedMode: 'plan',
  },
  {
    label: 'plan_architecture',
    prompt: 'Plan restructuring the product template into modular sections with separate blocks.',
    expectedMode: 'plan',
  },
  {
    label: 'debug_visibility',
    prompt: 'Debug why the product card is not visible on product templates.',
    expectedMode: 'debug',
    expectedFailure: 'provider limitation',
  },
  {
    label: 'code_simple',
    prompt: 'Change the border radius in product card CSS from 8px to 10px.',
    expectedMode: 'code',
  },
  {
    label: 'code_approved_plan',
    prompt: 'Implement this approved plan now: update the product card border radius in assets/theme.css from 8px to 10px.',
    expectedMode: 'code',
    recentMessages: ['Approved plan. Execute these steps now and make the code changes.'],
  },
  {
    label: 'code_complex',
    prompt: 'Add a dismissible announcement bar section with background color picker, text, link, and toggle schema settings.',
    expectedMode: 'code',
  },
];

// ── Runner ───────────────────────────────────────────────────────────────────

async function runEvalScenario(
  mode: 'v2',
  contender: string,
  scenario: EvalScenario,
): Promise<FinetuneEvalResult | null> {
  const inferred = inferIntent(scenario.prompt);
  const files = createHarnessFixtureFiles();
  const contextPaths = files.map((f) => f.path).filter((p): p is string => !!p);

  try {
    const output = await runSynapseHarness({
      mode,
      prompt: scenario.prompt,
      intentMode: inferred,
      recentMessages: scenario.recentMessages,
      files,
    });

    const responseText = output.result.analysis ?? '';

    const modeInference = scoreModeInference(
      scenario.expectedMode,
      inferred,
      scenario.label,
    );

    const clarification = output.result.needsClarification
      ? scoreClarificationQuality(responseText)
      : undefined;

    const planDecomposition = inferred === 'plan'
      ? scorePlanDecomposition(responseText)
      : undefined;

    const hallucination = scoreHallucination(responseText, contextPaths);
    const antiPatterns = scoreAntiPatterns(inferred, output, responseText);
    const conversationQuality = scoreConversationQuality(inferred, output, responseText);

    return {
      contender,
      scenario: scenario.label,
      mode: inferred,
      modeInference,
      clarification,
      planDecomposition,
      hallucination,
      antiPatterns,
      conversationQuality,
      harnessOutput: output,
    };
  } catch (err) {
    if (scenario.expectedFailure) {
      console.log(`  [${scenario.label}] Expected failure: ${scenario.expectedFailure}`);
      return null;
    }
    throw err;
  }
}

// ── Bug Eval Runner ───────────────────────────────────────────────────────────

function fixtureToFileContext(files: Array<{ path: string; content: string }>): FileContext[] {
  return files.map((f, i) => {
    const ext = f.path.split('.').pop() ?? '';
    let fileType: FileContext['fileType'] = 'other';
    if (ext === 'liquid') fileType = 'liquid';
    else if (ext === 'css') fileType = 'css';
    else if (ext === 'js') fileType = 'javascript';
    return {
      fileId: `f-bug-${i}`,
      fileName: f.path.split('/').pop() ?? f.path,
      path: f.path,
      fileType,
      content: f.content,
    };
  });
}

async function runBugScenario(
  mode: 'v2',
  scenario: (typeof BUG_SCENARIOS)[number],
): Promise<BugFixScore> {
  const fixture = generateThemeFixture(scenario);
  const files = fixtureToFileContext(fixture.files);

  const output = await runSynapseHarness({
    mode,
    prompt: scenario.userPrompt,
    intentMode: 'debug',
    files,
  });

  const pathByFileId = new Map(files.map((f) => [f.fileId, f.path]));
  const pathByFileName = new Map(files.map((f) => [f.fileName, f.path]));
  const changes: Array<{ file: string; content: string }> = (output.result.changes ?? []).map(
    (c) => {
      const p = pathByFileId.get(c.fileId) ?? pathByFileName.get(c.fileName ?? '') ?? c.fileName ?? c.fileId ?? '';
      return { file: p, content: c.proposedContent ?? '' };
    },
  );

  const toolCalls = output.metrics.toolCallCount;
  const agentOutput: AgentBugFixOutput = { changes, toolCalls };

  return scoreBugFix(scenario, agentOutput);
}

async function runBugsMode(jsonFile: string | undefined, failOnRegression: boolean) {
  const harnessMode: 'v1' | 'v2' = 'v2';
  console.log(`Running real-bug eval suite (${BUG_SCENARIOS.length} scenarios)...`);

  const scenarios: BugFixScore[] = [];
  for (const scenario of BUG_SCENARIOS) {
    console.log(`\n--- ${scenario.id}: ${scenario.description} ---`);
    try {
      const score = await runBugScenario(harnessMode, scenario);
      scenarios.push(score);
      console.log(
        `  Score: ${score.totalScore}/4 (file=${score.foundCorrectFile} change=${score.madeChange} correct=${score.changeCorrect} noRegress=${score.noRegressions})`,
      );
    } catch (err) {
      console.error(`  Error:`, err instanceof Error ? err.message : String(err));
      scenarios.push({
        scenarioId: scenario.id,
        foundCorrectFile: false,
        madeChange: false,
        changeCorrect: false,
        noRegressions: false,
        toolCallsUsed: 0,
        totalScore: 0,
      });
    }
  }

  const totalScore = scenarios.reduce((s, r) => s + r.totalScore, 0);
  const maxScore = BUG_SCENARIOS.length * 4;
  const passRate = maxScore > 0 ? `${((totalScore / maxScore) * 100).toFixed(1)}%` : '0%';

  const output = { scenarios, totalScore, maxScore, passRate };

  console.log('\n=== Bug Eval Summary ===');
  console.log(`Total score: ${totalScore}/${maxScore}`);
  console.log(`Pass rate: ${passRate}`);

  if (jsonFile) {
    const outPath = path.isAbsolute(jsonFile) ? jsonFile : path.join(process.cwd(), jsonFile);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');
    console.log(`\nWrote JSON to ${outPath}`);
  }

  if (failOnRegression && totalScore < maxScore * 0.5) {
    process.exitCode = 2;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  dotenv.config({ path: path.join(process.cwd(), '.env.local') });
  dotenv.config({ path: path.join(process.cwd(), '.env.test') });

  const mode: Mode = (parseArg('mode') as Mode) ?? 'v2';
  const jsonFile = parseArg('json-file');
  const failOnRegression = hasFlag('fail-on-regression');

  if (mode === 'bugs') {
    await runBugsMode(jsonFile, failOnRegression);
    return;
  }

  const harnessMode = mode as 'v2';
  console.log(`Running finetune evaluation suite in ${harnessMode} mode...`);

  const contender = 'baseline';
  const results: FinetuneEvalResult[] = [];

  for (const scenario of EVAL_SCENARIOS) {
    console.log(`\n--- ${scenario.label} ---`);
    const result = await runEvalScenario(harnessMode, contender, scenario);
    if (result) {
      results.push(result);
      console.log(`  Mode inference: ${result.modeInference.correct ? 'pass' : 'fail'}`);
      console.log(
        `  Conversation: ${(result.conversationQuality.conversationScore * 100).toFixed(1)}%`,
      );
      console.log(
        `  Safety: ${(result.conversationQuality.safetyScore * 100).toFixed(1)}%`,
      );
      console.log(
        `  Hallucination: ${(result.hallucination.hallucinationRate * 100).toFixed(1)}%`,
      );
      console.log(
        `  Anti-pattern clean: ${(result.antiPatterns.cleanRate * 100).toFixed(1)}%`,
      );
    }
  }

  const summary = buildEvalSummary(contender, results);

  console.log('\n=== Finetune Evaluation Summary ===');
  console.log(`Contender: ${summary.contender}`);
  console.log(`Scenarios: ${summary.totalScenarios}`);
  console.log(`Mode accuracy: ${(summary.modeAccuracy * 100).toFixed(1)}%`);
  console.log(`Avg conversation score: ${(summary.avgConversationScore * 100).toFixed(1)}%`);
  console.log(`Avg safety score: ${(summary.avgSafetyScore * 100).toFixed(1)}%`);
  console.log(`Hallucination rate: ${(summary.hallucinationRate * 100).toFixed(1)}%`);
  console.log(`Anti-pattern clean rate: ${(summary.antiPatternCleanRate * 100).toFixed(1)}%`);
  console.log(`Clarification quality: ${(summary.clarificationQuality * 100).toFixed(1)}%`);
  console.log(`Plan decomposition quality: ${(summary.planDecompositionQuality * 100).toFixed(1)}%`);
  console.log(`Overall: ${summary.overallPass ? 'pass' : 'fail'}`);

  if (jsonFile) {
    const outPath = path.isAbsolute(jsonFile) ? jsonFile : path.join(process.cwd(), jsonFile);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(summary, null, 2), 'utf8');
    console.log(`\nWrote JSON summary to ${outPath}`);
  }

  if (failOnRegression && !summary.overallPass) {
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error('Finetune eval failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
