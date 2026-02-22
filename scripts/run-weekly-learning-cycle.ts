/**
 * Weekly continuous learning cycle runner.
 *
 * 1. Runs the finetune eval suite to capture current KPIs
 * 2. Generates a drift report against baseline
 * 3. Builds hard-case replay suite
 * 4. Checks retraining triggers
 * 5. Outputs cycle report
 *
 * Usage:
 *   npx tsx scripts/run-weekly-learning-cycle.ts [--json-file <path>]
 *     [--capture-baseline] [--force-retrain]
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import {
  captureBaseline,
  generateDriftReport,
  recordObservation,
  getBaseline,
  setBaseline,
} from '../lib/finetune/drift-detector';
import {
  runWeeklyCycle,
  triggerManualRetraining,
} from '../lib/finetune/continuous-learning';
import type { DriftMetrics } from '../lib/finetune/drift-detector';

function parseArg(name: string): string | undefined {
  const idx = process.argv.findIndex((a) => a === `--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  dotenv.config({ path: path.join(process.cwd(), '.env.local') });
  dotenv.config({ path: path.join(process.cwd(), '.env.test') });

  const jsonFile = parseArg('json-file');
  const shouldCaptureBaseline = hasFlag('capture-baseline');
  const forceRetrain = hasFlag('force-retrain');

  console.log('=== Weekly Learning Cycle ===');

  // Load baseline from disk if it exists
  const baselinePath = path.join(process.cwd(), '.verification', 'finetune-baseline.json');
  if (fs.existsSync(baselinePath)) {
    const saved = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    setBaseline(saved);
    console.log(`Loaded baseline: ${saved.snapshotId} (${saved.sampleCount} samples)`);
  }

  // Load latest eval summary if it exists and record as observation
  const evalPath = path.join(process.cwd(), '.verification', 'finetune-eval-summary.json');
  if (fs.existsSync(evalPath)) {
    const evalSummary = JSON.parse(fs.readFileSync(evalPath, 'utf8'));
    const metrics: DriftMetrics = {
      modeAccuracy: evalSummary.modeAccuracy ?? 0,
      conversationScore: evalSummary.avgConversationScore ?? 0,
      safetyScore: evalSummary.avgSafetyScore ?? 0,
      hallucinationRate: evalSummary.hallucinationRate ?? 0,
      antiPatternCleanRate: evalSummary.antiPatternCleanRate ?? 0,
      clarificationQuality: evalSummary.clarificationQuality ?? 0,
      planDecompositionQuality: evalSummary.planDecompositionQuality ?? 0,
    };
    recordObservation(metrics);
    console.log('Recorded eval observation from latest summary');
  } else {
    console.log('No eval summary found; skipping observation recording');
  }

  // Capture baseline if requested
  if (shouldCaptureBaseline || !getBaseline()) {
    const baseline = captureBaseline();
    fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
    fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 2), 'utf8');
    console.log(`Captured baseline: ${baseline.snapshotId}`);
  }

  // Generate drift report
  const driftReport = generateDriftReport();
  if (driftReport) {
    console.log(`\nDrift Report: ${driftReport.reportId}`);
    console.log(`  Samples: ${driftReport.sampleCount}`);
    console.log(`  Healthy: ${driftReport.overallHealthy}`);
    if (driftReport.alerts.length > 0) {
      console.log('  Alerts:');
      for (const alert of driftReport.alerts) {
        console.log(`    [${alert.severity}] ${alert.message}`);
      }
    } else {
      console.log('  No drift alerts');
    }
  } else {
    console.log('\nInsufficient data for drift report (need 20+ observations)');
  }

  // Run weekly cycle
  if (forceRetrain) {
    const trigger = triggerManualRetraining();
    console.log(`\nManual retrain triggered: ${trigger.triggeredAt}`);
  }

  const cycleReport = runWeeklyCycle(driftReport ?? undefined);

  console.log(`\nWeekly Cycle: ${cycleReport.cycleId}`);
  console.log(`  Hard cases: ${cycleReport.hardCaseSuite.totalCases}`);
  console.log(`  Retraining triggered: ${cycleReport.retrainingTriggered}`);
  console.log('  Actions:');
  for (const action of cycleReport.actions) {
    console.log(`    - ${action}`);
  }

  // Save report
  if (jsonFile) {
    const outPath = path.isAbsolute(jsonFile) ? jsonFile : path.join(process.cwd(), jsonFile);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const fullReport = {
      cycle: cycleReport,
      drift: driftReport,
    };
    fs.writeFileSync(outPath, JSON.stringify(fullReport, null, 2), 'utf8');
    console.log(`\nWrote report to ${outPath}`);
  }
}

main().catch((err) => {
  console.error('Weekly cycle failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
