/**
 * Shopify template structure parser.
 * Parses template JSON files (e.g. templates/index.json) into a navigable
 * tree of sections and blocks, and extracts schema definitions from
 * section Liquid content.
 */

// ── Types ─────────────────────────────────────────────────────────────

export interface TemplateBlock {
  type: string;
  disabled?: boolean;
  settings?: Record<string, unknown>;
}

export interface TemplateSection {
  id: string;
  type: string;
  disabled?: boolean;
  settings?: Record<string, unknown>;
  blocks?: Record<string, TemplateBlock>;
  block_order?: string[];
}

export interface TemplateTree {
  name: string;
  layout?: string;
  sections: TemplateSection[];
  order: string[];
}

export interface SchemaSettingDefinition {
  id: string;
  type: string;
  label: string;
  default?: unknown;
  info?: string;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
}

// ── Schema regex ──────────────────────────────────────────────────────

const SCHEMA_BLOCK_RE =
  /\{%[-\s]*schema\s*[-]?%\}([\s\S]*?)\{%[-\s]*endschema\s*[-]?%\}/;

// ── Parsing functions ─────────────────────────────────────────────────

/**
 * Parse a Shopify template JSON file (e.g. templates/index.json) into
 * a TemplateTree. Returns null if the content is not valid template JSON.
 */
export function parseTemplateJSON(
  templateName: string,
  jsonContent: string,
): TemplateTree | null {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(jsonContent) as Record<string, unknown>;
  } catch {
    return null;
  }

  const rawSections = data.sections as
    | Record<string, Record<string, unknown>>
    | undefined;

  if (!rawSections || typeof rawSections !== 'object') {
    return null;
  }

  const rawOrder = data.order as string[] | undefined;
  const order = Array.isArray(rawOrder)
    ? rawOrder
    : Object.keys(rawSections);

  const sections: TemplateSection[] = order.map((sectionId) => {
    const raw = rawSections[sectionId];
    if (!raw) {
      return { id: sectionId, type: sectionId };
    }

    const blocks = raw.blocks as
      | Record<string, TemplateBlock>
      | undefined;
    const blockOrder = raw.block_order as string[] | undefined;

    return {
      id: sectionId,
      type: (raw.type as string) ?? sectionId,
      disabled: raw.disabled === true ? true : undefined,
      settings: (raw.settings as Record<string, unknown>) ?? undefined,
      blocks: blocks ?? undefined,
      block_order: blockOrder ?? undefined,
    };
  });

  return {
    name: templateName,
    layout: data.layout as string | undefined,
    sections,
    order,
  };
}

/**
 * Extract the schema JSON object from a section's Liquid content.
 * Returns the parsed JSON or null if no schema block is found.
 */
export function extractSchemaFromSection(
  liquidContent: string,
): unknown | null {
  const match = SCHEMA_BLOCK_RE.exec(liquidContent);
  if (!match) return null;

  try {
    return JSON.parse(match[1].trim());
  } catch {
    return null;
  }
}

/**
 * Extract settings definitions from a parsed schema object.
 * Handles the top-level settings array; skips decorator types
 * (header, paragraph) that have no runtime value.
 */
export function getSchemaSettings(
  schema: unknown,
): SchemaSettingDefinition[] {
  if (!schema || typeof schema !== 'object') return [];

  const obj = schema as Record<string, unknown>;
  const rawSettings = obj.settings;
  if (!Array.isArray(rawSettings)) return [];

  const results: SchemaSettingDefinition[] = [];

  for (const item of rawSettings) {
    if (!item || typeof item !== 'object') continue;
    const s = item as Record<string, unknown>;

    if (typeof s.id !== 'string' || typeof s.type !== 'string') continue;
    if (s.type === 'header' || s.type === 'paragraph') continue;

    const def: SchemaSettingDefinition = {
      id: s.id,
      type: s.type,
      label: typeof s.label === 'string' ? s.label : s.id,
    };

    if (s.default !== undefined) def.default = s.default;
    if (typeof s.info === 'string') def.info = s.info;
    if (typeof s.min === 'number') def.min = s.min;
    if (typeof s.max === 'number') def.max = s.max;
    if (typeof s.step === 'number') def.step = s.step;

    if (Array.isArray(s.options)) {
      def.options = (s.options as Record<string, unknown>[])
        .filter(
          (o) =>
            typeof o.value === 'string' && typeof o.label === 'string',
        )
        .map((o) => ({
          value: o.value as string,
          label: o.label as string,
        }));
    }

    results.push(def);
  }

  return results;
}
