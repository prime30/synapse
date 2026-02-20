/**
 * Unified diagnostics tool for AI agents.
 *
 * Normalizes outputs from three different validators into a single
 * `UnifiedDiagnostic` type:
 *   - `SyntaxError[]`     from `lib/agents/validation/syntax-checker.ts`
 *   - `ValidationResult`  from `lib/liquid/validator.ts`
 *   - `TypeIssue[]`       from `lib/liquid/type-checker.ts`
 */

import { checkLiquid, checkCSS, checkJavaScript } from '@/lib/agents/validation/syntax-checker';
import type { SyntaxError as SyntaxCheckError } from '@/lib/agents/validation/syntax-checker';
import { LiquidValidator } from '@/lib/liquid/validator';
import type { ValidationResult, ValidationError } from '@/lib/liquid/validator';
import type { TypeIssue } from '@/lib/liquid/type-checker';

// ── Unified diagnostic type ──────────────────────────────────────────────

export interface UnifiedDiagnostic {
  fileName: string;
  line: number;
  column?: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
  category: 'syntax' | 'semantic' | 'type' | 'security';
  suggestion?: string;
}

// ── Adapter functions ────────────────────────────────────────────────────

/** Adapt `SyntaxError[]` from syntax-checker.ts */
export function adaptSyntaxErrors(
  errors: SyntaxCheckError[],
  fileName: string,
): UnifiedDiagnostic[] {
  return errors.map(e => ({
    fileName,
    line: e.line,
    message: e.message,
    severity: e.severity,
    category: 'syntax' as const,
  }));
}

/** Adapt `ValidationResult` from liquid/validator.ts */
export function adaptValidationResult(
  result: ValidationResult,
  fileName: string,
): UnifiedDiagnostic[] {
  const all: UnifiedDiagnostic[] = [];

  for (const err of result.errors) {
    all.push(adaptValidationError(err, fileName));
  }
  for (const warn of result.warnings) {
    all.push(adaptValidationError(warn, fileName));
  }

  return all;
}

function adaptValidationError(
  err: ValidationError,
  fileName: string,
): UnifiedDiagnostic {
  return {
    fileName,
    line: err.line,
    column: err.column,
    message: err.message,
    severity: err.severity,
    category: err.type as UnifiedDiagnostic['category'],
    suggestion: err.suggestion,
  };
}

/** Adapt `TypeIssue[]` from liquid/type-checker.ts */
export function adaptTypeIssues(
  issues: TypeIssue[],
  fileName: string,
): UnifiedDiagnostic[] {
  return issues.map(issue => ({
    fileName,
    line: issue.line,
    column: issue.column,
    message: issue.message,
    severity: issue.severity,
    category: 'type' as const,
  }));
}

// ── Diagnostic cache (by content hash) ───────────────────────────────────

const diagnosticsCache = new Map<string, UnifiedDiagnostic[]>();

function simpleHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const ch = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + ch;
    hash |= 0; // Convert to 32-bit int
  }
  return hash.toString(36);
}

// ── Unified runner ───────────────────────────────────────────────────────

/**
 * Run all relevant diagnostics on a file, dispatching by file type.
 * Results are cached by content hash to avoid redundant work.
 */
export function runDiagnostics(
  fileName: string,
  content: string,
  fileType: string,
): UnifiedDiagnostic[] {
  // Check cache
  const cacheKey = `${fileName}:${simpleHash(content)}`;
  const cached = diagnosticsCache.get(cacheKey);
  if (cached) return cached;

  const diagnostics: UnifiedDiagnostic[] = [];

  switch (fileType) {
    case 'liquid': {
      // Syntax checker (fast, regex-based tag matching)
      const syntaxErrors = checkLiquid(content);
      diagnostics.push(...adaptSyntaxErrors(syntaxErrors, fileName));
      // Note: Deep type checking + semantic analysis runs in runDiagnosticsDeep()
      // which uses LiquidValidator (requires async + AST parsing).
      break;
    }

    case 'css': {
      const cssErrors = checkCSS(content);
      diagnostics.push(...adaptSyntaxErrors(cssErrors, fileName));
      break;
    }

    case 'javascript': {
      const jsErrors = checkJavaScript(content);
      diagnostics.push(...adaptSyntaxErrors(jsErrors, fileName));
      break;
    }

    default:
      // No diagnostics for unknown file types
      break;
  }

  // Deduplicate: same file + line + message → keep first occurrence
  const seen = new Set<string>();
  const deduped = diagnostics.filter(d => {
    const key = `${d.line}:${d.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Cache result
  diagnosticsCache.set(cacheKey, deduped);

  return deduped;
}

/**
 * Run diagnostics asynchronously (includes LiquidValidator's full analysis).
 * Use this for the coordinator validation gate where we want the deepest analysis.
 */
export async function runDiagnosticsDeep(
  fileName: string,
  content: string,
  fileType: string,
  projectId?: string,
): Promise<UnifiedDiagnostic[]> {
  // Start with synchronous diagnostics
  const diagnostics = [...runDiagnostics(fileName, content, fileType)];

  // For Liquid files, also run the full LiquidValidator (async, includes semantic checks)
  if (fileType === 'liquid') {
    try {
      const validator = new LiquidValidator();
      const result: ValidationResult = await validator.validate(content, projectId);
      const validationDiags = adaptValidationResult(result, fileName);

      // Add only diagnostics not already found by the sync checker
      const existingKeys = new Set(diagnostics.map(d => `${d.line}:${d.message}`));
      for (const d of validationDiags) {
        const key = `${d.line}:${d.message}`;
        if (!existingKeys.has(key)) {
          diagnostics.push(d);
          existingKeys.add(key);
        }
      }
    } catch {
      // LiquidValidator may not be available — skip gracefully
    }
  }

  return diagnostics;
}

// ── Formatting helper ────────────────────────────────────────────────────

/**
 * Format diagnostics into a human-readable string for agent consumption.
 */
export function formatDiagnostics(diagnostics: UnifiedDiagnostic[]): string {
  const errors = diagnostics.filter(d => d.severity === 'error');
  const warnings = diagnostics.filter(d => d.severity === 'warning');
  const info = diagnostics.filter(d => d.severity === 'info');

  const sections: string[] = [];

  if (errors.length > 0) {
    sections.push(
      `Errors (${errors.length}):\n` +
      errors.map(e => {
        const loc = e.column ? `Line ${e.line}:${e.column}` : `Line ${e.line}`;
        const sug = e.suggestion ? ` — Suggestion: ${e.suggestion}` : '';
        return `  ${loc}: ${e.message}${sug}`;
      }).join('\n')
    );
  }

  if (warnings.length > 0) {
    sections.push(
      `Warnings (${warnings.length}):\n` +
      warnings.map(w => {
        const loc = w.column ? `Line ${w.line}:${w.column}` : `Line ${w.line}`;
        const sug = w.suggestion ? ` — Suggestion: ${w.suggestion}` : '';
        return `  ${loc}: ${w.message}${sug}`;
      }).join('\n')
    );
  }

  if (info.length > 0) {
    sections.push(
      `Info (${info.length}):\n` +
      info.map(i => `  Line ${i.line}: ${i.message}`).join('\n')
    );
  }

  return sections.join('\n\n');
}

/**
 * Clear the diagnostics cache (call when files are updated).
 */
export function clearDiagnosticsCache(): void {
  diagnosticsCache.clear();
}

// ── Post-apply diagnostics ──────────────────────────────────────────────

export interface DiagnosticsResult {
  valid: boolean;
  issues: { line: number; message: string; severity: 'error' | 'warning' }[];
}

function inferFileType(filePath: string): string {
  if (filePath.endsWith('.liquid')) return 'liquid';
  if (filePath.endsWith('.js') || filePath.endsWith('.ts')) return 'javascript';
  if (filePath.endsWith('.css') || filePath.endsWith('.scss')) return 'css';
  if (filePath.endsWith('.json')) return 'json';
  return 'other';
}

/**
 * Run diagnostics on a file after apply and return a simplified result
 * suitable for the apply-with-diagnostics API response.
 */
export async function runPostApplyDiagnostics(
  filePath: string,
  content: string,
): Promise<DiagnosticsResult> {
  const fileType = inferFileType(filePath);

  const diagnostics = await runDiagnosticsDeep(filePath, content, fileType);

  const issues = diagnostics
    .filter(d => d.severity === 'error' || d.severity === 'warning')
    .map(d => ({
      line: d.line,
      message: d.message,
      severity: d.severity as 'error' | 'warning',
    }));

  return {
    valid: !issues.some(i => i.severity === 'error'),
    issues,
  };
}
