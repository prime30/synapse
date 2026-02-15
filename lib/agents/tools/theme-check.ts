/**
 * Theme Check — Comprehensive Shopify theme validation for agent tools.
 *
 * Aggregates:
 * - quickScanTheme() from lib/ai/theme-reviewer.ts (broken refs, missing assets, unclosed tags)
 * - New Shopify-specific rules: required files, schema validation, deprecated patterns
 */

import { quickScanTheme, type ThemeFileInput } from '@/lib/ai/theme-reviewer';

// Required files for a valid Shopify theme
const REQUIRED_FILES = [
  'layout/theme.liquid',
  'templates/index.json',
  'config/settings_schema.json',
  'config/settings_data.json',
];

// Recommended files
const RECOMMENDED_FILES = [
  'templates/404.json',
  'templates/product.json',
  'templates/collection.json',
  'templates/cart.json',
  'templates/page.json',
  'templates/blog.json',
  'templates/article.json',
  'templates/search.json',
];

export interface ThemeCheckIssue {
  severity: 'error' | 'warning' | 'info';
  category: string;
  file?: string;
  line?: number;
  message: string;
  suggestion?: string;
}

export interface ThemeCheckResult {
  passed: boolean;
  issues: ThemeCheckIssue[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  scannedFiles: number;
  checkTimeMs: number;
}

/**
 * Normalise a file path for consistent matching.
 */
function normalisePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.?\//, '');
}

/**
 * Check for required theme files.
 */
function checkRequiredFiles(filePaths: Set<string>): ThemeCheckIssue[] {
  const issues: ThemeCheckIssue[] = [];

  for (const required of REQUIRED_FILES) {
    if (!filePaths.has(required)) {
      issues.push({
        severity: 'error',
        category: 'required-file',
        message: `Required file missing: ${required}`,
        suggestion: `Create ${required} — this file is required for a valid Shopify theme.`,
      });
    }
  }

  for (const recommended of RECOMMENDED_FILES) {
    if (!filePaths.has(recommended)) {
      issues.push({
        severity: 'info',
        category: 'recommended-file',
        message: `Recommended file missing: ${recommended}`,
        suggestion: `Consider adding ${recommended} for better store functionality.`,
      });
    }
  }

  return issues;
}

/**
 * Check schema blocks in section files for common issues.
 */
function checkSchemaBlocks(files: ThemeFileInput[]): ThemeCheckIssue[] {
  const issues: ThemeCheckIssue[] = [];

  for (const file of files) {
    const normalised = normalisePath(file.path);
    if (!normalised.startsWith('sections/') || !normalised.endsWith('.liquid')) continue;

    // Extract schema JSON
    const schemaMatch = file.content.match(/\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/);
    if (!schemaMatch) continue;

    const schemaBody = schemaMatch[1].trim();
    if (!schemaBody || schemaBody === '{}') continue;

    try {
      const schema = JSON.parse(schemaBody);

      // Check for missing name
      if (!schema.name) {
        issues.push({
          severity: 'warning',
          category: 'schema-validation',
          file: normalised,
          message: 'Section schema missing "name" property',
          suggestion: 'Add a "name" property to the schema for the Theme Editor.',
        });
      }

      // Check for duplicate setting IDs
      if (Array.isArray(schema.settings)) {
        const ids = new Set<string>();
        for (const setting of schema.settings) {
          if (setting.id && ids.has(setting.id)) {
            issues.push({
              severity: 'error',
              category: 'schema-validation',
              file: normalised,
              message: `Duplicate setting ID: "${setting.id}"`,
              suggestion: 'Each setting must have a unique ID within the section.',
            });
          }
          if (setting.id) ids.add(setting.id);
        }
      }

      // Check for blocks with duplicate type names
      if (Array.isArray(schema.blocks)) {
        const types = new Set<string>();
        for (const block of schema.blocks) {
          if (block.type && types.has(block.type)) {
            issues.push({
              severity: 'warning',
              category: 'schema-validation',
              file: normalised,
              message: `Duplicate block type: "${block.type}"`,
              suggestion: 'Each block type should be unique within a section.',
            });
          }
          if (block.type) types.add(block.type);
        }
      }
    } catch {
      issues.push({
        severity: 'error',
        category: 'schema-validation',
        file: normalised,
        message: 'Invalid JSON in schema block',
        suggestion: 'Fix the JSON syntax in the {% schema %} block.',
      });
    }
  }

  return issues;
}

/**
 * Run comprehensive theme check combining multiple validation sources.
 */
export function runThemeCheck(
  files: ThemeFileInput[],
  targetFile?: string,
): ThemeCheckResult {
  const start = performance.now();

  // Filter to target file if specified
  const filesToCheck = targetFile
    ? files.filter(f => normalisePath(f.path) === normalisePath(targetFile))
    : files;

  const filePaths = new Set(files.map(f => normalisePath(f.path)));

  const issues: ThemeCheckIssue[] = [];

  // 1. Required files check (only for full theme check)
  if (!targetFile) {
    issues.push(...checkRequiredFiles(filePaths));
  }

  // 2. Quick scan (broken refs, missing assets, unclosed tags, empty schema, broken section refs)
  const quickScan = quickScanTheme(filesToCheck);
  for (const qi of quickScan.issues) {
    issues.push({
      severity: qi.severity === 'critical' ? 'error' : 'warning',
      category: qi.category,
      file: qi.file,
      line: qi.line,
      message: qi.message,
    });
  }

  // 3. Schema block validation
  issues.push(...checkSchemaBlocks(filesToCheck));

  const elapsed = performance.now() - start;
  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;
  const infoCount = issues.filter(i => i.severity === 'info').length;

  return {
    passed: errorCount === 0,
    issues,
    errorCount,
    warningCount,
    infoCount,
    scannedFiles: filesToCheck.length,
    checkTimeMs: Math.round(elapsed * 100) / 100,
  };
}

/**
 * Format theme check results for LLM consumption.
 * Groups by severity and truncates to token budget.
 */
export function formatThemeCheckResult(result: ThemeCheckResult, maxChars: number = 8_000): string {
  const lines: string[] = [
    `## Theme Check Results`,
    `Status: ${result.passed ? 'PASSED' : 'FAILED'}`,
    `Scanned: ${result.scannedFiles} file(s) in ${result.checkTimeMs}ms`,
    `Issues: ${result.errorCount} error(s), ${result.warningCount} warning(s), ${result.infoCount} info`,
    '',
  ];

  if (result.issues.length === 0) {
    lines.push('No issues found. Theme looks clean!');
    return lines.join('\n');
  }

  // Group by severity
  const errors = result.issues.filter(i => i.severity === 'error');
  const warnings = result.issues.filter(i => i.severity === 'warning');
  const infos = result.issues.filter(i => i.severity === 'info');

  if (errors.length > 0) {
    lines.push('### Errors');
    for (const e of errors) {
      const loc = e.file ? `${e.file}${e.line ? `:${e.line}` : ''}` : '';
      lines.push(`- [${e.category}] ${loc ? `${loc}: ` : ''}${e.message}`);
      if (e.suggestion) lines.push(`  Fix: ${e.suggestion}`);
    }
    lines.push('');
  }

  if (warnings.length > 0) {
    lines.push('### Warnings');
    for (const w of warnings) {
      const loc = w.file ? `${w.file}${w.line ? `:${w.line}` : ''}` : '';
      lines.push(`- [${w.category}] ${loc ? `${loc}: ` : ''}${w.message}`);
      if (w.suggestion) lines.push(`  Fix: ${w.suggestion}`);
    }
    lines.push('');
  }

  if (infos.length > 0) {
    lines.push('### Info');
    for (const i of infos.slice(0, 10)) { // Cap info items
      lines.push(`- [${i.category}] ${i.message}`);
    }
    if (infos.length > 10) lines.push(`  ... and ${infos.length - 10} more`);
  }

  const output = lines.join('\n');
  if (output.length > maxChars) {
    return output.slice(0, maxChars) + '\n... (truncated)';
  }
  return output;
}

/**
 * Generate an SVG placeholder image.
 * Uses IDE accent color (#28CD56) and stone neutrals.
 */
export function generatePlaceholderSVG(
  width: number = 800,
  height: number = 600,
  text: string = 'Placeholder',
  bgColor: string = '#f5f5f4',
  textColor: string = '#78716c',
): string {
  // Sanitize text for SVG
  const safeText = text.replace(/[<>&"']/g, (c) => {
    const map: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' };
    return map[c] || c;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${bgColor}"/>
  <rect x="20" y="20" width="${width - 40}" height="${height - 40}" rx="8" fill="none" stroke="#d6d3d1" stroke-width="2" stroke-dasharray="8,4"/>
  <text x="50%" y="45%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui, sans-serif" font-size="${Math.min(width, height) / 12}" fill="${textColor}">${safeText}</text>
  <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui, sans-serif" font-size="${Math.min(width, height) / 20}" fill="#a8a29e">${width} × ${height}</text>
</svg>`;
}
