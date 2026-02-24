/**
 * Bug fix scoring for real-bug evaluation suite.
 *
 * Scores agent output against expected fix patterns and regression checks.
 */

import type { BugScenario } from '../agents/testing/bug-scenarios';

export interface BugFixScore {
  scenarioId: string;
  foundCorrectFile: boolean;
  madeChange: boolean;
  changeCorrect: boolean;
  noRegressions: boolean;
  toolCallsUsed: number;
  totalScore: number; // 0-4
}

export interface AgentBugFixOutput {
  changes: Array<{ file: string; content: string }>;
  toolCalls: number;
}

/**
 * Scores a bug fix attempt against the scenario's expected fix.
 *
 * - foundCorrectFile: agent modified at least one expected fix file
 * - madeChange: agent made at least one change
 * - changeCorrect: modified content matches expectedFixPattern
 * - noRegressions: regression check files either unchanged or improved
 */
export function scoreBugFix(
  scenario: BugScenario,
  agentOutput: AgentBugFixOutput,
): BugFixScore {
  const { changes, toolCalls } = agentOutput;

  const expectedPaths = new Set(
    scenario.expectedFixFiles.map((p) => p.replace(/\\/g, '/').toLowerCase()),
  );
  const changedPaths = new Set(
    changes.map((c) => c.file.replace(/\\/g, '/').toLowerCase()),
  );

  const foundCorrectFile = scenario.expectedFixFiles.some((p) => {
    const norm = p.replace(/\\/g, '/').toLowerCase();
    return [...changedPaths].some((c) => c.endsWith(norm) || c.includes(norm));
  });

  const madeChange = changes.length > 0;

  let changeCorrect = false;
  if (madeChange && foundCorrectFile) {
    const relevantChanges = changes.filter((c) => {
      const norm = c.file.replace(/\\/g, '/').toLowerCase();
      return scenario.expectedFixFiles.some((p) => {
        const pNorm = p.replace(/\\/g, '/').toLowerCase();
        return norm.endsWith(pNorm) || norm.includes(pNorm);
      });
    });
    changeCorrect = relevantChanges.some((c) => scenario.expectedFixPattern.test(c.content));
  }

  let noRegressions = true;
  if (scenario.regressionCheckFiles.length > 0 && madeChange) {
    const regressionPaths = new Set(
      scenario.regressionCheckFiles.map((p) => p.replace(/\\/g, '/').toLowerCase()),
    );
    const modifiedRegressions = changes.filter((c) => {
      const norm = c.file.replace(/\\/g, '/').toLowerCase();
      return [...regressionPaths].some((r) => norm.endsWith(r) || norm.includes(r));
    });
    noRegressions = modifiedRegressions.length === 0 || changeCorrect;
  }

  const totalScore =
    (foundCorrectFile ? 1 : 0) +
    (madeChange ? 1 : 0) +
    (changeCorrect ? 1 : 0) +
    (noRegressions ? 1 : 0);

  return {
    scenarioId: scenario.id,
    foundCorrectFile,
    madeChange,
    changeCorrect,
    noRegressions,
    toolCallsUsed: toolCalls,
    totalScore,
  };
}
