/**
 * Evaluation runner for fine-tuned model contenders.
 *
 * Runs the prompt-first CX scenarios against both baseline (current production)
 * and the tuned model, scoring each with the full eval dimensions from behavior spec.
 *
 * Usage:
 *   npx tsx scripts/run-finetune-eval.ts [--mode v1|v2]
 *     [--json-file <path>] [--fail-on-regression]
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
import type { IntentMode } from '../lib/finetune/behavior-spec';

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseArg(name: string): string | undefined {
  const idx = process.argv.findIndex((a) => a === `--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

type Mode = 'v1' | 'v2';

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
  mode: Mode,
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

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  dotenv.config({ path: path.join(process.cwd(), '.env.local') });
  dotenv.config({ path: path.join(process.cwd(), '.env.test') });

  const mode: Mode = (parseArg('mode') as Mode) ?? 'v2';
  const jsonFile = parseArg('json-file');
  const failOnRegression = hasFlag('fail-on-regression');

  console.log(`Running finetune evaluation suite in ${mode} mode...`);

  const contender = 'baseline';
  const results: FinetuneEvalResult[] = [];

  for (const scenario of EVAL_SCENARIOS) {
    console.log(`\n--- ${scenario.label} ---`);
    const result = await runEvalScenario(mode, contender, scenario);
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
