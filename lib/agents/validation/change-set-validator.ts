/**
 * Programmatic cross-file consistency check on proposed changes.
 * Runs before the review agent to catch structural breakage that individual
 * specialists working in isolation would miss.
 */

import type { CodeChange, FileContext } from '@/lib/types/agent';

export interface ValidationIssue {
  severity: 'error' | 'warning';
  file: string;
  description: string;
  category:
    | 'snippet_reference'
    | 'css_class'
    | 'template_section'
    | 'schema_setting'
    | 'asset_reference'
    | 'deprecated_liquid'
    | 'locale_key'
    | 'companion_css'
    | 'companion_js'
    | 'companion_schema';
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

type MergedEntry = {
  content: string;
  fileType: FileContext['fileType'];
  path?: string;
};

/** Build a merged file map: projectFiles overlaid with proposed changes. */
function buildMergedFileMap(
  changes: CodeChange[],
  projectFiles: FileContext[]
): Map<string, MergedEntry> {
  const map = new Map<string, MergedEntry>();
  const changeByFile = new Map<string, CodeChange>();
  for (const c of changes) {
    changeByFile.set(c.fileName, c);
  }

  for (const f of projectFiles) {
    const key = f.path ?? f.fileName;
    const change = changeByFile.get(f.fileName) ?? changeByFile.get(key);
    map.set(key, {
      content: change ? change.proposedContent : f.content,
      fileType: f.fileType,
      path: f.path,
    });
  }

  for (const c of changes) {
    const key = c.fileName;
    if (!map.has(key)) {
      const fileType: FileContext['fileType'] = key.endsWith('.liquid')
        ? 'liquid'
        : key.endsWith('.json')
          ? 'other'
          : 'other';
      map.set(key, {
        content: c.proposedContent,
        fileType,
        path: key,
      });
    }
  }

  return map;
}

/** Normalize path for consistent lookup (snippets/name.liquid, sections/type.liquid). */
function normalizeSnippetPath(name: string): string {
  return name.endsWith('.liquid') ? `snippets/${name}` : `snippets/${name}.liquid`;
}

function normalizeSectionPath(type: string): string {
  return type.endsWith('.liquid') ? `sections/${type}` : `sections/${type}.liquid`;
}

/** Check snippet references: {% render 'name' %} and {% include 'name' %}. */
function checkSnippetReferences(
  filePath: string,
  content: string,
  fileSet: Set<string>
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const renderRegex = /\{%-?\s*(?:render|include)\s+['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;

  while ((match = renderRegex.exec(content)) !== null) {
    const name = match[1];
    const snippetPath = normalizeSnippetPath(name);
    if (!fileSet.has(snippetPath)) {
      issues.push({
        severity: 'error',
        file: filePath,
        description: `Snippet reference "${snippetPath}" not found in project`,
        category: 'snippet_reference',
      });
    }
  }

  return issues;
}

/** Extract setting IDs from a parsed schema JSON. */
function extractSchemaSettingIds(schemaJson: unknown): Set<string> {
  const ids = new Set<string>();
  if (!schemaJson || typeof schemaJson !== 'object') return ids;

  const obj = schemaJson as Record<string, unknown>;

  const extractFromSettings = (arr: unknown) => {
    if (!Array.isArray(arr)) return;
    for (const item of arr) {
      if (item && typeof item === 'object' && 'id' in item && typeof (item as { id: unknown }).id === 'string') {
        ids.add((item as { id: string }).id);
      }
    }
  };

  extractFromSettings(obj.settings);

  const blocks = obj.blocks;
  if (Array.isArray(blocks)) {
    for (const block of blocks) {
      if (block && typeof block === 'object' && 'settings' in block) {
        extractFromSettings((block as { settings: unknown }).settings);
      }
    }
  }

  return ids;
}

/** Check section.settings.X and block.settings.X reference valid schema setting IDs. */
function checkSchemaSettings(
  filePath: string,
  content: string
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const schemaMatch = content.match(/\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/);
  if (!schemaMatch) return issues;

  let schemaJson: unknown;
  try {
    schemaJson = JSON.parse(schemaMatch[1].trim());
  } catch {
    return issues;
  }

  const validIds = extractSchemaSettingIds(schemaJson);
  if (validIds.size === 0) return issues;

  const liquidContent = content.slice(0, schemaMatch.index) + content.slice(schemaMatch.index! + schemaMatch[0].length);

  const sectionSettingsRegex = /section\.settings\.(\w+)/g;
  const blockSettingsRegex = /block\.settings\.(\w+)/g;

  let match: RegExpExecArray | null;
  while ((match = sectionSettingsRegex.exec(liquidContent)) !== null) {
    const id = match[1];
    if (!validIds.has(id)) {
      issues.push({
        severity: 'warning',
        file: filePath,
        description: `section.settings.${id} referenced but not defined in {% schema %}`,
        category: 'schema_setting',
      });
    }
  }

  while ((match = blockSettingsRegex.exec(liquidContent)) !== null) {
    const id = match[1];
    if (!validIds.has(id)) {
      issues.push({
        severity: 'warning',
        file: filePath,
        description: `block.settings.${id} referenced but not defined in {% schema %}`,
        category: 'schema_setting',
      });
    }
  }

  return issues;
}

/** Check template JSON sections reference existing section files. */
function checkTemplateSections(
  filePath: string,
  content: string,
  fileSet: Set<string>
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!filePath.includes('templates/') || !filePath.endsWith('.json')) {
    return issues;
  }

  let data: { sections?: Record<string, { type?: string }> };
  try {
    data = JSON.parse(content) as typeof data;
  } catch {
    return issues;
  }

  const sections = data.sections ?? {};
  for (const [key, section] of Object.entries(sections)) {
    const sectionType = section?.type;
    if (!sectionType) continue;

    const sectionPath = normalizeSectionPath(sectionType);
    if (!fileSet.has(sectionPath)) {
      issues.push({
        severity: 'error',
        file: filePath,
        description: `Template references section "${sectionPath}" (key "${key}") which does not exist`,
        category: 'template_section',
      });
    }
  }

  return issues;
}

/** Check asset references {{ 'file' | asset_url }} point to existing assets. */
function checkAssetReferences(
  filePath: string,
  content: string,
  fileSet: Set<string>
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const assetUrlRegex = /\{\{-?\s*['"]([^'"]+)['"]\s*\|\s*asset_url/g;
  const assetImgUrlRegex = /\{\{-?\s*['"]([^'"]+)['"]\s*\|\s*asset_img_url/g;

  const checkMatch = (match: RegExpExecArray) => {
    const assetName = match[1];
    const assetPath = assetName.startsWith('assets/') ? assetName : `assets/${assetName}`;
    if (!fileSet.has(assetPath)) {
      issues.push({
        severity: 'warning',
        file: filePath,
        description: `Asset "${assetPath}" referenced but not found in project`,
        category: 'asset_reference',
      });
    }
  };

  let match: RegExpExecArray | null;
  while ((match = assetUrlRegex.exec(content)) !== null) {
    checkMatch(match);
  }
  while ((match = assetImgUrlRegex.exec(content)) !== null) {
    checkMatch(match);
  }

  return issues;
}

/** Extract static class names from Liquid (class="foo bar" or class='foo bar'). */
function extractLiquidClasses(content: string): Set<string> {
  const classes = new Set<string>();
  const regex = /class\s*=\s*["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    for (const c of match[1].trim().split(/\s+/)) {
      if (c) classes.add(c);
    }
  }
  return classes;
}

/** Extract class selectors from CSS (e.g. .btn, .btn-primary). */
function extractCssClasses(mergedMap: Map<string, MergedEntry>): Set<string> {
  const classes = new Set<string>();
  for (const [, entry] of mergedMap) {
    if (entry.fileType !== 'css' && !entry.path?.endsWith('.css') && !entry.path?.endsWith('.scss')) {
      continue;
    }
    const regex = /\.([a-zA-Z_][a-zA-Z0-9_-]*)\s*[:{\s,]/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(entry.content)) !== null) {
      classes.add(match[1]);
    }
  }
  return classes;
}

/**
 * Check CSS class names: Liquid class usage should exist in project CSS.
 * Only flags when we have CSS files and a Liquid class is not found in any of them.
 */
function checkCssClassConsistency(
  filePath: string,
  content: string,
  mergedMap: Map<string, MergedEntry>
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const cssClasses = extractCssClasses(mergedMap);
  if (cssClasses.size === 0) return issues;

  const liquidClasses = extractLiquidClasses(content);
  for (const cls of liquidClasses) {
    if (!cssClasses.has(cls)) {
      issues.push({
        severity: 'warning',
        file: filePath,
        description: `Class "${cls}" used in Liquid but not found in project CSS (may be from external styles)`,
        category: 'css_class',
      });
    }
  }
  return issues;
}

/** Check for deprecated Liquid constructs that should not be introduced. */
function checkDeprecatedLiquidConstructs(
  filePath: string,
  content: string
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!filePath.endsWith('.liquid')) return issues;

  if (/\{%-?\s*include\s+['"]/g.test(content)) {
    issues.push({
      severity: 'warning',
      file: filePath,
      description: 'Deprecated Liquid tag `{% include %}` detected; prefer `{% render %}`.',
      category: 'deprecated_liquid',
    });
  }
  if (/\|\s*img_url\b/g.test(content)) {
    issues.push({
      severity: 'warning',
      file: filePath,
      description: 'Deprecated Liquid filter `img_url` detected; prefer `image_url`.',
      category: 'deprecated_liquid',
    });
  }

  return issues;
}

function flattenLocaleKeys(input: unknown, prefix = ''): string[] {
  if (!input || typeof input !== 'object') return [];
  const obj = input as Record<string, unknown>;
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const current = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') {
      keys.push(...flattenLocaleKeys(v, current));
    } else {
      keys.push(current);
    }
  }
  return keys;
}

/** Check translation keys used in Liquid exist in at least one locale JSON file. */
function checkLocaleKeyReferences(
  filePath: string,
  content: string,
  localeKeys: Set<string>
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!filePath.endsWith('.liquid') || localeKeys.size === 0) return issues;

  const tRegex = /['"]([a-zA-Z0-9_.-]+)['"]\s*\|\s*t\b/g;
  let match: RegExpExecArray | null;
  while ((match = tRegex.exec(content)) !== null) {
    const key = match[1];
    if (!localeKeys.has(key)) {
      issues.push({
        severity: 'warning',
        file: filePath,
        description: `Translation key "${key}" not found in locale files.`,
        category: 'locale_key',
      });
    }
  }

  return issues;
}

function normalizePath(path: string): string {
  return String(path || '').replace(/\\/g, '/').replace(/^\.?\//, '');
}

function extractDataAttributes(content: string): Set<string> {
  const attrs = new Set<string>();
  const regex = /\b(data-[a-zA-Z0-9_-]+)\b/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    attrs.add(match[1]);
  }
  return attrs;
}

function extractSectionSettingRefs(content: string): Set<string> {
  const refs = new Set<string>();
  const sectionRegex = /section\.settings\.(\w+)/g;
  const blockRegex = /block\.settings\.(\w+)/g;
  let match: RegExpExecArray | null;

  while ((match = sectionRegex.exec(content)) !== null) refs.add(match[1]);
  while ((match = blockRegex.exec(content)) !== null) refs.add(match[1]);
  return refs;
}

function extractSchemaJsonFromSection(content: string): unknown | null {
  const schemaMatch = content.match(/\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/);
  if (!schemaMatch) return null;
  try {
    return JSON.parse(schemaMatch[1].trim()) as unknown;
  } catch {
    return null;
  }
}

function checkCompanionCoverage(
  changes: CodeChange[],
  mergedMap: Map<string, MergedEntry>
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const normalizedChanges = changes.map((c) => normalizePath(c.fileName));
  const hasCssChange = normalizedChanges.some((p) => p.startsWith('assets/') && /\.(css|scss)$/i.test(p));
  const hasJsChange = normalizedChanges.some((p) => p.startsWith('assets/') && /\.(js|mjs|ts)$/i.test(p));
  const cssClasses = extractCssClasses(mergedMap);

  for (const change of changes) {
    const filePath = normalizePath(change.fileName);
    if (!filePath.endsWith('.liquid')) continue;

    const originalClasses = extractLiquidClasses(change.originalContent || '');
    const proposedClasses = extractLiquidClasses(change.proposedContent || '');
    const addedClasses = [...proposedClasses].filter((cls) => !originalClasses.has(cls));

    // Hard contract: new Liquid component classes should be backed by CSS in the same change set
    // unless those classes already exist in project CSS.
    const trulyNewUnstyled = addedClasses.filter((cls) => !cssClasses.has(cls));
    if (trulyNewUnstyled.length > 0 && !hasCssChange) {
      issues.push({
        severity: 'error',
        file: filePath,
        description:
          `Liquid introduces new class(es) without companion CSS change: ` +
          `${trulyNewUnstyled.slice(0, 5).map((c) => `"${c}"`).join(', ')}.`,
        category: 'companion_css',
      });
    }

    const originalDataAttrs = extractDataAttributes(change.originalContent || '');
    const proposedDataAttrs = extractDataAttributes(change.proposedContent || '');
    const addedDataAttrs = [...proposedDataAttrs].filter((attr) => !originalDataAttrs.has(attr));
    if (addedDataAttrs.length > 0 && !hasJsChange) {
      issues.push({
        severity: 'warning',
        file: filePath,
        description:
          `Liquid introduces new data-attribute(s) without JS changes: ` +
          `${addedDataAttrs.slice(0, 5).join(', ')}.`,
        category: 'companion_js',
      });
    }

    // Section-schema contract: newly introduced settings refs must exist in final schema.
    if (filePath.startsWith('sections/')) {
      const originalRefs = extractSectionSettingRefs(change.originalContent || '');
      const proposedRefs = extractSectionSettingRefs(change.proposedContent || '');
      const newlyIntroducedRefs = [...proposedRefs].filter((ref) => !originalRefs.has(ref));
      if (newlyIntroducedRefs.length > 0) {
        const schema = extractSchemaJsonFromSection(change.proposedContent || '');
        const validIds = extractSchemaSettingIds(schema);
        const missing = newlyIntroducedRefs.filter((ref) => !validIds.has(ref));
        if (missing.length > 0) {
          issues.push({
            severity: 'error',
            file: filePath,
            description:
              `New section/block settings reference(s) missing from {% schema %}: ` +
              `${missing.slice(0, 5).join(', ')}.`,
            category: 'companion_schema',
          });
        }
      }
    }
  }

  return issues;
}

/**
 * Validate a change set for cross-file consistency.
 * Runs before the review agent to catch structural breakage.
 */
function issueKey(i: ValidationIssue): string {
  return `${i.severity}:${i.category}:${i.file}:${i.description}`;
}

function runChecks(
  mergedMap: Map<string, MergedEntry>,
  fileSet: Set<string>,
  localeKeys: Set<string>,
  changes: CodeChange[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const [filePath, { content, fileType }] of mergedMap) {
    if (fileType === 'liquid' || filePath.endsWith('.liquid')) {
      issues.push(...checkSnippetReferences(filePath, content, fileSet));
      issues.push(...checkSchemaSettings(filePath, content));
      issues.push(...checkAssetReferences(filePath, content, fileSet));
      issues.push(...checkCssClassConsistency(filePath, content, mergedMap));
      issues.push(...checkDeprecatedLiquidConstructs(filePath, content));
      issues.push(...checkLocaleKeyReferences(filePath, content, localeKeys));
    }

    if (filePath.includes('templates/') && filePath.endsWith('.json')) {
      issues.push(...checkTemplateSections(filePath, content, fileSet));
    }
  }

  issues.push(...checkCompanionCoverage(changes, mergedMap));
  return issues;
}

function collectLocaleKeys(mergedMap: Map<string, MergedEntry>): Set<string> {
  const keys = new Set<string>();
  for (const [path, entry] of mergedMap) {
    if (!path.startsWith('locales/') || !path.endsWith('.json')) continue;
    try {
      const parsed = JSON.parse(entry.content) as unknown;
      for (const k of flattenLocaleKeys(parsed)) keys.add(k);
    } catch { /* handled elsewhere */ }
  }
  return keys;
}

export function validateChangeSet(
  changes: CodeChange[],
  projectFiles: FileContext[]
): ValidationResult {
  // Run checks on the PROPOSED state (after edits)
  const mergedMap = buildMergedFileMap(changes, projectFiles);
  const localeKeys = collectLocaleKeys(mergedMap);
  const fileSet = new Set<string>(mergedMap.keys());
  const afterIssues = runChecks(mergedMap, fileSet, localeKeys, changes);

  // Build a BASELINE: use original content for changed files to count pre-existing issues
  const baselineChanges: CodeChange[] = changes.map(c => ({
    ...c,
    proposedContent: c.originalContent || '',
  }));
  const baselineMap = buildMergedFileMap(baselineChanges, projectFiles);
  const baselineLocaleKeys = collectLocaleKeys(baselineMap);
  const baselineFileSet = new Set<string>(baselineMap.keys());
  const beforeIssues = runChecks(baselineMap, baselineFileSet, baselineLocaleKeys, baselineChanges);

  // Diff: only keep issues that are NEW (not in the baseline)
  const baselineSet = new Set(beforeIssues.map(issueKey));
  const regressions = afterIssues.filter(i => !baselineSet.has(issueKey(i)));

  const hasErrors = regressions.some((i) => i.severity === 'error');
  return {
    valid: !hasErrors,
    issues: regressions,
  };
}
