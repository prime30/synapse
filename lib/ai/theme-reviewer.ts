/**
 * Theme Reviewer — two-tier review system for Shopify Liquid themes.
 *
 * Tier 1: Rule-based quick scan (< 2 s) — runs on every push to Shopify.
 * Tier 2: Full AI-powered review (30–60 s) — on-demand comprehensive audit.
 *
 * Pure functions, no side effects, no 'use client'.
 * @module lib/ai/theme-reviewer
 */

// ---------------------------------------------------------------------------
// Types — Tier 1 (Quick Scan)
// ---------------------------------------------------------------------------

/** Input file representation for theme review. */
export interface ThemeFileInput {
  path: string;
  content: string;
}

/** Result of a quick rule-based scan. */
export interface QuickScanResult {
  /** False if any critical issues were found. */
  passed: boolean;
  issues: QuickScanIssue[];
  scannedFiles: number;
  scanTimeMs: number;
}

/** Individual issue found during a quick scan. */
export interface QuickScanIssue {
  /** Critical issues block deployment; warnings do not. */
  severity: 'critical' | 'warning';
  category:
    | 'broken-reference'
    | 'missing-asset'
    | 'unclosed-tag'
    | 'empty-schema'
    | 'broken-section-ref';
  file: string;
  message: string;
  line?: number;
}

// ---------------------------------------------------------------------------
// Types — Tier 2 (Full AI Review)
// ---------------------------------------------------------------------------

/** Comprehensive AI-powered theme review report. */
export interface ThemeReviewReport {
  /** Weighted average across all categories (0–100). */
  overallScore: number;
  categories: ThemeReviewCategory[];
  fileIssues: FileIssue[];
  reviewedAt: string;
  reviewTimeMs: number;
}

/** Scored category within a full review. */
export interface ThemeReviewCategory {
  name:
    | 'performance'
    | 'accessibility'
    | 'seo'
    | 'best-practices'
    | 'liquid-quality';
  score: number;
  maxScore: number;
  issues: CategoryIssue[];
}

/** Issue within a review category. */
export interface CategoryIssue {
  severity: 'critical' | 'warning' | 'info';
  message: string;
  file?: string;
  line?: number;
  suggestion?: string;
}

/** All issues associated with a single file. */
export interface FileIssue {
  file: string;
  issues: CategoryIssue[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Get the 1-based line number for a character offset in a string. */
function lineAt(content: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < content.length; i++) {
    if (content[i] === '\n') line++;
  }
  return line;
}

/** Normalise a theme path to forward slashes and strip leading `./` or `/`. */
function normalisePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.?\//, '');
}

/** Build a Set of normalised file paths for fast lookup. */
function buildFileSet(files: ThemeFileInput[]): Set<string> {
  return new Set(files.map((f) => normalisePath(f.path)));
}

// ---------------------------------------------------------------------------
// Tier 1 — Individual checkers
// ---------------------------------------------------------------------------

/**
 * Check 1: Broken `{% render 'name' %}` references.
 * Severity: **critical** — a missing snippet causes a Liquid render error.
 */
function checkBrokenRenderReferences(
  files: ThemeFileInput[],
  fileSet: Set<string>,
): QuickScanIssue[] {
  const issues: QuickScanIssue[] = [];
  const renderRegex = /\{%-?\s*render\s+['"]([^'"]+)['"]/g;

  for (const file of files) {
    renderRegex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = renderRegex.exec(file.content)) !== null) {
      const name = match[1];
      const snippetPath = name.endsWith('.liquid')
        ? `snippets/${name}`
        : `snippets/${name}.liquid`;

      if (!fileSet.has(snippetPath)) {
        issues.push({
          severity: 'critical',
          category: 'broken-reference',
          file: normalisePath(file.path),
          message: `Broken render reference: snippet "${snippetPath}" not found`,
          line: lineAt(file.content, match.index),
        });
      }
    }
  }

  return issues;
}

/**
 * Check 2: Missing asset files referenced via `{{ 'filename' | asset_url }}`.
 * Severity: **warning** — the theme still renders, but assets 404.
 */
function checkMissingAssets(
  files: ThemeFileInput[],
  fileSet: Set<string>,
): QuickScanIssue[] {
  const issues: QuickScanIssue[] = [];
  const assetUrlRegex = /\{\{-?\s*['"]([^'"]+)['"]\s*\|\s*asset_url/g;

  for (const file of files) {
    assetUrlRegex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = assetUrlRegex.exec(file.content)) !== null) {
      const assetName = match[1];
      const assetPath = `assets/${assetName}`;

      if (!fileSet.has(assetPath)) {
        issues.push({
          severity: 'warning',
          category: 'missing-asset',
          file: normalisePath(file.path),
          message: `Missing asset: "${assetPath}" referenced but not found`,
          line: lineAt(file.content, match.index),
        });
      }
    }
  }

  return issues;
}

/**
 * Check 3: Unclosed Liquid block tags.
 * Severity: **critical** — unclosed tags break rendering.
 */
function checkUnclosedTags(files: ThemeFileInput[]): QuickScanIssue[] {
  const issues: QuickScanIssue[] = [];

  const blockTags = ['if', 'for', 'capture', 'unless', 'case'] as const;
  type BlockTag = (typeof blockTags)[number];

  for (const file of files) {
    // Only check Liquid files
    if (!file.path.endsWith('.liquid')) continue;

    const tagRegex = /\{%-?\s*(end)?(\w+)[^%]*-?%\}/g;
    const stack: { tag: BlockTag; offset: number }[] = [];

    let match: RegExpExecArray | null;
    while ((match = tagRegex.exec(file.content)) !== null) {
      const isClosing = match[1] === 'end';
      const tagName = match[2] as string;

      if (isClosing) {
        // Find the matching opener on the stack
        if (blockTags.includes(tagName as BlockTag)) {
          const lastIdx = findLastIndex(stack, (s) => s.tag === tagName);
          if (lastIdx === -1) {
            issues.push({
              severity: 'critical',
              category: 'unclosed-tag',
              file: normalisePath(file.path),
              message: `Unexpected closing tag {% end${tagName} %} with no matching opener`,
              line: lineAt(file.content, match.index),
            });
          } else {
            stack.splice(lastIdx, 1);
          }
        }
      } else if (blockTags.includes(tagName as BlockTag)) {
        stack.push({ tag: tagName as BlockTag, offset: match.index });
      }
    }

    // Remaining items on the stack are unclosed
    for (const unclosed of stack) {
      issues.push({
        severity: 'critical',
        category: 'unclosed-tag',
        file: normalisePath(file.path),
        message: `Unclosed tag {% ${unclosed.tag} %} — missing {% end${unclosed.tag} %}`,
        line: lineAt(file.content, unclosed.offset),
      });
    }
  }

  return issues;
}

/** Polyfill-style findLastIndex for older targets. */
function findLastIndex<T>(arr: T[], predicate: (item: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i])) return i;
  }
  return -1;
}

/**
 * Check 4: Empty `{% schema %}` blocks in section files.
 * Severity: **warning** — sections work without schema but lose Theme Editor support.
 */
function checkEmptySchema(files: ThemeFileInput[]): QuickScanIssue[] {
  const issues: QuickScanIssue[] = [];

  for (const file of files) {
    const normalised = normalisePath(file.path);
    if (!normalised.startsWith('sections/') || !normalised.endsWith('.liquid')) {
      continue;
    }

    const schemaRegex = /\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/g;
    const match = schemaRegex.exec(file.content);

    if (!match) {
      // No schema block at all
      issues.push({
        severity: 'warning',
        category: 'empty-schema',
        file: normalised,
        message: 'Section file has no {% schema %} block — Theme Editor settings unavailable',
      });
    } else {
      const schemaBody = match[1].trim();
      if (schemaBody === '' || schemaBody === '{}') {
        issues.push({
          severity: 'warning',
          category: 'empty-schema',
          file: normalised,
          message: 'Section has an empty {% schema %} block — no Theme Editor settings defined',
          line: lineAt(file.content, match.index),
        });
      }
    }
  }

  return issues;
}

/**
 * Check 5: Broken section references in template JSON files.
 * Severity: **critical** — a missing section causes a render error.
 */
function checkBrokenSectionRefs(
  files: ThemeFileInput[],
  fileSet: Set<string>,
): QuickScanIssue[] {
  const issues: QuickScanIssue[] = [];

  for (const file of files) {
    const normalised = normalisePath(file.path);
    // Template JSON files live in templates/ and end with .json
    if (!normalised.startsWith('templates/') || !normalised.endsWith('.json')) {
      continue;
    }

    let data: { sections?: Record<string, { type?: string }> };
    try {
      data = JSON.parse(file.content) as typeof data;
    } catch {
      // Malformed JSON — skip
      continue;
    }

    const sections = data.sections ?? {};
    for (const [key, section] of Object.entries(sections)) {
      const sectionType = section?.type;
      if (!sectionType) continue;

      const sectionPath = sectionType.endsWith('.liquid')
        ? `sections/${sectionType}`
        : `sections/${sectionType}.liquid`;

      if (!fileSet.has(sectionPath)) {
        issues.push({
          severity: 'critical',
          category: 'broken-section-ref',
          file: normalised,
          message: `Broken section reference: "${sectionPath}" (key "${key}") not found`,
        });
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Tier 1 — Public API
// ---------------------------------------------------------------------------

/**
 * Run a fast rule-based scan over all theme files.
 *
 * Designed to complete in < 2 seconds for typical themes (~200 files).
 * Critical issues block deployment; warnings are informational.
 *
 * @param files - Array of theme files with path and content.
 * @returns Scan result with pass/fail, issues, and timing.
 */
export function quickScanTheme(files: ThemeFileInput[]): QuickScanResult {
  const start = performance.now();
  const fileSet = buildFileSet(files);

  const issues: QuickScanIssue[] = [
    ...checkBrokenRenderReferences(files, fileSet),
    ...checkMissingAssets(files, fileSet),
    ...checkUnclosedTags(files),
    ...checkEmptySchema(files),
    ...checkBrokenSectionRefs(files, fileSet),
  ];

  const elapsed = performance.now() - start;
  const hasCritical = issues.some((i) => i.severity === 'critical');

  return {
    passed: !hasCritical,
    issues,
    scannedFiles: files.length,
    scanTimeMs: Math.round(elapsed * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// Tier 2 — Rule-based category scorers (no AI needed)
// ---------------------------------------------------------------------------

/** Weight map for overall score computation. */
const CATEGORY_WEIGHTS: Record<ThemeReviewCategory['name'], number> = {
  performance: 0.25,
  accessibility: 0.2,
  seo: 0.15,
  'best-practices': 0.2,
  'liquid-quality': 0.2,
};

/**
 * Score performance patterns using rule-based heuristics.
 *
 * Checks for:
 * - Render-blocking `<script>` without async/defer
 * - Large inline `<script>` blocks (> 500 chars)
 * - Excessive Liquid nesting depth (> 5 levels)
 */
function scorePerformance(files: ThemeFileInput[]): ThemeReviewCategory {
  const issues: CategoryIssue[] = [];
  let deductions = 0;

  const blockingScriptRegex = /<script(?![^>]*\b(?:async|defer|type=["']module["'])\b)[^>]*>/gi;
  const inlineScriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  const nestingRegex = /\{%-?\s*(if|for|unless|case)\b/g;
  const endNestingRegex = /\{%-?\s*end(if|for|unless|case)\b/g;

  for (const file of files) {
    const normalised = normalisePath(file.path);

    // Render-blocking scripts
    blockingScriptRegex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = blockingScriptRegex.exec(file.content)) !== null) {
      // Skip if this is within a Liquid comment or schema block
      const before = file.content.slice(0, match.index);
      if (before.includes('{% schema %}') && !before.includes('{% endschema %}')) continue;

      issues.push({
        severity: 'warning',
        message: 'Render-blocking <script> without async/defer attribute',
        file: normalised,
        line: lineAt(file.content, match.index),
        suggestion: 'Add async or defer attribute to non-critical scripts',
      });
      deductions += 3;
    }

    // Large inline scripts
    inlineScriptRegex.lastIndex = 0;
    while ((match = inlineScriptRegex.exec(file.content)) !== null) {
      const scriptBody = match[1];
      if (scriptBody && scriptBody.length > 500) {
        issues.push({
          severity: 'warning',
          message: `Large inline script (${scriptBody.length} chars) — consider externalising`,
          file: normalised,
          line: lineAt(file.content, match.index),
          suggestion: 'Move large scripts to external files for better caching',
        });
        deductions += 5;
      }
    }

    // Excessive nesting
    if (normalised.endsWith('.liquid')) {
      let maxDepth = 0;
      let currentDepth = 0;
      const lines = file.content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const opens = (line.match(nestingRegex) ?? []).length;
        nestingRegex.lastIndex = 0;
        const closes = (line.match(endNestingRegex) ?? []).length;
        endNestingRegex.lastIndex = 0;

        currentDepth += opens - closes;
        if (currentDepth > maxDepth) maxDepth = currentDepth;
      }

      if (maxDepth > 5) {
        issues.push({
          severity: 'warning',
          message: `Excessive Liquid nesting depth (${maxDepth} levels)`,
          file: normalised,
          suggestion: 'Extract nested logic into snippets to improve readability and performance',
        });
        deductions += 5;
      }
    }
  }

  const score = Math.max(0, 100 - deductions);
  return { name: 'performance', score, maxScore: 100, issues };
}

/**
 * Score accessibility patterns using rule-based heuristics.
 *
 * Checks for:
 * - `<img>` tags without `alt` attribute
 * - Form inputs without associated `<label>` or `aria-label`
 * - Heading hierarchy gaps (e.g. h1 → h3 with no h2)
 */
function scoreAccessibility(files: ThemeFileInput[]): ThemeReviewCategory {
  const issues: CategoryIssue[] = [];
  let deductions = 0;

  const imgRegex = /<img\b[^>]*>/gi;
  const altRegex = /\balt\s*=/i;
  const inputRegex = /<input\b[^>]*>/gi;
  const ariaLabelRegex = /\baria-label(?:ledby)?\s*=/i;
  const labelForRegex = /<label\b[^>]*\bfor\s*=\s*["']([^"']+)["']/gi;
  const headingRegex = /<h([1-6])\b/gi;

  for (const file of files) {
    const normalised = normalisePath(file.path);

    // Missing alt on img
    imgRegex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = imgRegex.exec(file.content)) !== null) {
      if (!altRegex.test(match[0])) {
        issues.push({
          severity: 'critical',
          message: '<img> tag missing alt attribute',
          file: normalised,
          line: lineAt(file.content, match.index),
          suggestion: 'Add alt="" for decorative images or a descriptive alt for meaningful ones',
        });
        deductions += 5;
      }
    }

    // Collect label-for targets in this file
    const labelTargets = new Set<string>();
    labelForRegex.lastIndex = 0;
    while ((match = labelForRegex.exec(file.content)) !== null) {
      labelTargets.add(match[1]);
    }

    // Input without label
    inputRegex.lastIndex = 0;
    while ((match = inputRegex.exec(file.content)) !== null) {
      const tag = match[0];
      // Skip hidden inputs
      if (/type\s*=\s*["']hidden["']/i.test(tag)) continue;

      if (!ariaLabelRegex.test(tag)) {
        const idMatch = /\bid\s*=\s*["']([^"']+)["']/i.exec(tag);
        const inputId = idMatch?.[1];
        if (!inputId || !labelTargets.has(inputId)) {
          issues.push({
            severity: 'warning',
            message: '<input> without associated <label> or aria-label',
            file: normalised,
            line: lineAt(file.content, match.index),
            suggestion: 'Add a <label for="..."> or aria-label attribute',
          });
          deductions += 3;
        }
      }
    }

    // Heading hierarchy
    headingRegex.lastIndex = 0;
    const headingLevels: number[] = [];
    while ((match = headingRegex.exec(file.content)) !== null) {
      headingLevels.push(parseInt(match[1], 10));
    }
    for (let i = 1; i < headingLevels.length; i++) {
      const gap = headingLevels[i] - headingLevels[i - 1];
      if (gap > 1) {
        issues.push({
          severity: 'warning',
          message: `Heading hierarchy gap: h${headingLevels[i - 1]} → h${headingLevels[i]}`,
          file: normalised,
          suggestion: `Use h${headingLevels[i - 1] + 1} instead of h${headingLevels[i]} for proper hierarchy`,
        });
        deductions += 2;
      }
    }
  }

  const score = Math.max(0, 100 - deductions);
  return { name: 'accessibility', score, maxScore: 100, issues };
}

/**
 * Score SEO patterns using rule-based heuristics.
 *
 * Checks for:
 * - Missing `<title>` tag in layout files
 * - Missing meta description
 * - Missing canonical URL pattern
 */
function scoreSEO(files: ThemeFileInput[]): ThemeReviewCategory {
  const issues: CategoryIssue[] = [];
  let deductions = 0;

  // Check layout files for critical SEO elements
  const layoutFiles = files.filter((f) => normalisePath(f.path).startsWith('layout/'));

  let hasTitle = false;
  let hasMetaDescription = false;
  let hasCanonical = false;

  for (const file of layoutFiles) {
    if (/<title\b/i.test(file.content)) hasTitle = true;
    if (/meta\b[^>]*\bname\s*=\s*["']description["']/i.test(file.content)) hasMetaDescription = true;
    if (/rel\s*=\s*["']canonical["']/i.test(file.content) || /canonical_url/i.test(file.content)) hasCanonical = true;
  }

  // Also check snippet and section files (SEO might be delegated)
  for (const file of files) {
    const normalised = normalisePath(file.path);
    if (normalised.startsWith('snippets/') || normalised.startsWith('sections/')) {
      if (/<title\b/i.test(file.content)) hasTitle = true;
      if (/meta\b[^>]*\bname\s*=\s*["']description["']/i.test(file.content)) hasMetaDescription = true;
      if (/rel\s*=\s*["']canonical["']/i.test(file.content) || /canonical_url/i.test(file.content)) hasCanonical = true;
    }
  }

  if (!hasTitle && layoutFiles.length > 0) {
    issues.push({
      severity: 'critical',
      message: 'No <title> tag found in layout files',
      suggestion: 'Add {{ page_title }} in a <title> tag within the layout <head>',
    });
    deductions += 20;
  }

  if (!hasMetaDescription && layoutFiles.length > 0) {
    issues.push({
      severity: 'warning',
      message: 'No meta description found in layout files',
      suggestion: 'Add <meta name="description" content="{{ page_description }}">',
    });
    deductions += 10;
  }

  if (!hasCanonical && layoutFiles.length > 0) {
    issues.push({
      severity: 'warning',
      message: 'No canonical URL pattern found',
      suggestion: 'Add <link rel="canonical" href="{{ canonical_url }}"> in the layout <head>',
    });
    deductions += 10;
  }

  const score = Math.max(0, 100 - deductions);
  return { name: 'seo', score, maxScore: 100, issues };
}

/**
 * Score best-practice compliance using rule-based heuristics.
 *
 * Checks for:
 * - Deprecated `{% include %}` usage (should be `{% render %}`)
 * - Deprecated `| img_tag` filter usage
 * - Deprecated `| script_tag` and `| stylesheet_tag` filters
 */
function scoreBestPractices(files: ThemeFileInput[]): ThemeReviewCategory {
  const issues: CategoryIssue[] = [];
  let deductions = 0;

  const includeRegex = /\{%-?\s*include\s+['"]([^'"]+)['"]/g;
  const imgTagFilterRegex = /\|\s*img_tag\b/g;
  const scriptTagFilterRegex = /\|\s*script_tag\b/g;
  const stylesheetTagFilterRegex = /\|\s*stylesheet_tag\b/g;

  for (const file of files) {
    const normalised = normalisePath(file.path);
    if (!normalised.endsWith('.liquid')) continue;

    // Deprecated {% include %}
    includeRegex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = includeRegex.exec(file.content)) !== null) {
      issues.push({
        severity: 'warning',
        message: `Deprecated {% include '${match[1]}' %} — use {% render '${match[1]}' %} instead`,
        file: normalised,
        line: lineAt(file.content, match.index),
        suggestion: 'Replace {% include %} with {% render %} for better performance and scoping',
      });
      deductions += 3;
    }

    // Deprecated | img_tag
    imgTagFilterRegex.lastIndex = 0;
    while ((match = imgTagFilterRegex.exec(file.content)) !== null) {
      issues.push({
        severity: 'warning',
        message: 'Deprecated | img_tag filter',
        file: normalised,
        line: lineAt(file.content, match.index),
        suggestion: 'Use the <img> tag directly with image_url filter for responsive images',
      });
      deductions += 2;
    }

    // Deprecated | script_tag
    scriptTagFilterRegex.lastIndex = 0;
    while ((match = scriptTagFilterRegex.exec(file.content)) !== null) {
      issues.push({
        severity: 'warning',
        message: 'Deprecated | script_tag filter',
        file: normalised,
        line: lineAt(file.content, match.index),
        suggestion: 'Use a <script> tag with asset_url filter instead',
      });
      deductions += 2;
    }

    // Deprecated | stylesheet_tag
    stylesheetTagFilterRegex.lastIndex = 0;
    while ((match = stylesheetTagFilterRegex.exec(file.content)) !== null) {
      issues.push({
        severity: 'warning',
        message: 'Deprecated | stylesheet_tag filter',
        file: normalised,
        line: lineAt(file.content, match.index),
        suggestion: 'Use a <link> tag with asset_url filter instead',
      });
      deductions += 2;
    }
  }

  const score = Math.max(0, 100 - deductions);
  return { name: 'best-practices', score, maxScore: 100, issues };
}

/**
 * Score Liquid code quality using rule-based heuristics.
 *
 * Checks for:
 * - Unused `{% assign %}` variables (within single file)
 * - Deeply nested blocks (> 4 levels)
 * - Very long files (> 500 lines)
 */
function scoreLiquidQuality(files: ThemeFileInput[]): ThemeReviewCategory {
  const issues: CategoryIssue[] = [];
  let deductions = 0;

  const assignRegex = /\{%-?\s*assign\s+(\w+)\s*=/g;
  const blockOpenRegex = /\{%-?\s*(if|for|unless|case|capture)\b/g;
  const blockCloseRegex = /\{%-?\s*end(if|for|unless|case|capture)\b/g;

  for (const file of files) {
    const normalised = normalisePath(file.path);
    if (!normalised.endsWith('.liquid')) continue;

    // Unused assigns
    const assignedVars: { name: string; offset: number; length: number }[] = [];
    assignRegex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = assignRegex.exec(file.content)) !== null) {
      assignedVars.push({
        name: match[1],
        offset: match.index,
        length: match[0].length,
      });
    }

    for (const v of assignedVars) {
      // Check if the variable is used anywhere else in the file
      const escaped = v.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const usageRe = new RegExp(`\\b${escaped}\\b`, 'g');
      let used = false;
      let usageMatch: RegExpExecArray | null;
      while ((usageMatch = usageRe.exec(file.content)) !== null) {
        // Exclude the declaration itself
        if (usageMatch.index < v.offset || usageMatch.index >= v.offset + v.length) {
          used = true;
          break;
        }
      }
      if (!used) {
        issues.push({
          severity: 'info',
          message: `Unused variable "${v.name}"`,
          file: normalised,
          line: lineAt(file.content, v.offset),
          suggestion: 'Remove the unused assign statement to reduce template complexity',
        });
        deductions += 1;
      }
    }

    // Deep nesting check
    const lines = file.content.split('\n');
    let depth = 0;
    let maxDepth = 0;

    for (const line of lines) {
      const opens = (line.match(blockOpenRegex) ?? []).length;
      blockOpenRegex.lastIndex = 0;
      const closes = (line.match(blockCloseRegex) ?? []).length;
      blockCloseRegex.lastIndex = 0;

      depth += opens - closes;
      if (depth > maxDepth) maxDepth = depth;
    }

    if (maxDepth > 4) {
      issues.push({
        severity: 'warning',
        message: `Deeply nested Liquid blocks (${maxDepth} levels)`,
        file: normalised,
        suggestion: 'Refactor into snippets or simplify conditions to reduce nesting',
      });
      deductions += 3;
    }

    // Very long files
    if (lines.length > 500) {
      issues.push({
        severity: 'warning',
        message: `Very long file (${lines.length} lines)`,
        file: normalised,
        suggestion: 'Break long files into smaller sections or snippets',
      });
      deductions += 3;
    }
  }

  const score = Math.max(0, 100 - deductions);
  return { name: 'liquid-quality', score, maxScore: 100, issues };
}

// ---------------------------------------------------------------------------
// Tier 2 — AI prompt builder
// ---------------------------------------------------------------------------

/**
 * Build the system prompt for the AI theme reviewer.
 * @internal
 */
function buildSystemPrompt(): string {
  return `You are an expert Shopify theme reviewer. You analyze Shopify Liquid themes and return a structured JSON review.

You MUST respond with ONLY a valid JSON object (no markdown, no code fences) matching this exact structure:

{
  "categories": [
    {
      "name": "performance",
      "score": <0-100>,
      "issues": [{ "severity": "critical|warning|info", "message": "...", "file": "...", "line": <number|null>, "suggestion": "..." }]
    },
    {
      "name": "accessibility",
      "score": <0-100>,
      "issues": [...]
    },
    {
      "name": "seo",
      "score": <0-100>,
      "issues": [...]
    },
    {
      "name": "best-practices",
      "score": <0-100>,
      "issues": [...]
    },
    {
      "name": "liquid-quality",
      "score": <0-100>,
      "issues": [...]
    }
  ]
}

Evaluate thoroughly. Be specific about file paths and line numbers when possible.
Score each category from 0 (terrible) to 100 (perfect).
Focus on actionable issues with clear suggestions.`;
}

/**
 * Build the user prompt with file summaries for the AI reviewer.
 * @internal
 */
function buildReviewPrompt(files: ThemeFileInput[]): string {
  const lines: string[] = [
    `Review this Shopify theme (${files.length} files). For each file I show: path, line count, size, and notable patterns.\n`,
  ];

  for (const file of files) {
    const normalised = normalisePath(file.path);
    const lineCount = file.content.split('\n').length;
    const sizeKB = (new TextEncoder().encode(file.content).byteLength / 1024).toFixed(1);

    // Count notable patterns
    const renderCount = (file.content.match(/\{%-?\s*render\b/g) ?? []).length;
    const forCount = (file.content.match(/\{%-?\s*for\b/g) ?? []).length;
    const ifCount = (file.content.match(/\{%-?\s*if\b/g) ?? []).length;

    let summary = `File ${normalised} (${lineCount} lines, ${sizeKB} KB)`;
    if (renderCount || forCount || ifCount) {
      const tags = [];
      if (renderCount) tags.push(`render:${renderCount}`);
      if (forCount) tags.push(`for:${forCount}`);
      if (ifCount) tags.push(`if:${ifCount}`);
      summary += ` [${tags.join(', ')}]`;
    }

    lines.push(summary);

    // Include full content for small files, truncated for large ones
    if (lineCount <= 100) {
      lines.push('```liquid');
      lines.push(file.content);
      lines.push('```');
    } else {
      // Show first 50 and last 30 lines for context
      const contentLines = file.content.split('\n');
      lines.push('```liquid');
      lines.push(contentLines.slice(0, 50).join('\n'));
      lines.push(`\n... (${lineCount - 80} lines omitted) ...\n`);
      lines.push(contentLines.slice(-30).join('\n'));
      lines.push('```');
    }

    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Parse the AI response JSON into category results.
 * Falls back gracefully if the AI response is malformed.
 * @internal
 */
function parseAIResponse(
  raw: string,
): ThemeReviewCategory[] | null {
  try {
    // Strip potential markdown code fences
    const cleaned = raw
      .replace(/^```(?:json)?\s*/m, '')
      .replace(/\s*```\s*$/m, '')
      .trim();

    const parsed = JSON.parse(cleaned) as {
      categories?: Array<{
        name: string;
        score: number;
        issues?: Array<{
          severity?: string;
          message?: string;
          file?: string;
          line?: number;
          suggestion?: string;
        }>;
      }>;
    };

    if (!parsed.categories || !Array.isArray(parsed.categories)) {
      return null;
    }

    const validNames = new Set([
      'performance',
      'accessibility',
      'seo',
      'best-practices',
      'liquid-quality',
    ]);

    return parsed.categories
      .filter((cat) => validNames.has(cat.name))
      .map((cat) => ({
        name: cat.name as ThemeReviewCategory['name'],
        score: Math.max(0, Math.min(100, Math.round(cat.score))),
        maxScore: 100,
        issues: (cat.issues ?? []).map((issue) => ({
          severity: (['critical', 'warning', 'info'].includes(issue.severity ?? '')
            ? issue.severity
            : 'info') as CategoryIssue['severity'],
          message: issue.message ?? 'No description provided',
          file: issue.file,
          line: issue.line,
          suggestion: issue.suggestion,
        })),
      }));
  } catch {
    return null;
  }
}

/**
 * Merge rule-based and AI category scores.
 *
 * Takes the lower (more conservative) score of each category from the
 * rule-based and AI reviews, and combines their issues.
 * @internal
 */
function mergeCategories(
  ruleCategories: ThemeReviewCategory[],
  aiCategories: ThemeReviewCategory[],
): ThemeReviewCategory[] {
  const aiMap = new Map(aiCategories.map((c) => [c.name, c]));

  return ruleCategories.map((ruleCat) => {
    const aiCat = aiMap.get(ruleCat.name);
    if (!aiCat) return ruleCat;

    // Use the lower score (more conservative)
    const mergedScore = Math.min(ruleCat.score, aiCat.score);

    // Combine issues, de-duplicating by message
    const seenMessages = new Set(ruleCat.issues.map((i) => i.message));
    const uniqueAIIssues = aiCat.issues.filter((i) => !seenMessages.has(i.message));

    return {
      name: ruleCat.name,
      score: mergedScore,
      maxScore: 100,
      issues: [...ruleCat.issues, ...uniqueAIIssues],
    };
  });
}

/**
 * Compute the weighted overall score from category scores.
 * @internal
 */
function computeOverallScore(categories: ThemeReviewCategory[]): number {
  let totalWeight = 0;
  let weightedSum = 0;

  for (const cat of categories) {
    const weight = CATEGORY_WEIGHTS[cat.name] ?? 0;
    weightedSum += cat.score * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return 0;
  return Math.round(weightedSum / totalWeight);
}

/**
 * Group all category issues by file for the fileIssues report.
 * @internal
 */
function groupIssuesByFile(categories: ThemeReviewCategory[]): FileIssue[] {
  const fileMap = new Map<string, CategoryIssue[]>();

  for (const cat of categories) {
    for (const issue of cat.issues) {
      if (issue.file) {
        const existing = fileMap.get(issue.file) ?? [];
        existing.push(issue);
        fileMap.set(issue.file, existing);
      }
    }
  }

  return Array.from(fileMap.entries())
    .map(([file, issues]) => ({ file, issues }))
    .sort((a, b) => b.issues.length - a.issues.length);
}

// ---------------------------------------------------------------------------
// Tier 2 — Public API
// ---------------------------------------------------------------------------

/**
 * Run a comprehensive AI-powered theme review.
 *
 * Combines rule-based scoring (instant) with an AI review for deeper analysis.
 * The AI callback is injected to keep this module free of provider dependencies.
 *
 * @param files - Array of theme files with path and content.
 * @param aiReview - Callback that sends a prompt to an AI provider and returns the response text.
 * @returns Full review report with scores, categories, and per-file issues.
 */
export async function fullThemeReview(
  files: ThemeFileInput[],
  aiReview: (prompt: string, systemPrompt: string) => Promise<string>,
): Promise<ThemeReviewReport> {
  const start = performance.now();

  // Step 1: Run rule-based scorers (instant)
  const ruleCategories: ThemeReviewCategory[] = [
    scorePerformance(files),
    scoreAccessibility(files),
    scoreSEO(files),
    scoreBestPractices(files),
    scoreLiquidQuality(files),
  ];

  // Step 2: Build prompts and call AI
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildReviewPrompt(files);

  let finalCategories = ruleCategories;

  try {
    const aiResponse = await aiReview(userPrompt, systemPrompt);
    const aiCategories = parseAIResponse(aiResponse);

    if (aiCategories && aiCategories.length > 0) {
      // Step 3: Merge rule-based and AI results
      finalCategories = mergeCategories(ruleCategories, aiCategories);
    }
  } catch {
    // AI failed — fall back to rule-based results only.
    // This is by design: the rule-based baseline always works.
  }

  // Step 4: Compute overall score and group file issues
  const overallScore = computeOverallScore(finalCategories);
  const fileIssues = groupIssuesByFile(finalCategories);
  const elapsed = performance.now() - start;

  return {
    overallScore,
    categories: finalCategories,
    fileIssues,
    reviewedAt: new Date().toISOString(),
    reviewTimeMs: Math.round(elapsed),
  };
}
