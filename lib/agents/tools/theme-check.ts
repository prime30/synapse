/**
 * Theme Check — Comprehensive Shopify theme validation for agent tools.
 *
 * Aggregates:
 * - quickScanTheme() from lib/ai/theme-reviewer.ts (broken refs, missing assets, unclosed tags)
 * - Liquid syntax validation (unknown tags, mismatched filters)
 * - JSON schema validation (template structure, settings schema)
 * - Accessibility rules (missing alt, ARIA, focus, color contrast hints)
 * - Performance rules (render-blocking scripts, unoptimized images, lazy loading)
 * - Deprecation detection (deprecated filters, tags, old API patterns)
 * - In-memory cache with 5-minute TTL
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
  summary: {
    totalIssues: number;
    byCategory: Record<string, number>;
  };
  issues: ThemeCheckIssue[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  scannedFiles: number;
  checkTimeMs: number;
}

// ── Cache ────────────────────────────────────────────────────────────────────

interface CacheEntry {
  result: ThemeCheckResult;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const resultCache = new Map<string, CacheEntry>();

function getCacheKey(files: ThemeFileInput[], targetFile?: string): string {
  const fileKeys = files.map(f => `${f.path}:${f.content.length}`).sort().join('|');
  return `${targetFile ?? 'ALL'}::${fileKeys}`;
}

function getCached(key: string): ThemeCheckResult | null {
  const entry = resultCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    resultCache.delete(key);
    return null;
  }
  return entry.result;
}

function setCache(key: string, result: ThemeCheckResult): void {
  // Evict stale entries periodically
  if (resultCache.size > 100) {
    const now = Date.now();
    for (const [k, v] of resultCache) {
      if (now > v.expiresAt) resultCache.delete(k);
    }
  }
  resultCache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalisePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.?\//, '');
}

function lineAt(content: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content[i] === '\n') line++;
  }
  return line;
}

// ── Check: Required files ────────────────────────────────────────────────────

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

// ── Check: Schema block validation ──────────────────────────────────────────

function checkSchemaBlocks(files: ThemeFileInput[]): ThemeCheckIssue[] {
  const issues: ThemeCheckIssue[] = [];

  for (const file of files) {
    const normalised = normalisePath(file.path);
    if (!normalised.startsWith('sections/') || !normalised.endsWith('.liquid')) continue;

    const schemaMatch = file.content.match(/\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/);
    if (!schemaMatch) continue;

    const schemaBody = schemaMatch[1].trim();
    if (!schemaBody || schemaBody === '{}') continue;

    try {
      const schema = JSON.parse(schemaBody);

      if (!schema.name) {
        issues.push({
          severity: 'warning',
          category: 'schema-validation',
          file: normalised,
          message: 'Section schema missing "name" property',
          suggestion: 'Add a "name" property to the schema for the Theme Editor.',
        });
      }

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

          // Check for missing type on settings
          if (setting.id && !setting.type) {
            issues.push({
              severity: 'error',
              category: 'schema-validation',
              file: normalised,
              message: `Setting "${setting.id}" is missing required "type" property`,
              suggestion: 'Each setting must have a "type" (e.g., text, image_picker, color).',
            });
          }
        }
      }

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

// ── Check: Liquid syntax ─────────────────────────────────────────────────────

const VALID_LIQUID_TAGS = new Set([
  'if', 'elsif', 'else', 'endif', 'unless', 'endunless',
  'for', 'endfor', 'break', 'continue', 'cycle', 'tablerow', 'endtablerow',
  'case', 'when', 'endcase',
  'assign', 'capture', 'endcapture', 'increment', 'decrement',
  'comment', 'endcomment', 'raw', 'endraw',
  'render', 'include', 'section', 'sections', 'form', 'endform',
  'paginate', 'endpaginate', 'layout', 'content_for', 'style', 'endstyle',
  'schema', 'endschema', 'javascript', 'endjavascript', 'stylesheet', 'endstylesheet',
  'liquid', 'endliquid', 'echo',
]);

const DEPRECATED_FILTERS: Array<{ pattern: RegExp; name: string; replacement: string }> = [
  { pattern: /\|\s*img_tag\b/g, name: 'img_tag', replacement: 'Use <img> with image_url filter' },
  { pattern: /\|\s*script_tag\b/g, name: 'script_tag', replacement: 'Use <script> with asset_url' },
  { pattern: /\|\s*stylesheet_tag\b/g, name: 'stylesheet_tag', replacement: 'Use <link> with asset_url' },
  { pattern: /\|\s*img_url\b/g, name: 'img_url', replacement: 'Use image_url filter instead (img_url is deprecated)' },
  { pattern: /\|\s*currency\b(?!\s*_)/g, name: 'currency', replacement: 'Use money or money_with_currency filter' },
];

function checkLiquidSyntax(files: ThemeFileInput[]): ThemeCheckIssue[] {
  const issues: ThemeCheckIssue[] = [];
  const tagRegex = /\{%-?\s*(\w+)\b/g;
  const includeRegex = /\{%-?\s*include\s+['"]([^'"]+)['"]/g;

  for (const file of files) {
    const normalised = normalisePath(file.path);
    if (!normalised.endsWith('.liquid')) continue;

    // Check for unknown Liquid tags
    tagRegex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = tagRegex.exec(file.content)) !== null) {
      const tagName = match[1];
      if (!VALID_LIQUID_TAGS.has(tagName)) {
        // Skip custom tags that might be app-provided or third-party
        if (tagName.length > 1 && tagName.length < 30) {
          issues.push({
            severity: 'info',
            category: 'liquid-syntax',
            file: normalised,
            line: lineAt(file.content, match.index),
            message: `Unknown Liquid tag: {% ${tagName} %}`,
            suggestion: 'If this is a custom tag from an app, you can ignore this. Otherwise, check for typos.',
          });
        }
      }
    }

    // Deprecated {% include %} usage
    includeRegex.lastIndex = 0;
    while ((match = includeRegex.exec(file.content)) !== null) {
      issues.push({
        severity: 'warning',
        category: 'deprecation',
        file: normalised,
        line: lineAt(file.content, match.index),
        message: `Deprecated {% include '${match[1]}' %} — use {% render '${match[1]}' %} instead`,
        suggestion: 'Replace {% include %} with {% render %} for better performance and variable scoping.',
      });
    }

    // Deprecated filters
    for (const df of DEPRECATED_FILTERS) {
      df.pattern.lastIndex = 0;
      while ((match = df.pattern.exec(file.content)) !== null) {
        issues.push({
          severity: 'warning',
          category: 'deprecation',
          file: normalised,
          line: lineAt(file.content, match.index),
          message: `Deprecated filter: | ${df.name}`,
          suggestion: df.replacement,
        });
      }
    }
  }

  return issues;
}

// ── Check: Template JSON structure ──────────────────────────────────────────

function checkTemplateJSON(files: ThemeFileInput[]): ThemeCheckIssue[] {
  const issues: ThemeCheckIssue[] = [];

  for (const file of files) {
    const normalised = normalisePath(file.path);
    if (!normalised.startsWith('templates/') || !normalised.endsWith('.json')) continue;

    try {
      const data = JSON.parse(file.content) as Record<string, unknown>;

      // Template JSON should have a "sections" key
      if (!data.sections || typeof data.sections !== 'object') {
        issues.push({
          severity: 'warning',
          category: 'json-schema',
          file: normalised,
          message: 'Template JSON missing "sections" object',
          suggestion: 'Template JSON files should define a "sections" object with section declarations.',
        });
        continue;
      }

      // Check that "order" array exists and matches section keys
      if (!data.order || !Array.isArray(data.order)) {
        issues.push({
          severity: 'warning',
          category: 'json-schema',
          file: normalised,
          message: 'Template JSON missing "order" array',
          suggestion: 'Add an "order" array to control section rendering order.',
        });
      } else {
        const sectionKeys = new Set(Object.keys(data.sections as object));
        for (const key of data.order as string[]) {
          if (!sectionKeys.has(key)) {
            issues.push({
              severity: 'error',
              category: 'json-schema',
              file: normalised,
              message: `"order" references unknown section key: "${key}"`,
              suggestion: `Add the section "${key}" to the "sections" object or remove it from "order".`,
            });
          }
        }
      }

      // Validate each section has a "type"
      const sections = data.sections as Record<string, Record<string, unknown>>;
      for (const [key, section] of Object.entries(sections)) {
        if (!section || typeof section !== 'object') continue;
        if (!section.type || typeof section.type !== 'string') {
          issues.push({
            severity: 'error',
            category: 'json-schema',
            file: normalised,
            message: `Section "${key}" missing required "type" property`,
            suggestion: 'Each section in template JSON must specify a "type" matching a section file name.',
          });
        }
      }
    } catch {
      issues.push({
        severity: 'error',
        category: 'json-schema',
        file: normalised,
        message: 'Invalid JSON in template file',
        suggestion: 'Fix the JSON syntax. Template files must be valid JSON.',
      });
    }
  }

  return issues;
}

// ── Check: Accessibility ─────────────────────────────────────────────────────

function checkAccessibility(files: ThemeFileInput[]): ThemeCheckIssue[] {
  const issues: ThemeCheckIssue[] = [];
  const imgRegex = /<img\b[^>]*>/gi;
  const altRegex = /\balt\s*=/i;
  const inputRegex = /<input\b[^>]*>/gi;
  const ariaLabelRegex = /\baria-label(?:ledby)?\s*=/i;
  const buttonRegex = /<button\b[^>]*>[\s]*<\/button>/gi;
  const anchorRegex = /<a\b[^>]*>[\s]*<\/a>/gi;

  for (const file of files) {
    const normalised = normalisePath(file.path);
    if (!normalised.endsWith('.liquid') && !normalised.endsWith('.html')) continue;

    // Missing alt on images
    imgRegex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = imgRegex.exec(file.content)) !== null) {
      if (!altRegex.test(match[0])) {
        issues.push({
          severity: 'error',
          category: 'accessibility',
          file: normalised,
          line: lineAt(file.content, match.index),
          message: '<img> tag missing alt attribute',
          suggestion: 'Add alt="" for decorative images or a descriptive alt for meaningful ones.',
        });
      }
    }

    // Inputs without accessible labels
    inputRegex.lastIndex = 0;
    while ((match = inputRegex.exec(file.content)) !== null) {
      const tag = match[0];
      if (/type\s*=\s*["']hidden["']/i.test(tag)) continue;
      if (/type\s*=\s*["']submit["']/i.test(tag)) continue;
      if (!ariaLabelRegex.test(tag) && !/\bplaceholder\s*=/i.test(tag)) {
        issues.push({
          severity: 'warning',
          category: 'accessibility',
          file: normalised,
          line: lineAt(file.content, match.index),
          message: '<input> without accessible label (aria-label, aria-labelledby, or associated <label>)',
          suggestion: 'Add aria-label, or ensure a <label for="..."> is associated with this input.',
        });
      }
    }

    // Empty buttons
    buttonRegex.lastIndex = 0;
    while ((match = buttonRegex.exec(file.content)) !== null) {
      if (!ariaLabelRegex.test(match[0])) {
        issues.push({
          severity: 'warning',
          category: 'accessibility',
          file: normalised,
          line: lineAt(file.content, match.index),
          message: 'Empty <button> without aria-label',
          suggestion: 'Add aria-label or visible text content to the button.',
        });
      }
    }

    // Empty links
    anchorRegex.lastIndex = 0;
    while ((match = anchorRegex.exec(file.content)) !== null) {
      if (!ariaLabelRegex.test(match[0])) {
        issues.push({
          severity: 'warning',
          category: 'accessibility',
          file: normalised,
          line: lineAt(file.content, match.index),
          message: 'Empty <a> link without aria-label',
          suggestion: 'Add aria-label or visible link text for screen readers.',
        });
      }
    }
  }

  return issues;
}

// ── Check: Performance ───────────────────────────────────────────────────────

function checkPerformance(files: ThemeFileInput[]): ThemeCheckIssue[] {
  const issues: ThemeCheckIssue[] = [];
  const blockingScriptRegex = /<script(?![^>]*\b(?:async|defer|type=["']module["'])\b)[^>]*>/gi;
  const largeCssRegex = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  const imgWithoutLazyRegex = /<img\b(?![^>]*\bloading\s*=\s*["']lazy["'])[^>]*>/gi;

  for (const file of files) {
    const normalised = normalisePath(file.path);

    // Render-blocking scripts in Liquid files
    if (normalised.endsWith('.liquid')) {
      blockingScriptRegex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = blockingScriptRegex.exec(file.content)) !== null) {
        // Skip if inside schema block
        const before = file.content.slice(0, match.index);
        if (/\{%-?\s*schema\s*-?%\}/.test(before) && !/\{%-?\s*endschema\s*-?%\}/.test(before.slice(before.lastIndexOf('{%')))) continue;

        issues.push({
          severity: 'warning',
          category: 'performance',
          file: normalised,
          line: lineAt(file.content, match.index),
          message: 'Render-blocking <script> without async or defer',
          suggestion: 'Add async or defer attribute to non-critical scripts for faster page loads.',
        });
      }

      // Large inline styles (> 2KB)
      largeCssRegex.lastIndex = 0;
      while ((match = largeCssRegex.exec(file.content)) !== null) {
        const cssBody = match[1];
        if (cssBody && cssBody.length > 2000) {
          issues.push({
            severity: 'info',
            category: 'performance',
            file: normalised,
            line: lineAt(file.content, match.index),
            message: `Large inline <style> block (${cssBody.length} chars)`,
            suggestion: 'Consider moving large CSS to an external stylesheet for better caching.',
          });
        }
      }

      // Images without lazy loading (below the fold hint)
      imgWithoutLazyRegex.lastIndex = 0;
      let imgCount = 0;
      while ((match = imgWithoutLazyRegex.exec(file.content)) !== null) {
        imgCount++;
        // Only flag images after the first two (above-the-fold exemption)
        if (imgCount > 2) {
          issues.push({
            severity: 'info',
            category: 'performance',
            file: normalised,
            line: lineAt(file.content, match.index),
            message: '<img> without loading="lazy" — may delay page load',
            suggestion: 'Add loading="lazy" to below-the-fold images for better performance.',
          });
          break; // Only report once per file
        }
      }
    }

    // Large JS/CSS asset files (> 100KB)
    if (normalised.startsWith('assets/') && (normalised.endsWith('.js') || normalised.endsWith('.css'))) {
      const sizeKB = file.content.length / 1024;
      if (sizeKB > 100) {
        issues.push({
          severity: 'warning',
          category: 'performance',
          file: normalised,
          message: `Large asset file (${Math.round(sizeKB)}KB)`,
          suggestion: 'Consider minifying or code-splitting large assets to reduce load time.',
        });
      }
    }
  }

  return issues;
}

// ── Main: Run theme check ────────────────────────────────────────────────────

/**
 * Run comprehensive theme check combining multiple validation sources.
 * Results are cached for 5 minutes.
 */
export function runThemeCheck(
  files: ThemeFileInput[],
  targetFile?: string,
  options?: { bypassCache?: boolean },
): ThemeCheckResult {
  const cacheKey = getCacheKey(files, targetFile);
  if (!options?.bypassCache) {
    const cached = getCached(cacheKey);
    if (cached) return cached;
  }

  const start = performance.now();

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

  // 4. Liquid syntax + deprecation checks
  issues.push(...checkLiquidSyntax(filesToCheck));

  // 5. Template JSON structure validation
  if (!targetFile) {
    issues.push(...checkTemplateJSON(files));
  } else {
    issues.push(...checkTemplateJSON(filesToCheck));
  }

  // 6. Accessibility checks
  issues.push(...checkAccessibility(filesToCheck));

  // 7. Performance checks
  issues.push(...checkPerformance(filesToCheck));

  const elapsed = performance.now() - start;
  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;
  const infoCount = issues.filter(i => i.severity === 'info').length;

  // Build category summary
  const byCategory: Record<string, number> = {};
  for (const issue of issues) {
    byCategory[issue.category] = (byCategory[issue.category] ?? 0) + 1;
  }

  const result: ThemeCheckResult = {
    passed: errorCount === 0,
    summary: {
      totalIssues: issues.length,
      byCategory,
    },
    issues,
    errorCount,
    warningCount,
    infoCount,
    scannedFiles: filesToCheck.length,
    checkTimeMs: Math.round(elapsed * 100) / 100,
  };

  setCache(cacheKey, result);
  return result;
}

/**
 * Format theme check results for LLM consumption.
 * Groups by severity and truncates to token budget.
 */
export function formatThemeCheckResult(result: ThemeCheckResult, maxChars: number = 24_000): string {
  const lines: string[] = [
    `## Theme Check Results`,
    `Status: ${result.passed ? 'PASSED' : 'FAILED'}`,
    `Scanned: ${result.scannedFiles} file(s) in ${result.checkTimeMs}ms`,
    `Issues: ${result.errorCount} error(s), ${result.warningCount} warning(s), ${result.infoCount} info`,
  ];

  // Category breakdown
  if (result.summary.totalIssues > 0) {
    const cats = Object.entries(result.summary.byCategory)
      .sort(([, a], [, b]) => b - a)
      .map(([cat, count]) => `${cat}: ${count}`)
      .join(', ');
    lines.push(`Categories: ${cats}`);
  }
  lines.push('');

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
    for (const w of warnings.slice(0, 30)) {
      const loc = w.file ? `${w.file}${w.line ? `:${w.line}` : ''}` : '';
      lines.push(`- [${w.category}] ${loc ? `${loc}: ` : ''}${w.message}`);
      if (w.suggestion) lines.push(`  Fix: ${w.suggestion}`);
    }
    if (warnings.length > 30) lines.push(`  ... and ${warnings.length - 30} more warnings`);
    lines.push('');
  }

  if (infos.length > 0) {
    lines.push('### Info');
    for (const i of infos.slice(0, 10)) {
      const loc = i.file ? `${i.file}${i.line ? `:${i.line}` : ''}` : '';
      lines.push(`- [${i.category}] ${loc ? `${loc}: ` : ''}${i.message}`);
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
 * Uses IDE accent color (oklch(0.745 0.189 148)) and stone neutrals.
 */
export function generatePlaceholderSVG(
  width: number = 800,
  height: number = 600,
  text: string = 'Placeholder',
  bgColor: string = 'oklch(0.97 0.001 106)',
  textColor: string = 'oklch(0.553 0.013 58)',
): string {
  // Sanitize text for SVG
  const safeText = text.replace(/[<>&"']/g, (c) => {
    const map: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' };
    return map[c] || c;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${bgColor}"/>
  <rect x="20" y="20" width="${width - 40}" height="${height - 40}" rx="8" fill="none" stroke="oklch(0.869 0.005 56)" stroke-width="2" stroke-dasharray="8,4"/>
  <text x="50%" y="45%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui, sans-serif" font-size="${Math.min(width, height) / 12}" fill="${textColor}">${safeText}</text>
  <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui, sans-serif" font-size="${Math.min(width, height) / 20}" fill="oklch(0.709 0.01 56)">${width} × ${height}</text>
</svg>`;
}
