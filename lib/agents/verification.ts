import { parseLiquidAST } from '@/lib/liquid/liquid-ast';
import { TypeChecker } from '@/lib/liquid/type-checker';
import { ScopeTracker } from '@/lib/liquid/scope-tracker';
import type { CodeChange, FileContext } from '@/lib/types/agent';
import type { ThemeCheckIssue } from '@/lib/agents/tools/theme-check';

// ── Types ────────────────────────────────────────────────────────────────────

export interface VerificationIssue {
  file: string;
  line: number;
  severity: 'error' | 'warning';
  message: string;
  category: 'syntax' | 'type' | 'schema' | 'reference';
}

export interface VerificationResult {
  passed: boolean;
  issues: VerificationIssue[];
  errorCount: number;
  warningCount: number;
  /** Formatted string for appending to specialist retry prompt */
  formatted: string;
}

// ── Main function ────────────────────────────────────────────────────────────

/**
 * Validate proposed code changes against Liquid syntax, types, schema,
 * and cross-file references. Returns a VerificationResult indicating
 * whether changes pass validation.
 *
 * @param changes  - Proposed code changes from specialist agents
 * @param allFiles - All project files (for cross-file reference checking)
 */
function verificationIssueKey(i: VerificationIssue): string {
  return `${i.severity}:${i.category}:${i.file}:${i.message}`;
}

function runVerificationChecks(
  content: string,
  fileName: string,
  allFiles: FileContext[],
): VerificationIssue[] {
  const issues: VerificationIssue[] = [];
  const isLiquid = fileName.endsWith('.liquid');
  const isJSON = fileName.endsWith('.json');

  if (isLiquid) {
    try {
      const parseResult = parseLiquidAST(content);
      for (const err of parseResult.errors) {
        issues.push({ file: fileName, line: err.loc.line, severity: 'error', message: err.message, category: 'syntax' });
      }
      if (parseResult.ast.length > 0) {
        try {
          const scopeTracker = new ScopeTracker();
          scopeTracker.buildFromAST(parseResult.ast);
          const typeChecker = new TypeChecker();
          const typeIssues = typeChecker.walkAndCheck(parseResult.ast, new Map(), scopeTracker);
          for (const issue of typeIssues) {
            issues.push({ file: fileName, line: issue.line, severity: issue.severity, message: issue.message, category: 'type' });
          }
        } catch (err) {
          issues.push({ file: fileName, line: 0, severity: 'warning', message: `Type validation skipped: ${err instanceof Error ? err.message : String(err)}`, category: 'type' });
        }
      }
    } catch (err) {
      issues.push({ file: fileName, line: 0, severity: 'warning', message: `Syntax validation skipped: ${err instanceof Error ? err.message : String(err)}`, category: 'syntax' });
    }

    try {
      const schemaMatch = content.match(/\{%[-\s]*schema\s*[-]?%\}([\s\S]*?)\{%[-\s]*endschema\s*[-]?%\}/);
      if (schemaMatch) {
        const schemaContent = schemaMatch[1].trim();
        try {
          const schema = JSON.parse(schemaContent);
          if (!schema.name || typeof schema.name !== 'string') {
            issues.push({ file: fileName, line: 0, severity: 'warning', message: "Schema missing 'name' field", category: 'schema' });
          }
          if (Array.isArray(schema.settings)) {
            for (const setting of schema.settings) {
              if (!setting.type) {
                issues.push({ file: fileName, line: 0, severity: 'error', message: `Schema setting missing 'type' field${setting.id ? ` (id: ${setting.id})` : ''}`, category: 'schema' });
              }
              if (!setting.id && setting.type !== 'header' && setting.type !== 'paragraph') {
                issues.push({ file: fileName, line: 0, severity: 'error', message: `Schema setting missing 'id' field (type: ${setting.type})`, category: 'schema' });
              }
            }
          }
        } catch {
          issues.push({ file: fileName, line: 0, severity: 'error', message: 'Invalid JSON in schema block', category: 'schema' });
        }
      }
    } catch { /* Schema extraction failed */ }

    try {
      const renderPattern = /\{%[-\s]*render\s+['"]([^'"]+)['"]/g;
      let match;
      while ((match = renderPattern.exec(content)) !== null) {
        const snippetName = match[1];
        const snippetPath = `snippets/${snippetName}.liquid`;
        const exists = allFiles.some(
          (f) => f.path === snippetPath || f.fileName === snippetPath || f.fileName === `${snippetName}.liquid`
        );
        if (!exists) {
          issues.push({ file: fileName, line: 0, severity: 'warning', message: `Rendered snippet '${snippetName}' not found in project`, category: 'reference' });
        }
      }
    } catch { /* Reference check failed */ }
  }

  if (isJSON) {
    try {
      const parsed = JSON.parse(content);
      if (parsed.sections && typeof parsed.sections === 'object') {
        for (const [key, section] of Object.entries(parsed.sections)) {
          const sec = section as Record<string, unknown>;
          if (sec.type && typeof sec.type === 'string') {
            const sectionPath = `sections/${sec.type}.liquid`;
            const exists = allFiles.some(
              (f) => f.path === sectionPath || f.fileName === sectionPath || f.fileName === `${sec.type}.liquid`
            );
            if (!exists) {
              issues.push({ file: fileName, line: 0, severity: 'error', message: `Section type '${sec.type}' (key: ${key}) not found in project`, category: 'reference' });
            }
          }
        }
      }
    } catch { /* Not valid JSON or not a template file */ }
  }

  return issues;
}

export function verifyChanges(
  changes: CodeChange[],
  allFiles: FileContext[],
): VerificationResult {
  if (!changes || changes.length === 0) {
    return { passed: true, issues: [], errorCount: 0, warningCount: 0, formatted: '' };
  }

  const afterIssues: VerificationIssue[] = [];
  const beforeIssues: VerificationIssue[] = [];

  for (const change of changes) {
    afterIssues.push(...runVerificationChecks(change.proposedContent, change.fileName, allFiles));
    if (change.originalContent) {
      beforeIssues.push(...runVerificationChecks(change.originalContent, change.fileName, allFiles));
    }
  }

  // Only report regressions — issues that are new (not in the baseline)
  const baselineSet = new Set(beforeIssues.map(verificationIssueKey));
  const regressions = afterIssues.filter(i => !baselineSet.has(verificationIssueKey(i)));

  const errorCount = regressions.filter((i) => i.severity === 'error').length;
  const warningCount = regressions.filter((i) => i.severity === 'warning').length;
  const formatted = formatVerificationIssues(regressions);

  return {
    passed: errorCount === 0,
    issues: regressions,
    errorCount,
    warningCount,
    formatted,
  };
}

// ── Formatting ───────────────────────────────────────────────────────────────

function formatVerificationIssues(issues: VerificationIssue[]): string {
  if (issues.length === 0) return '';

  const byFile = new Map<string, VerificationIssue[]>();
  for (const issue of issues) {
    const existing = byFile.get(issue.file) ?? [];
    existing.push(issue);
    byFile.set(issue.file, existing);
  }

  const lines: string[] = ['[Verification Issues]'];

  for (const [file, fileIssues] of byFile) {
    lines.push(`${file}:`);
    const sorted = [...fileIssues].sort((a, b) => a.line - b.line);
    for (const issue of sorted) {
      const lineRef = issue.line > 0 ? `Line ${issue.line}: ` : '';
      lines.push(`  - ${lineRef}[${issue.category}] ${issue.message} (${issue.severity})`);
    }
  }

  return lines.join('\n');
}

// ── Theme Check Issue Conversion ─────────────────────────────────────────────

const THEME_CHECK_CATEGORY_MAP: Record<string, VerificationIssue['category']> = {
  'schema-validation': 'schema',
  'schema': 'schema',
  'syntax': 'syntax',
  'liquid-syntax': 'syntax',
  'deprecation': 'syntax',
  'template-json': 'reference',
  'required-files': 'reference',
  'accessibility': 'syntax',
  'performance': 'syntax',
};

export function convertThemeCheckIssue(issue: ThemeCheckIssue): VerificationIssue | null {
  if (issue.severity === 'info') return null;
  return {
    file: issue.file ?? 'unknown',
    line: issue.line ?? 0,
    severity: issue.severity === 'error' ? 'error' : 'warning',
    message: issue.message,
    category: THEME_CHECK_CATEGORY_MAP[issue.category] ?? 'syntax',
  };
}

export function mergeThemeCheckIssues(
  existing: VerificationIssue[],
  themeCheckIssues: ThemeCheckIssue[],
): VerificationIssue[] {
  const seen = new Set(existing.map(i => `${i.file}:${i.line}:${i.message}`));
  const merged = [...existing];
  for (const tci of themeCheckIssues) {
    const converted = convertThemeCheckIssue(tci);
    if (!converted) continue;
    const key = `${converted.file}:${converted.line}:${converted.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(converted);
  }
  return merged;
}
