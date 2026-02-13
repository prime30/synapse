/**
 * Convention Detector — analyzes theme files for recurring patterns.
 *
 * EPIC 14: Detects naming conventions (BEM, kebab-case), schema patterns
 * (consistent setting IDs), color approaches (CSS vars vs inline), and
 * structural patterns with confidence scores.
 */

import type { Convention, CreateMemoryInput } from './developer-memory';

// ── Types ─────────────────────────────────────────────────────────────

export interface ThemeFile {
  path: string;
  content: string;
  fileType: 'liquid' | 'css' | 'javascript' | 'other';
}

export interface DetectedConvention {
  convention: Convention;
  /** How many files exhibited this pattern */
  fileCount: number;
}

// ── Pattern detectors ─────────────────────────────────────────────────

/**
 * Detect CSS class naming conventions across theme files.
 * Looks for BEM, kebab-case, camelCase, snake_case patterns.
 */
function detectNamingConventions(files: ThemeFile[]): DetectedConvention[] {
  const classNames: string[] = [];

  for (const file of files) {
    if (file.fileType === 'liquid' || file.fileType === 'css') {
      // Extract class names from CSS selectors
      const cssClassRe = /\.([a-zA-Z_][\w-]*)/g;
      let m: RegExpExecArray | null;
      while ((m = cssClassRe.exec(file.content)) !== null) {
        classNames.push(m[1]);
      }

      // Extract class names from HTML class attributes
      const htmlClassRe = /class=["']([^"']+)["']/g;
      while ((m = htmlClassRe.exec(file.content)) !== null) {
        classNames.push(...m[1].split(/\s+/).filter(Boolean));
      }
    }
  }

  if (classNames.length < 5) return [];

  const results: DetectedConvention[] = [];

  // BEM pattern: block__element--modifier
  const bemPattern = /^[a-z][\w]*__[\w]+(?:--[\w]+)?$/;
  const bemCount = classNames.filter((c) => bemPattern.test(c)).length;
  const bemRatio = bemCount / classNames.length;

  if (bemRatio > 0.15 && bemCount >= 3) {
    const examples = classNames
      .filter((c) => bemPattern.test(c))
      .slice(0, 5);
    results.push({
      convention: {
        pattern: 'BEM naming convention (block__element--modifier)',
        confidence: Math.min(bemRatio * 2, 0.95),
        examples,
        source: 'naming',
      },
      fileCount: new Set(
        files
          .filter((f) => examples.some((e) => f.content.includes(e)))
          .map((f) => f.path)
      ).size,
    });
  }

  // kebab-case pattern (non-BEM): word-word
  const kebabPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/;
  const kebabCount = classNames.filter(
    (c) => kebabPattern.test(c) && !bemPattern.test(c)
  ).length;
  const kebabRatio = kebabCount / classNames.length;

  if (kebabRatio > 0.3 && kebabCount >= 5) {
    const examples = classNames
      .filter((c) => kebabPattern.test(c) && !bemPattern.test(c))
      .slice(0, 5);
    results.push({
      convention: {
        pattern: 'kebab-case class naming',
        confidence: Math.min(kebabRatio * 1.5, 0.95),
        examples,
        source: 'naming',
      },
      fileCount: new Set(
        files
          .filter((f) => examples.some((e) => f.content.includes(e)))
          .map((f) => f.path)
      ).size,
    });
  }

  // camelCase pattern
  const camelPattern = /^[a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*$/;
  const camelCount = classNames.filter((c) => camelPattern.test(c)).length;
  const camelRatio = camelCount / classNames.length;

  if (camelRatio > 0.2 && camelCount >= 3) {
    const examples = classNames
      .filter((c) => camelPattern.test(c))
      .slice(0, 5);
    results.push({
      convention: {
        pattern: 'camelCase class naming',
        confidence: Math.min(camelRatio * 1.5, 0.95),
        examples,
        source: 'naming',
      },
      fileCount: new Set(
        files
          .filter((f) => examples.some((e) => f.content.includes(e)))
          .map((f) => f.path)
      ).size,
    });
  }

  return results;
}

/**
 * Detect schema setting ID patterns across Liquid files.
 * Looks for consistent prefixes, snake_case vs camelCase IDs, etc.
 */
function detectSchemaPatterns(files: ThemeFile[]): DetectedConvention[] {
  const settingIds: string[] = [];
  const liquidFiles = files.filter((f) => f.fileType === 'liquid');

  for (const file of liquidFiles) {
    // Extract schema blocks
    const schemaRe = /\{%[-\s]*schema\s*%\}([\s\S]*?)\{%[-\s]*endschema\s*%\}/g;
    let sm: RegExpExecArray | null;

    while ((sm = schemaRe.exec(file.content)) !== null) {
      try {
        const schema = JSON.parse(sm[1]) as {
          settings?: Array<{ id?: string }>;
          blocks?: Array<{ settings?: Array<{ id?: string }> }>;
        };

        if (schema.settings) {
          for (const s of schema.settings) {
            if (s.id) settingIds.push(s.id);
          }
        }
        if (schema.blocks) {
          for (const block of schema.blocks) {
            if (block.settings) {
              for (const s of block.settings) {
                if (s.id) settingIds.push(s.id);
              }
            }
          }
        }
      } catch {
        // invalid JSON schema — skip
      }
    }
  }

  if (settingIds.length < 3) return [];

  const results: DetectedConvention[] = [];

  // snake_case setting IDs
  const snakePattern = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;
  const snakeCount = settingIds.filter((id) => snakePattern.test(id)).length;
  const snakeRatio = snakeCount / settingIds.length;

  if (snakeRatio > 0.5 && snakeCount >= 3) {
    results.push({
      convention: {
        pattern: 'snake_case schema setting IDs',
        confidence: Math.min(snakeRatio, 0.95),
        examples: settingIds.filter((id) => snakePattern.test(id)).slice(0, 5),
        source: 'schema',
      },
      fileCount: liquidFiles.length,
    });
  }

  // Common prefixes (e.g., "section_", "block_", "heading_")
  const prefixCounts = new Map<string, number>();
  for (const id of settingIds) {
    const parts = id.split('_');
    if (parts.length >= 2) {
      const prefix = parts[0] + '_';
      prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1);
    }
  }

  for (const [prefix, count] of prefixCounts) {
    if (count >= 3 && count / settingIds.length > 0.15) {
      results.push({
        convention: {
          pattern: `Schema IDs use "${prefix}" prefix convention`,
          confidence: Math.min((count / settingIds.length) * 1.2, 0.9),
          examples: settingIds.filter((id) => id.startsWith(prefix)).slice(0, 5),
          source: 'schema',
        },
        fileCount: liquidFiles.length,
      });
    }
  }

  return results;
}

/**
 * Detect color approach patterns (CSS custom properties vs inline values).
 */
function detectColorApproach(files: ThemeFile[]): DetectedConvention[] {
  let cssVarCount = 0;
  let inlineColorCount = 0;
  const cssVarExamples: string[] = [];
  const inlineExamples: string[] = [];

  for (const file of files) {
    if (file.fileType !== 'css' && file.fileType !== 'liquid') continue;

    // CSS custom property usage: var(--color-...)
    const varRe = /var\(--[\w-]+\)/g;
    let m: RegExpExecArray | null;
    while ((m = varRe.exec(file.content)) !== null) {
      cssVarCount++;
      if (cssVarExamples.length < 5) cssVarExamples.push(m[0]);
    }

    // Inline color values: #hex, rgb(), hsl()
    const inlineRe = /#[0-9a-fA-F]{3,8}\b|rgb\([^)]+\)|hsl\([^)]+\)/g;
    while ((m = inlineRe.exec(file.content)) !== null) {
      inlineColorCount++;
      if (inlineExamples.length < 5) inlineExamples.push(m[0]);
    }
  }

  const total = cssVarCount + inlineColorCount;
  if (total < 5) return [];

  const results: DetectedConvention[] = [];

  if (cssVarCount > inlineColorCount && cssVarCount / total > 0.6) {
    results.push({
      convention: {
        pattern: 'CSS custom properties for colors (over inline hex/rgb)',
        confidence: Math.min((cssVarCount / total) * 1.1, 0.95),
        examples: cssVarExamples,
        source: 'color',
      },
      fileCount: files.filter(
        (f) =>
          (f.fileType === 'css' || f.fileType === 'liquid') &&
          /var\(--/.test(f.content)
      ).length,
    });
  } else if (
    inlineColorCount > cssVarCount &&
    inlineColorCount / total > 0.6
  ) {
    results.push({
      convention: {
        pattern: 'Inline color values (hex/rgb/hsl, no CSS variables)',
        confidence: Math.min((inlineColorCount / total) * 1.1, 0.95),
        examples: inlineExamples,
        source: 'color',
      },
      fileCount: files.filter(
        (f) =>
          (f.fileType === 'css' || f.fileType === 'liquid') &&
          /#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/.test(f.content)
      ).length,
    });
  }

  return results;
}

/**
 * Detect spacing/layout approach (rem vs px, specific scale).
 */
function detectSpacingApproach(files: ThemeFile[]): DetectedConvention[] {
  let remCount = 0;
  let pxCount = 0;
  const remExamples: string[] = [];
  const pxExamples: string[] = [];

  for (const file of files) {
    if (file.fileType !== 'css' && file.fileType !== 'liquid') continue;

    const remRe = /[\d.]+rem\b/g;
    const pxRe = /[\d]+px\b/g;
    let m: RegExpExecArray | null;

    while ((m = remRe.exec(file.content)) !== null) {
      remCount++;
      if (remExamples.length < 5) remExamples.push(m[0]);
    }
    while ((m = pxRe.exec(file.content)) !== null) {
      pxCount++;
      if (pxExamples.length < 5) pxExamples.push(m[0]);
    }
  }

  const total = remCount + pxCount;
  if (total < 10) return [];

  const results: DetectedConvention[] = [];

  if (remCount > pxCount * 2) {
    results.push({
      convention: {
        pattern: 'rem-based spacing (over px)',
        confidence: Math.min((remCount / total) * 1.1, 0.9),
        examples: remExamples,
        source: 'spacing',
      },
      fileCount: files.filter(
        (f) => /[\d.]+rem\b/.test(f.content)
      ).length,
    });
  }

  return results;
}

/**
 * Detect structural patterns (section grouping, render vs include, etc.).
 */
function detectStructuralPatterns(files: ThemeFile[]): DetectedConvention[] {
  const results: DetectedConvention[] = [];
  const liquidFiles = files.filter((f) => f.fileType === 'liquid');

  let renderCount = 0;
  let includeCount = 0;

  for (const file of liquidFiles) {
    const renderRe = /\{%[-\s]*render\s/g;
    const includeRe = /\{%[-\s]*include\s/g;

    while (renderRe.exec(file.content) !== null) renderCount++;
    while (includeRe.exec(file.content) !== null) includeCount++;
  }

  const total = renderCount + includeCount;
  if (total >= 3 && renderCount > includeCount * 3) {
    results.push({
      convention: {
        pattern: 'Uses {% render %} over deprecated {% include %}',
        confidence: Math.min((renderCount / total) * 1.1, 0.95),
        examples: [`render: ${renderCount} uses`, `include: ${includeCount} uses`],
        source: 'structure',
      },
      fileCount: liquidFiles.filter((f) => /\{%[-\s]*render\s/.test(f.content))
        .length,
    });
  }

  return results;
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Analyze all theme files and detect codebase conventions.
 * Returns detected conventions with confidence scores.
 */
export function detectConventions(files: ThemeFile[]): DetectedConvention[] {
  const results: DetectedConvention[] = [];

  results.push(...detectNamingConventions(files));
  results.push(...detectSchemaPatterns(files));
  results.push(...detectColorApproach(files));
  results.push(...detectSpacingApproach(files));
  results.push(...detectStructuralPatterns(files));

  // Sort by confidence descending
  results.sort((a, b) => b.convention.confidence - a.convention.confidence);

  return results;
}

/**
 * Convert detected conventions into memory entries ready for persistence.
 */
export function conventionsToMemoryInputs(
  conventions: DetectedConvention[],
  projectId: string,
  userId: string
): CreateMemoryInput[] {
  return conventions.map((dc) => ({
    projectId,
    userId,
    type: 'convention' as const,
    content: dc.convention,
    confidence: dc.convention.confidence,
  }));
}
