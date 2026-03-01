import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import {
  createHarnessFixtureFiles,
  runSynapseHarness,
} from '../lib/agents/testing/synapse-harness';

type Mode = 'v2';
type IntentMode = 'ask' | 'code' | 'plan' | 'debug';
type PromptFirstScenario = {
  label: string;
  prompt: string;
  expectedIntent: IntentMode;
  recentMessages?: string[];
  expectedFailure?: string;
};
type PromptFirstScenarioResult = {
  label: string;
  expectedIntent: IntentMode;
  inferredIntent: IntentMode;
  success: boolean;
  needsClarification: boolean;
  toolCalls: {
    total: number;
    lookup: number;
    mutating: number;
  };
  checks: {
    intentRoutingPass: boolean;
    modeBehaviorPass: boolean;
    expectedLimitationPass: boolean;
    completionFormatPresent: boolean | null;
  };
  expectedLimitation?: string;
  error?: {
    code: string;
    message: string;
  };
};
type PromptFirstSuiteSummary = {
  suite: 'prompt-first';
  mode: Mode;
  generatedAt: string;
  thresholds: {
    minRoutingAccuracy: number;
    minBehaviorAccuracy: number;
    minCompletionCoverage: number;
    requireNoUnexpectedFailures: boolean;
  };
  metrics: {
    totalScenarios: number;
    routingPasses: number;
    behaviorPasses: number;
    expectedLimitationPasses: number;
    completionApplicableScenarios: number;
    completionPasses: number;
    unexpectedFailures: number;
    routingAccuracy: number;
    behaviorAccuracy: number;
    completionCoverage: number | null;
  };
  pass: {
    routing: boolean;
    behavior: boolean;
    completion: boolean;
    unexpectedFailures: boolean;
    overall: boolean;
  };
  scenarios: PromptFirstScenarioResult[];
};

function parseArg(name: string): string | undefined {
  const idx = process.argv.findIndex(a => a === `--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function parseNumberArg(name: string, defaultValue: number): number {
  const raw = parseArg(name);
  if (!raw) return defaultValue;
  const n = Number(raw);
  return Number.isFinite(n) ? n : defaultValue;
}

function parseMode(): Mode {
  return 'v2';
}

function parseIntent(): IntentMode | undefined {
  const intent = parseArg('intent');
  if (intent === 'ask' || intent === 'code' || intent === 'plan' || intent === 'debug') {
    return intent;
  }
  return undefined;
}

function inferIntentFromPrompt(prompt: string): IntentMode {
  const p = prompt.toLowerCase();
  if (/^\s*(plan|create a plan|propose a plan|draft a plan)\b/.test(p)) {
    return 'plan';
  }
  if (/\b(debug|diagnose|why .*not|failing|broken|error|regression|investigate)\b/.test(p)) {
    return 'debug';
  }
  if (
    /\b(plan|roadmap|step-by-step|steps|architecture|strategy|scope)\b/.test(p) &&
    !/\bimplement|apply|edit|change|fix\b/.test(p)
  ) {
    return 'plan';
  }
  if (/^(how|what|where|why)\b/.test(p) || /\bexplain|help me understand|walk me through\b/.test(p)) {
    return 'ask';
  }
  return 'code';
}

function formatBool(v: boolean | null): string {
  if (v === null) return 'n/a';
  return v ? 'pass' : 'fail';
}

async function runSinglePrompt(
  mode: Mode,
  prompt: string,
  recentMessages?: string[],
  intentMode: IntentMode = 'code',
) {
  const output = await runSynapseHarness({
    mode,
    prompt,
    intentMode,
    recentMessages,
    files: createHarnessFixtureFiles(),
  });

  console.log(`\n=== Synapse Harness (${mode}) ===`);
  console.log(`Intent: ${intentMode}`);
  console.log(`Prompt: ${prompt}`);
  console.log(`Success: ${output.result.success}`);
  console.log(`Needs clarification: ${Boolean(output.result.needsClarification)}`);
  console.log(`Elapsed: ${output.metrics.elapsedMs}ms`);
  console.log(`Tools used: ${output.metrics.toolsUsed.join(', ') || '(none)'}`);
  console.log(
    `Tool calls: total=${output.metrics.toolCallCount}, lookup=${output.metrics.lookupToolCalls}, mutating=${output.metrics.mutatingToolCalls}`,
  );
  console.log('\nArchitecture checks:');
  console.log(`- completion format: ${formatBool(output.checks.completionFormatPresent)}`);
  console.log(`- plan-first enforced (when expected): ${formatBool(output.checks.planFirstEnforcedWhenExpected)}`);
  console.log(`- verification evidence: ${formatBool(output.checks.verificationEvidencePresent)}`);
  console.log(`- structured review result: ${formatBool(output.checks.reviewStructuredPresent)}`);
  if (!output.result.success && output.result.error) {
    console.log(`Error: ${output.result.error.code} - ${output.result.error.message}`);
  }
}

async function runArchitectureSuite(mode: Mode) {
  console.log(`Running architecture suite in ${mode} mode...`);
  await runSinglePrompt(
    mode,
    'Refactor architecture across the entire Shopify theme with a multi-file migration for templates, sections, snippets, and assets.',
    undefined,
    'code',
  );
  await runSinglePrompt(
    mode,
    'Implement this approved plan now: update the product card border radius in assets/theme.css from 8px to 10px.',
    ['Approved plan. Execute these steps now and make the code changes.'],
    'code',
  );
  await runSinglePrompt(
    mode,
    'Change the border radius in product card CSS from 8px to 10px.',
    undefined,
    'code',
  );
}

async function runPromptFirstSuite(mode: Mode) {
  console.log(`Running prompt-first CX suite in ${mode} mode...`);
  const scenarios: PromptFirstScenario[] = [
    {
      label: 'ask_prompt',
      prompt: 'How is the product page composed and where should I change card radius?',
      expectedIntent: 'ask',
    },
    {
      label: 'plan_prompt',
      prompt: 'Plan a multi-file product card redesign with schema changes and CSS updates.',
      expectedIntent: 'plan',
    },
    {
      label: 'debug_prompt',
      prompt: 'Debug why the product card is not visible on product templates.',
      expectedIntent: 'debug',
    },
    {
      label: 'code_prompt',
      prompt: 'Change the border radius in product card CSS from 8px to 10px.',
      expectedIntent: 'code',
    },
    {
      label: 'approved_plan_prompt',
      prompt: 'Implement this approved plan now: update the product card border radius in assets/theme.css from 8px to 10px.',
      expectedIntent: 'code',
      recentMessages: ['Approved plan. Execute these steps now and make the code changes.'],
    },
  ];

  const scenarioResults: PromptFirstScenarioResult[] = [];

  for (const sc of scenarios) {
    const inferred = inferIntentFromPrompt(sc.prompt);
    const output = await runSynapseHarness({
      mode,
      prompt: sc.prompt,
      intentMode: inferred,
      recentMessages: sc.recentMessages,
      files: createHarnessFixtureFiles(),
    });

    const intentRoutingPass = inferred === sc.expectedIntent;
    const noOpCodeCompletion = output.checks.noOpCodeCompletion === true;
    const modeBehaviorPass =
      inferred === 'ask'
        ? output.metrics.mutatingToolCalls === 0
        : inferred === 'plan'
          ? output.metrics.mutatingToolCalls === 0
          : inferred === 'debug'
            ? output.metrics.lookupToolCalls >= 0
            : (output.metrics.mutatingToolCalls > 0 || Boolean(output.result.needsClarification)) &&
              !noOpCodeCompletion;
    const completionCheck = inferred === 'code' ? output.checks.completionFormatPresent : null;
    const expectedFailurePass = sc.expectedFailure
      ? !output.result.success
      : true;

    scenarioResults.push({
      label: sc.label,
      expectedIntent: sc.expectedIntent,
      inferredIntent: inferred,
      success: output.result.success,
      needsClarification: Boolean(output.result.needsClarification),
      toolCalls: {
        total: output.metrics.toolCallCount,
        lookup: output.metrics.lookupToolCalls,
        mutating: output.metrics.mutatingToolCalls,
      },
      checks: {
        intentRoutingPass,
        modeBehaviorPass,
        expectedLimitationPass: expectedFailurePass,
        completionFormatPresent: completionCheck,
      },
      expectedLimitation: sc.expectedFailure,
      error: output.result.error
        ? {
            code: output.result.error.code,
            message: output.result.error.message,
          }
        : undefined,
    });

    console.log(`\n=== Prompt-First Scenario: ${sc.label} ===`);
    console.log(`Expected intent: ${sc.expectedIntent}`);
    console.log(`Inferred intent: ${inferred}`);
    console.log(`Success: ${output.result.success}`);
    console.log(`Needs clarification: ${Boolean(output.result.needsClarification)}`);
    console.log(
      `Tool calls: total=${output.metrics.toolCallCount}, lookup=${output.metrics.lookupToolCalls}, mutating=${output.metrics.mutatingToolCalls}`,
    );
    console.log(`Intent routing check: ${intentRoutingPass ? 'pass' : 'fail'}`);
    console.log(`Mode-behavior check: ${modeBehaviorPass ? 'pass' : 'fail'}`);
    if (inferred === 'code') {
      console.log(`No-op completion check: ${noOpCodeCompletion ? 'fail' : 'pass'}`);
    }
    if (sc.expectedFailure) {
      console.log(`Expected limitation: ${sc.expectedFailure}`);
      console.log(`Expected limitation check: ${expectedFailurePass ? 'pass' : 'fail'}`);
    }
    console.log(`Completion format check: ${formatBool(completionCheck)}`);
    if (!output.result.success && output.result.error) {
      console.log(`Error: ${output.result.error.code} - ${output.result.error.message}`);
    }
  }

  const minRoutingAccuracy = parseNumberArg('min-routing-accuracy', 1);
  const minBehaviorAccuracy = parseNumberArg('min-behavior-accuracy', 1);
  const minCompletionCoverage = parseNumberArg('min-completion-coverage', 0);
  const requireNoUnexpectedFailures = !hasFlag('allow-unexpected-failures');

  const totalScenarios = scenarioResults.length;
  const routingPasses = scenarioResults.filter(s => s.checks.intentRoutingPass).length;
  const behaviorPasses = scenarioResults.filter(s => s.checks.modeBehaviorPass).length;
  const expectedLimitationPasses = scenarioResults.filter(s => s.checks.expectedLimitationPass).length;
  const completionApplicable = scenarioResults.filter(s => s.checks.completionFormatPresent !== null);
  const completionPasses = completionApplicable.filter(s => s.checks.completionFormatPresent === true).length;
  const unexpectedFailures = scenarioResults.filter(s => !s.success && !s.expectedLimitation).length;

  const routingAccuracy = totalScenarios > 0 ? routingPasses / totalScenarios : 0;
  const behaviorAccuracy = totalScenarios > 0 ? behaviorPasses / totalScenarios : 0;
  const completionCoverage =
    completionApplicable.length > 0 ? completionPasses / completionApplicable.length : null;

  const routingPass = routingAccuracy >= minRoutingAccuracy;
  const behaviorPass = behaviorAccuracy >= minBehaviorAccuracy;
  const completionPass = completionCoverage === null || completionCoverage >= minCompletionCoverage;
  const unexpectedFailuresPass = requireNoUnexpectedFailures ? unexpectedFailures === 0 : true;
  const overallPass = routingPass && behaviorPass && completionPass && unexpectedFailuresPass;

  const summary: PromptFirstSuiteSummary = {
    suite: 'prompt-first',
    mode,
    generatedAt: new Date().toISOString(),
    thresholds: {
      minRoutingAccuracy,
      minBehaviorAccuracy,
      minCompletionCoverage,
      requireNoUnexpectedFailures,
    },
    metrics: {
      totalScenarios,
      routingPasses,
      behaviorPasses,
      expectedLimitationPasses,
      completionApplicableScenarios: completionApplicable.length,
      completionPasses,
      unexpectedFailures,
      routingAccuracy,
      behaviorAccuracy,
      completionCoverage,
    },
    pass: {
      routing: routingPass,
      behavior: behaviorPass,
      completion: completionPass,
      unexpectedFailures: unexpectedFailuresPass,
      overall: overallPass,
    },
    scenarios: scenarioResults,
  };

  console.log('\n=== Prompt-First Summary ===');
  console.log(
    `Routing accuracy: ${(routingAccuracy * 100).toFixed(1)}% (${routingPasses}/${totalScenarios}) [threshold ${(
      minRoutingAccuracy * 100
    ).toFixed(1)}%]`,
  );
  console.log(
    `Behavior accuracy: ${(behaviorAccuracy * 100).toFixed(1)}% (${behaviorPasses}/${totalScenarios}) [threshold ${(
      minBehaviorAccuracy * 100
    ).toFixed(1)}%]`,
  );
  console.log(
    `Completion coverage: ${
      completionCoverage === null ? 'n/a' : `${(completionCoverage * 100).toFixed(1)}%`
    } (${completionPasses}/${completionApplicable.length}) [threshold ${(minCompletionCoverage * 100).toFixed(1)}%]`,
  );
  console.log(`Unexpected failures: ${unexpectedFailures} ${requireNoUnexpectedFailures ? '(must be 0)' : '(allowed)'}`);
  console.log(`Overall: ${overallPass ? 'pass' : 'fail'}`);

  const jsonOutput = hasFlag('json');
  const jsonFile = parseArg('json-file');
  if (jsonOutput) {
    console.log(JSON.stringify(summary, null, 2));
  }
  if (jsonFile) {
    const outPath = path.isAbsolute(jsonFile) ? jsonFile : path.join(process.cwd(), jsonFile);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(summary, null, 2), 'utf8');
    console.log(`Wrote JSON summary to ${outPath}`);
  }
  if (hasFlag('fail-on-threshold') && !overallPass) {
    process.exitCode = 2;
  }
}

async function main() {
  dotenv.config({ path: path.join(process.cwd(), '.env.local') });
  dotenv.config({ path: path.join(process.cwd(), '.env.test') });

  const mode = parseMode();
  const intent = parseIntent();
  const suite = parseArg('suite');
  const prompt = parseArg('prompt');

  if (suite === 'architecture') {
    await runArchitectureSuite(mode);
    return;
  }
  if (suite === 'prompt-first') {
    await runPromptFirstSuite(mode);
    return;
  }

  await runSinglePrompt(
    mode,
    prompt || 'Change the border radius in product card CSS from 8px to 10px.',
    undefined,
    intent ?? 'code',
  );
}

main().catch((err) => {
  console.error('Harness run failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
