/**
 * Schema-aware content splitting for Liquid section files.
 * Strips large schema blocks from file content to reduce agent context size.
 */

const SCHEMA_RE = /\{%[-\s]*schema\s*%\}([\s\S]*?)\{%[-\s]*endschema\s*%\}/;

export interface SchemaStripResult {
  markup: string;        // Liquid markup without schema
  schema: string;        // Just the schema JSON (without {% schema %} tags)
  schemaTag: string;     // Full {% schema %}...{% endschema %} block
  summary: string;       // Human-readable one-line summary
  settingCount: number;
  blockTypeCount: number;
  presetCount: number;
  originalLineCount: number;
  markupLineCount: number;
  schemaLineCount: number;
}

export function stripSchema(content: string): SchemaStripResult | null {
  const match = content.match(SCHEMA_RE);
  if (!match) return null;

  const schemaTag = match[0];
  const schemaJson = match[1].trim();
  const markup = content.replace(SCHEMA_RE, '').trim();

  let settingCount = 0;
  let blockTypeCount = 0;
  let presetCount = 0;

  try {
    const parsed = JSON.parse(schemaJson);
    settingCount = Array.isArray(parsed.settings) ? parsed.settings.length : 0;
    blockTypeCount = Array.isArray(parsed.blocks) ? parsed.blocks.length : 0;
    presetCount = Array.isArray(parsed.presets) ? parsed.presets.length : 0;
  } catch {
    // Invalid schema JSON — still strip it
  }

  const summary = `[Schema: ${settingCount} settings, ${blockTypeCount} block types, ${presetCount} presets — ${schemaTag.split('\n').length} lines]`;

  return {
    markup,
    schema: schemaJson,
    schemaTag,
    summary,
    settingCount,
    blockTypeCount,
    presetCount,
    originalLineCount: content.split('\n').length,
    markupLineCount: markup.split('\n').length,
    schemaLineCount: schemaTag.split('\n').length,
  };
}

/**
 * Returns file content with schema replaced by a compact summary.
 * Use for pre-loading context where the agent doesn't need full schema.
 */
export function contentWithSchemaSummary(content: string): string {
  const result = stripSchema(content);
  if (!result) return content; // Not a section file or no schema

  return `${result.markup}\n\n{% schema %}\n${result.summary}\n{% endschema %}`;
}

/**
 * Returns just the markup portion (no schema at all).
 */
export function contentMarkupOnly(content: string): string {
  const result = stripSchema(content);
  return result ? result.markup : content;
}

/**
 * Returns just the schema JSON.
 */
export function contentSchemaOnly(content: string): string {
  const result = stripSchema(content);
  return result ? result.schema : '';
}

/**
 * Check if a file path is likely a section file that has a schema.
 */
export function isSectionFile(path: string): boolean {
  return /^sections\/.*\.liquid$/.test(path);
}
