/**
 * Parses text-format review tool output into a structured ReviewResult.
 *
 * Extracted from coordinator-v2.ts to avoid circular-dependency issues
 * when test files import this pure function.
 */

import type { ReviewResult } from '@/lib/types/agent';

export function parseReviewToolContent(content: string): ReviewResult | null {
  if (!content || !/^Review\s+(APPROVED|NEEDS CHANGES)/m.test(content)) return null;

  const lines = content.split(/\r?\n/);
  const approved = /^Review\s+APPROVED/i.test(lines[0] ?? '');
  const issues: ReviewResult['issues'] = [];

  let summary = '';
  let inIssues = false;
  for (const rawLine of lines.slice(1)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^Issues\s*\(\d+\):/i.test(line)) {
      inIssues = true;
      continue;
    }
    if (!inIssues && !summary) {
      summary = line;
      continue;
    }
    if (!inIssues) continue;

    const match = line.match(/^- \[(error|warning|info)\]\s+(.+?):\s+(.+)$/i);
    if (!match) continue;
    const sev = match[1].toLowerCase();
    const severity: 'error' | 'warning' | 'info' =
      sev === 'error' || sev === 'warning' || sev === 'info' ? sev : 'info';
    issues.push({
      severity,
      file: match[2].trim(),
      description: match[3].trim(),
      category: 'consistency',
    });
  }

  return {
    approved,
    summary: summary || (approved ? 'Review approved.' : 'Review needs changes.'),
    issues,
  };
}
