import { estimateTokens } from '@/lib/ai/token-counter';
import type { FileContext } from '@/lib/types/agent';

/**
 * Budget-aware file inclusion for specialist prompts.
 *
 * Strategy:
 * 1. Sort by priority (affected/active files first, then by size ascending)
 * 2. Include files with full content while within budget
 * 3. Try smart truncation for files that exceed remaining budget
 * 4. Stub as last resort
 *
 * This prevents specialist prompts from exceeding their token budget while
 * preserving the most important context (imports, exports, structure).
 */
export function budgetFiles(
  files: FileContext[],
  maxTokens: number,
  priorityIds?: string[],
): FileContext[] {
  if (files.length === 0) return [];

  const prioritySet = new Set(priorityIds ?? []);

  // Sort: priority IDs first, then by content length ascending (fit more small files)
  const sorted = [...files].sort((a, b) => {
    const aPri = prioritySet.has(a.fileId) || prioritySet.has(a.fileName) ? 0 : 1;
    const bPri = prioritySet.has(b.fileId) || prioritySet.has(b.fileName) ? 0 : 1;
    if (aPri !== bPri) return aPri - bPri;
    return a.content.length - b.content.length;
  });

  let used = 0;
  const result: FileContext[] = [];

  for (const f of sorted) {
    // Skip stubs — they're already minimal
    if (f.content.startsWith('[') && f.content.endsWith(']')) {
      result.push(f);
      used += estimateTokens(f.content);
      continue;
    }

    const tokens = estimateTokens(f.content);
    if (used + tokens <= maxTokens) {
      result.push(f);
      used += tokens;
      continue;
    }

    // Try smart truncation: keep imports/exports, truncate middle
    const remaining = maxTokens - used;
    const truncated = smartTruncate(f.content, remaining);
    if (truncated) {
      const truncTokens = estimateTokens(truncated);
      result.push({ ...f, content: truncated });
      used += truncTokens;
      continue;
    }

    // Full stub as last resort
    result.push({ ...f, content: `[${f.content.length} chars — over budget]` });
  }

  return result;
}

/**
 * Smart truncation: keeps the first ~50 lines (imports, type declarations, schema)
 * and the last ~20 lines (exports, closing tags), truncates the middle.
 *
 * Returns null if even the truncated version doesn't fit the budget.
 */
function smartTruncate(content: string, budget: number): string | null {
  if (budget < 200) return null; // Not enough for even a header

  const lines = content.split('\n');
  if (lines.length <= 70) {
    // File is small enough that truncation wouldn't save much — just check if it fits
    return estimateTokens(content) <= budget ? content : null;
  }

  const headCount = Math.min(50, Math.floor(lines.length * 0.4));
  const tailCount = Math.min(20, Math.floor(lines.length * 0.15));

  const head = lines.slice(0, headCount).join('\n');
  const tail = lines.slice(-tailCount).join('\n');
  const truncatedLineCount = lines.length - headCount - tailCount;

  const truncated = `${head}\n\n// ... [${truncatedLineCount} lines truncated for budget] ...\n\n${tail}`;

  if (estimateTokens(truncated) <= budget) {
    return truncated;
  }

  // Even truncated version is too big — try with just the head
  const headOnly = `${head}\n\n// ... [${lines.length - headCount} lines truncated for budget] ...`;
  if (estimateTokens(headOnly) <= budget) {
    return headOnly;
  }

  return null;
}
