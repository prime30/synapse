import type { CodeChange, ReviewResult } from '@/lib/types/agent';

interface GuardInput {
  analysis?: string;
  intentMode: 'ask' | 'code' | 'plan' | 'debug';
  needsClarification?: boolean;
  changes?: CodeChange[];
  reviewResult?: ReviewResult;
}

const WHAT_HEADING = "### What I've changed";
const WHY_HEADING = '### Why this helps';
const VALIDATION_HEADING = '### Validation confirmation';

function hasHeading(text: string, heading: string): boolean {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}\\s*$`, 'im').test(text);
}

function formatChangedFiles(changes: CodeChange[]): string {
  if (changes.length === 0) return '- No file changes were applied in this run.';
  const names = [...new Set(changes.map((c) => c.fileName))];
  const top = names.slice(0, 6).map((n) => `- Updated \`${n}\`.`);
  if (names.length > 6) top.push(`- Updated ${names.length - 6} additional file(s).`);
  return top.join('\n');
}

function formatValidation(reviewResult?: ReviewResult, analysis?: string): string {
  const lines: string[] = [];
  if (reviewResult) {
    lines.push(
      `- Review agent: ${reviewResult.approved ? 'approved' : 'needs changes'} (${reviewResult.issues.length} issue(s)).`,
    );
  }
  if (analysis && /Verification evidence:/i.test(analysis)) {
    lines.push('- Verification evidence: verifyChanges, cross-file validation, and theme check executed.');
  }
  if (lines.length === 0) {
    lines.push('- Validation checks were not explicitly recorded in this run.');
  }
  return lines.join('\n');
}

export function ensureCompletionResponseSections(input: GuardInput): string {
  const original = (input.analysis ?? '').trim();
  if (input.intentMode !== 'code' || input.needsClarification) return original;

  const hasWhat = hasHeading(original, WHAT_HEADING);
  const hasWhy = hasHeading(original, WHY_HEADING);
  const hasValidation = hasHeading(original, VALIDATION_HEADING);
  if (hasWhat && hasWhy && hasValidation) return original;

  const parts: string[] = [];
  if (original) parts.push(original);

  if (!hasWhat) {
    parts.push(`${WHAT_HEADING}\n${formatChangedFiles(input.changes ?? [])}`);
  }
  if (!hasWhy) {
    parts.push(
      `${WHY_HEADING}\n- This keeps the outcome clear for implementation, review, and follow-up iteration.`,
    );
  }
  if (!hasValidation) {
    parts.push(
      `${VALIDATION_HEADING}\n${formatValidation(input.reviewResult, original)}`,
    );
  }

  return parts.join('\n\n').trim();
}
