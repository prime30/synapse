/**
 * Schema-specific indexer for Shopify section files.
 * Extracts each setting, block, and preset as a first-class searchable document.
 */

export interface SchemaEntry {
  sectionFile: string;
  entryType: 'setting' | 'block' | 'block_setting' | 'preset';
  id: string;
  type: string;
  label: string;
  defaultValue?: unknown;
  info?: string;
  parentBlock?: string;
  options?: Array<{ value: string; label: string }>;
}

const SCHEMA_RE = /\{%[-\s]*schema\s*[-\s]*%\}([\s\S]*?)\{%[-\s]*endschema\s*[-\s]*%\}/;

/**
 * Extract all schema entries from a Liquid section file.
 * Returns a flat list of settings, blocks, block settings, and presets.
 */
export function extractSchemaEntries(content: string, filePath: string): SchemaEntry[] {
  const match = content.match(SCHEMA_RE);
  if (!match) return [];

  let schema: Record<string, unknown>;
  try {
    schema = JSON.parse(match[1]);
  } catch {
    return [];
  }

  const entries: SchemaEntry[] = [];

  // Section-level settings
  const settings = (schema.settings as Array<Record<string, unknown>>) ?? [];
  for (const s of settings) {
    if (s.type === 'header' || s.type === 'paragraph') continue;
    entries.push({
      sectionFile: filePath,
      entryType: 'setting',
      id: String(s.id ?? ''),
      type: String(s.type ?? ''),
      label: String(s.label ?? s.id ?? ''),
      defaultValue: s.default,
      info: s.info as string | undefined,
      options: s.options as SchemaEntry['options'],
    });
  }

  // Blocks and their settings
  const blocks = (schema.blocks as Array<Record<string, unknown>>) ?? [];
  for (const block of blocks) {
    const blockType = String(block.type ?? '');
    const blockName = String(block.name ?? blockType);

    entries.push({
      sectionFile: filePath,
      entryType: 'block',
      id: blockType,
      type: 'block',
      label: blockName,
    });

    const blockSettings = (block.settings as Array<Record<string, unknown>>) ?? [];
    for (const bs of blockSettings) {
      if (bs.type === 'header' || bs.type === 'paragraph') continue;
      entries.push({
        sectionFile: filePath,
        entryType: 'block_setting',
        id: String(bs.id ?? ''),
        type: String(bs.type ?? ''),
        label: String(bs.label ?? bs.id ?? ''),
        defaultValue: bs.default,
        parentBlock: blockType,
        options: bs.options as SchemaEntry['options'],
      });
    }
  }

  // Presets
  const presets = (schema.presets as Array<Record<string, unknown>>) ?? [];
  for (const preset of presets) {
    entries.push({
      sectionFile: filePath,
      entryType: 'preset',
      id: String(preset.name ?? ''),
      type: 'preset',
      label: String(preset.name ?? ''),
    });
  }

  return entries;
}

/**
 * Format schema entries as a compact summary for agent context.
 * Much smaller than the raw schema JSON.
 */
export function formatSchemaSummary(entries: SchemaEntry[]): string {
  if (entries.length === 0) return 'No schema settings found.';

  const settings = entries.filter(e => e.entryType === 'setting');
  const blocks = entries.filter(e => e.entryType === 'block');
  const blockSettings = entries.filter(e => e.entryType === 'block_setting');

  const lines: string[] = [];

  if (settings.length > 0) {
    lines.push(`Settings (${settings.length}):`);
    for (const s of settings) {
      const def = s.defaultValue !== undefined ? ` = ${JSON.stringify(s.defaultValue)}` : '';
      lines.push(`  ${s.id} (${s.type}): "${s.label}"${def}`);
    }
  }

  if (blocks.length > 0) {
    lines.push(`\nBlocks (${blocks.length}):`);
    for (const b of blocks) {
      const bSettings = blockSettings.filter(bs => bs.parentBlock === b.id);
      lines.push(`  ${b.id}: "${b.label}" — ${bSettings.length} settings`);
      for (const bs of bSettings.slice(0, 5)) {
        lines.push(`    ${bs.id} (${bs.type}): "${bs.label}"`);
      }
      if (bSettings.length > 5) {
        lines.push(`    ... ${bSettings.length - 5} more`);
      }
    }
  }

  return lines.join('\n');
}
