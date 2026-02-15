import { parseLiquidAST } from '@/lib/liquid/liquid-ast';
import { TypeChecker } from '@/lib/liquid/type-checker';
import { ScopeTracker } from '@/lib/liquid/scope-tracker';
import type { FileContext } from '@/lib/types/agent';
import { estimateTokens } from '@/lib/ai/token-counter';

// ── Types ────────────────────────────────────────────────────────────────────

export interface DiagnosticEntry {
  file: string;
  line: number;
  column: number;
  severity: 'error' | 'warning';
  message: string;
}

export interface DiagnosticResult {
  entries: DiagnosticEntry[];
  errorCount: number;
  warningCount: number;
  /** LLM-ready formatted string (capped at ~2000 tokens) */
  formatted: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Maximum token budget for diagnostic context injected into agent prompts. */
const DIAGNOSTIC_TOKEN_BUDGET = 2000;

// ── Main function ────────────────────────────────────────────────────────────

/**
 * Run Liquid diagnostics on file contexts and return formatted results.
 * Only processes `.liquid` files with real content (not stubs).
 * Caps formatted output at ~2000 tokens.
 */
export function buildDiagnosticContext(files: FileContext[]): DiagnosticResult {
  const entries: DiagnosticEntry[] = [];

  // Filter to liquid files with real content (not stubs starting with '[')
  const liquidFiles = files.filter(
    (f) => f.fileType === 'liquid' && f.content && !f.content.startsWith('[')
  );

  if (liquidFiles.length === 0) {
    return { entries: [], errorCount: 0, warningCount: 0, formatted: '' };
  }

  for (const file of liquidFiles) {
    const displayName = file.path || file.fileName;

    try {
      // 1. Parse the Liquid AST
      const parseResult = parseLiquidAST(file.content);

      // Collect parse errors
      for (const err of parseResult.errors) {
        entries.push({
          file: displayName,
          line: err.loc.line,
          column: err.loc.column,
          severity: 'error',
          message: err.message,
        });
      }

      // 2. If AST is available, run type checking
      if (parseResult.ast.length > 0) {
        try {
          const scopeTracker = new ScopeTracker();
          scopeTracker.buildFromAST(parseResult.ast);

          const typeChecker = new TypeChecker();
          const typeIssues = typeChecker.walkAndCheck(
            parseResult.ast,
            new Map(),
            scopeTracker,
          );

          for (const issue of typeIssues) {
            entries.push({
              file: displayName,
              line: issue.line,
              column: issue.column,
              severity: issue.severity,
              message: issue.message,
            });
          }
        } catch (typeErr) {
          console.warn(`[diagnostic-context] Type check failed for ${displayName}:`, typeErr);
        }
      }
    } catch (parseErr) {
      console.warn(`[diagnostic-context] Parse failed for ${displayName}:`, parseErr);
    }
  }

  if (entries.length === 0) {
    return { entries: [], errorCount: 0, warningCount: 0, formatted: '' };
  }

  const errorCount = entries.filter((e) => e.severity === 'error').length;
  const warningCount = entries.filter((e) => e.severity === 'warning').length;

  // Format and cap to token budget
  const formatted = formatAndCap(entries);

  return { entries, errorCount, warningCount, formatted };
}

// ── Formatting helpers ───────────────────────────────────────────────────────

/**
 * Format diagnostic entries grouped by file, capped at DIAGNOSTIC_TOKEN_BUDGET.
 * Truncation order: remove warnings first (from alphabetically last files),
 * then truncate errors by file (alphabetically last first).
 */
function formatAndCap(entries: DiagnosticEntry[]): string {
  // Group entries by file
  const byFile = new Map<string, DiagnosticEntry[]>();
  for (const entry of entries) {
    const existing = byFile.get(entry.file) ?? [];
    existing.push(entry);
    byFile.set(entry.file, existing);
  }

  // Sort files alphabetically
  const sortedFiles = [...byFile.keys()].sort();

  // Build the full formatted string
  let formatted = formatEntries(sortedFiles, byFile);

  // Check token budget
  if (estimateTokens(formatted) <= DIAGNOSTIC_TOKEN_BUDGET) {
    return formatted;
  }

  // Truncation: remove warnings from last files first
  const mutableByFile = new Map(byFile);
  const reversedFiles = [...sortedFiles].reverse();

  for (const file of reversedFiles) {
    const fileEntries = mutableByFile.get(file) ?? [];
    const errorsOnly = fileEntries.filter((e) => e.severity === 'error');
    if (errorsOnly.length < fileEntries.length) {
      mutableByFile.set(file, errorsOnly);
      formatted = formatEntries(sortedFiles, mutableByFile);
      if (estimateTokens(formatted) <= DIAGNOSTIC_TOKEN_BUDGET) {
        return formatted;
      }
    }
  }

  // Still over budget: remove entire files from end
  const remainingFiles = sortedFiles.filter((f) => (mutableByFile.get(f)?.length ?? 0) > 0);
  while (remainingFiles.length > 1 && estimateTokens(formatted) > DIAGNOSTIC_TOKEN_BUDGET) {
    const removed = remainingFiles.pop()!;
    mutableByFile.delete(removed);
    formatted = formatEntries(remainingFiles, mutableByFile);
  }

  return formatted;
}

function formatEntries(
  sortedFiles: string[],
  byFile: Map<string, DiagnosticEntry[]>,
): string {
  const lines: string[] = ['[Current Diagnostics]'];

  for (const file of sortedFiles) {
    const fileEntries = byFile.get(file);
    if (!fileEntries || fileEntries.length === 0) continue;

    lines.push(`${file}:`);
    // Sort by line number within each file
    const sorted = [...fileEntries].sort((a, b) => a.line - b.line);
    for (const entry of sorted) {
      lines.push(`  - Line ${entry.line}: ${entry.message} (${entry.severity})`);
    }
  }

  return lines.join('\n');
}
