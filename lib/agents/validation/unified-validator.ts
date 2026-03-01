/**
 * Unified code-change validator that chains structural, cross-file, and
 * design-token checks into a single call with timeout protection.
 */

import type { CodeChange, FileContext } from '@/lib/types/agent';
import { validateChangeSet } from './change-set-validator';
import type { ValidationIssue as ChangeSetIssue } from './change-set-validator';
import { checkCrossFileConsistency } from './consistency-checker';
import type { ConsistencyIssue } from './consistency-checker';
import { DesignCodeValidator } from '@/lib/design-tokens/agent-integration/code-validator';
import type { ValidationIssue as DesignTokenIssue } from '@/lib/design-tokens/agent-integration/code-validator';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface UnifiedValidationIssue {
  severity: 'error' | 'warning' | 'info';
  file: string;
  description: string;
  category: 'syntax' | 'schema' | 'consistency' | 'design_token' | 'cross_file' | 'companion_css' | 'companion_schema';
  source: string;
}

export interface UnifiedValidationResult {
  valid: boolean;
  issues: UnifiedValidationIssue[];
  timing: { totalMs: number };
}

// ---------------------------------------------------------------------------
// Severity ordering for sort
// ---------------------------------------------------------------------------

const SEVERITY_RANK: Record<UnifiedValidationIssue['severity'], number> = {
  error: 0,
  warning: 1,
  info: 2,
};

// ---------------------------------------------------------------------------
// Internal mappers
// ---------------------------------------------------------------------------

const CHANGESET_CATEGORY_MAP: Record<ChangeSetIssue['category'], UnifiedValidationIssue['category']> = {
  snippet_reference: 'syntax',
  css_class: 'consistency',
  template_section: 'syntax',
  schema_setting: 'schema',
  asset_reference: 'syntax',
  deprecated_liquid: 'syntax',
  locale_key: 'consistency',
  companion_css: 'companion_css',
  companion_js: 'consistency',
  companion_schema: 'companion_schema',
};

function mapChangeSetIssue(issue: ChangeSetIssue): UnifiedValidationIssue {
  return {
    severity: issue.severity,
    file: issue.file,
    description: issue.description,
    category: CHANGESET_CATEGORY_MAP[issue.category] ?? 'syntax',
    source: 'change-set-validator',
  };
}

function mapConsistencyIssue(issue: ConsistencyIssue): UnifiedValidationIssue {
  return {
    severity: issue.severity,
    file: issue.affectedFiles[0] ?? 'unknown',
    description: issue.description,
    category: 'cross_file',
    source: 'consistency-checker',
  };
}

function mapDesignTokenIssue(issue: DesignTokenIssue, file: string): UnifiedValidationIssue {
  return {
    severity: 'warning',
    file,
    description: `Line ${issue.lineNumber}: ${issue.suggestion}`,
    category: 'design_token',
    source: 'design-code-validator',
  };
}

// ---------------------------------------------------------------------------
// File type helper for DesignCodeValidator
// ---------------------------------------------------------------------------

function inferFileType(fileName: string): 'css' | 'liquid' | 'js' | null {
  if (/\.liquid$/.test(fileName)) return 'liquid';
  if (/\.(css|scss)$/.test(fileName)) return 'css';
  if (/\.(js|ts)$/.test(fileName)) return 'js';
  return null;
}

// ---------------------------------------------------------------------------
// Timeout helper
// ---------------------------------------------------------------------------

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | 'timeout'> {
  return Promise.race([
    promise,
    new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), ms)),
  ]);
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function validateCodeChanges(
  changes: CodeChange[],
  projectFiles: FileContext[],
  options?: {
    designTokens?: unknown;
    skipTokenChecks?: boolean;
    timeoutMs?: number;
  },
): Promise<UnifiedValidationResult> {
  const start = performance.now();
  const timeoutMs = options?.timeoutMs ?? 2000;
  const issues: UnifiedValidationIssue[] = [];

  try {
    // ---- 1. Structural checks (synchronous) ----
    const changeSetResult = validateChangeSet(changes, projectFiles);
    issues.push(...changeSetResult.issues.map(mapChangeSetIssue));

    if (performance.now() - start > timeoutMs) {
      return buildResult(issues, start);
    }

    // ---- 2. Cross-file consistency (synchronous) ----
    const consistencyIssues = checkCrossFileConsistency(changes, projectFiles);
    issues.push(...consistencyIssues.map(mapConsistencyIssue));

    if (performance.now() - start > timeoutMs) {
      return buildResult(issues, start);
    }

    // ---- 3. Design token checks (async, optional) ----
    const tokens = options?.designTokens;
    const shouldCheckTokens =
      tokens != null &&
      !options?.skipTokenChecks &&
      typeof tokens === 'object' &&
      'projectId' in (tokens as Record<string, unknown>) &&
      typeof (tokens as Record<string, unknown>).projectId === 'string';

    if (shouldCheckTokens) {
      const projectId = (tokens as { projectId: string }).projectId;
      const validator = new DesignCodeValidator();
      const remaining = timeoutMs - (performance.now() - start);

      if (remaining > 0) {
        const tokenPromises = changes
          .filter((c) => inferFileType(c.fileName) !== null)
          .map(async (c) => {
            const ft = inferFileType(c.fileName)!;
            try {
              const report = await validator.validateGeneratedCode(
                c.proposedContent,
                projectId,
                ft,
              );
              return report.issues.map((i) => mapDesignTokenIssue(i, c.fileName));
            } catch {
              return [] as UnifiedValidationIssue[];
            }
          });

        const result = await withTimeout(
          Promise.all(tokenPromises),
          Math.max(remaining, 100),
        );

        if (result !== 'timeout') {
          for (const batch of result) {
            issues.push(...batch);
          }
        }
      }
    }
  } catch {
    // Validation failures must never crash the coordinator
  }

  return buildResult(issues, start);
}

// ---------------------------------------------------------------------------
// Result builder
// ---------------------------------------------------------------------------

function buildResult(
  issues: UnifiedValidationIssue[],
  startTime: number,
): UnifiedValidationResult {
  issues.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  return {
    valid: !issues.some((i: UnifiedValidationIssue) => i.severity === 'error'),
    issues,
    timing: { totalMs: Math.round(performance.now() - startTime) },
  };
}
