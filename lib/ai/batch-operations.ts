import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BatchOperationResult {
  operationId: string;
  type: 'fix-all-similar' | 'bulk-localization' | 'bulk-schema-generation';
  changes: FileChange[];
  summary: string;
  totalFiles: number;
  modifiedFiles: number;
}

export interface FileChange {
  fileId: string;
  fileName: string;
  originalContent: string;
  newContent: string;
  changeDescription: string;
}

export interface ThemeFileContext {
  fileId: string;
  fileName: string;
  content: string;
  path?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Slugify a string for use as a locale key.
 * Lowercases, replaces spaces/non-alphanumeric runs with underscores, and
 * strips leading/trailing underscores.
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Derive a section name from a file name for locale key prefixes.
 * e.g. "hero-banner.liquid" -> "hero_banner"
 */
function sectionNameFromFile(fileName: string): string {
  const base = fileName.replace(/\.liquid$/, '').split('/').pop() ?? fileName;
  return slugify(base);
}

/**
 * Build a regex from a string or RegExp pattern, always with the global flag.
 */
function toGlobalRegex(pattern: string | RegExp): RegExp {
  if (typeof pattern === 'string') {
    return new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
  }
  // Ensure the global flag is set
  if (pattern.global) return pattern;
  return new RegExp(pattern.source, pattern.flags + 'g');
}

// ---------------------------------------------------------------------------
// 1. Fix All Similar
// ---------------------------------------------------------------------------

/**
 * Find a pattern across multiple files and apply the same fix to every
 * occurrence.
 *
 * - **Simple mode** (default): performs a literal string / regex replacement.
 * - **AI-assisted mode**: delegates to the provided `aiReplace` callback so the
 *   AI can produce context-aware fixes per file.
 *
 * Only files that actually change are included in the result.
 */
export async function fixAllSimilar(
  pattern: string | RegExp,
  replacement: string,
  files: ThemeFileContext[],
  options?: {
    /** If true, use AI to generate context-aware replacements instead of literal string replace */
    aiAssisted?: boolean;
    /** AI provider callback for aiAssisted mode */
    aiReplace?: (
      fileContent: string,
      pattern: string,
      context: string,
    ) => Promise<string>;
  },
): Promise<BatchOperationResult> {
  const operationId = randomUUID();
  const changes: FileChange[] = [];
  const regex = toGlobalRegex(pattern);
  const patternStr = typeof pattern === 'string' ? pattern : pattern.source;

  for (const file of files) {
    // Reset lastIndex for each file
    regex.lastIndex = 0;

    if (!regex.test(file.content)) continue;
    // Reset again after test consumed the regex state
    regex.lastIndex = 0;

    let newContent: string;

    if (options?.aiAssisted && options.aiReplace) {
      newContent = await options.aiReplace(
        file.content,
        patternStr,
        replacement,
      );
    } else {
      newContent = file.content.replace(regex, replacement);
    }

    if (newContent !== file.content) {
      changes.push({
        fileId: file.fileId,
        fileName: file.fileName,
        originalContent: file.content,
        newContent,
        changeDescription: `Replaced pattern "${patternStr}" in ${file.fileName}`,
      });
    }
  }

  return {
    operationId,
    type: 'fix-all-similar',
    changes,
    summary: `Fixed ${changes.length} of ${files.length} files matching pattern "${patternStr}"`,
    totalFiles: files.length,
    modifiedFiles: changes.length,
  };
}

// ---------------------------------------------------------------------------
// 2. Bulk Localization
// ---------------------------------------------------------------------------

/**
 * Regex to find hardcoded visible text inside HTML elements.
 *
 * Matches text between `>` and `<` that:
 * - contains at least one word character
 * - is NOT a Liquid output tag (`{{ ... }}`)
 * - is NOT only whitespace
 *
 * Groups:
 *  [1] - the hardcoded text
 */
const HARDCODED_TEXT_RE = />([^<{][^<]*?[a-zA-Z][^<]*?)</g;

/**
 * Scan Liquid files for hardcoded user-visible strings and replace them
 * with Shopify `t` filter translations.
 *
 * For each hardcoded string the function:
 * 1. Generates a locale key from the section name + slugified text.
 * 2. Replaces the text with `{{ 'section_name.key' | t }}`.
 * 3. Collects the new locale entries so the caller can merge them into
 *    `locales/en.default.json`.
 *
 * If `aiTranslate` is provided it is used instead of the rule-based approach,
 * allowing the AI to produce higher-quality key names and handle edge cases.
 */
export async function bulkLocalize(
  files: ThemeFileContext[],
  existingLocaleKeys?: Record<string, string>,
  aiTranslate?: (
    content: string,
    existingKeys: Record<string, string>,
  ) => Promise<{ content: string; newKeys: Record<string, string> }>,
): Promise<BatchOperationResult & { newLocaleKeys: Record<string, string> }> {
  const operationId = randomUUID();
  const changes: FileChange[] = [];
  const allNewKeys: Record<string, string> = {};
  const existing = existingLocaleKeys ?? {};

  // Only process Liquid files
  const liquidFiles = files.filter(
    (f) => f.fileName.endsWith('.liquid') || f.path?.endsWith('.liquid'),
  );

  for (const file of liquidFiles) {
    if (aiTranslate) {
      const result = await aiTranslate(file.content, existing);
      if (result.content !== file.content) {
        Object.assign(allNewKeys, result.newKeys);
        changes.push({
          fileId: file.fileId,
          fileName: file.fileName,
          originalContent: file.content,
          newContent: result.content,
          changeDescription: `Localized hardcoded strings in ${file.fileName}`,
        });
      }
      continue;
    }

    // Rule-based localization
    const sectionName = sectionNameFromFile(file.fileName);
    const fileNewKeys: Record<string, string> = {};
    let modified = file.content;
    let hasChanges = false;

    // Reset regex
    HARDCODED_TEXT_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    const replacements: { original: string; replacement: string }[] = [];

    while ((match = HARDCODED_TEXT_RE.exec(file.content)) !== null) {
      const text = match[1].trim();

      // Skip text that is only whitespace, numbers, or special characters
      if (!/[a-zA-Z]{2,}/.test(text)) continue;

      // Skip text that looks like a Liquid output (contains {{ }})
      if (/\{\{.*\}\}/.test(text)) continue;

      // Skip text that is just HTML entities or very short
      if (text.length < 2) continue;

      const key = slugify(text);
      if (!key) continue;

      const fullKey = `${sectionName}.${key}`;

      // Don't replace if this key already exists in locale files
      if (existing[fullKey]) continue;

      fileNewKeys[fullKey] = text;
      replacements.push({
        original: `>${match[1]}<`,
        replacement: `>{{ '${fullKey}' | t }}<`,
      });
    }

    // Apply replacements
    for (const { original, replacement } of replacements) {
      const before = modified;
      modified = modified.replace(original, replacement);
      if (modified !== before) {
        hasChanges = true;
      }
    }

    if (hasChanges) {
      Object.assign(allNewKeys, fileNewKeys);
      changes.push({
        fileId: file.fileId,
        fileName: file.fileName,
        originalContent: file.content,
        newContent: modified,
        changeDescription: `Localized ${Object.keys(fileNewKeys).length} hardcoded string(s) in ${file.fileName}`,
      });
    }
  }

  return {
    operationId,
    type: 'bulk-localization',
    changes,
    summary: `Localized ${changes.length} of ${liquidFiles.length} Liquid files, generated ${Object.keys(allNewKeys).length} new locale key(s)`,
    totalFiles: liquidFiles.length,
    modifiedFiles: changes.length,
    newLocaleKeys: allNewKeys,
  };
}

// ---------------------------------------------------------------------------
// 3. Bulk Schema Generation
// ---------------------------------------------------------------------------

/**
 * Generate a basic rule-based schema block for a section file.
 * Produces a `{% schema %}` JSON block with the section name and common
 * settings (heading, color_scheme).
 */
function generateBasicSchema(fileName: string): string {
  const name = fileName
    .replace(/\.liquid$/, '')
    .split('/')
    .pop()!
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const schema = {
    name,
    settings: [
      {
        type: 'text',
        id: 'heading',
        label: 'Heading',
        default: name,
      },
      {
        type: 'select',
        id: 'color_scheme',
        label: 'Color scheme',
        options: [
          { value: 'default', label: 'Default' },
          { value: 'inverse', label: 'Inverse' },
        ],
        default: 'default',
      },
    ],
    presets: [
      {
        name,
      },
    ],
  };

  return `\n{% schema %}\n${JSON.stringify(schema, null, 2)}\n{% endschema %}\n`;
}

const SCHEMA_TAG_RE = /\{%-?\s*schema\s*-?%\}/;

/**
 * Scan section files for missing `{% schema %}` blocks and generate them.
 *
 * - Only processes files whose path starts with `sections/`.
 * - Skips files that already contain a `{% schema %}` block.
 * - In AI mode, delegates schema generation to the `aiGenerate` callback.
 * - In rule-based mode, appends a basic schema with the section name and
 *   common settings (heading text, color scheme select).
 */
export async function bulkGenerateSchemas(
  files: ThemeFileContext[],
  aiGenerate?: (
    fileContent: string,
    fileName: string,
  ) => Promise<string>,
): Promise<BatchOperationResult> {
  const operationId = randomUUID();
  const changes: FileChange[] = [];

  // Filter for section files only
  const sectionFiles = files.filter((f) => {
    const filePath = f.path ?? f.fileName;
    return filePath.startsWith('sections/') || filePath.includes('/sections/');
  });

  for (const file of sectionFiles) {
    // Skip files that already have a schema block
    if (SCHEMA_TAG_RE.test(file.content)) continue;

    let newContent: string;

    if (aiGenerate) {
      const schemaBlock = await aiGenerate(file.content, file.fileName);
      newContent = file.content + '\n' + schemaBlock;
    } else {
      newContent = file.content + generateBasicSchema(file.fileName);
    }

    changes.push({
      fileId: file.fileId,
      fileName: file.fileName,
      originalContent: file.content,
      newContent,
      changeDescription: `Generated {% schema %} block for ${file.fileName}`,
    });
  }

  return {
    operationId,
    type: 'bulk-schema-generation',
    changes,
    summary: `Generated schemas for ${changes.length} of ${sectionFiles.length} section files`,
    totalFiles: sectionFiles.length,
    modifiedFiles: changes.length,
  };
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/**
 * Find all files whose content matches a given pattern, along with the
 * number of matches in each file.
 */
export function findMatchingFiles(
  pattern: string | RegExp,
  files: ThemeFileContext[],
): { file: ThemeFileContext; matchCount: number }[] {
  const regex = toGlobalRegex(pattern);
  const results: { file: ThemeFileContext; matchCount: number }[] = [];

  for (const file of files) {
    regex.lastIndex = 0;
    const matches = file.content.match(regex);
    if (matches && matches.length > 0) {
      results.push({ file, matchCount: matches.length });
    }
  }

  return results;
}
