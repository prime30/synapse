/**
 * Schema planner utility.
 * Analyzes Liquid files to detect setting references and generates
 * schema stubs with sensible type defaults.
 */

export interface SchemaAnalysis {
  /** Setting IDs referenced via section.settings.X */
  sectionSettings: string[];
  /** Block type → setting IDs referenced via block.settings.X */
  blockSettings: Map<string, string[]>;
  /** Whether the file already contains a {% schema %} tag */
  hasSchema: boolean;
  /** Parsed JSON from the existing {% schema %} block, if present */
  existingSchemaJson?: unknown;
}

const SECTION_SETTING_RE = /section\.settings\.(\w+)/g;
const BLOCK_SETTING_RE = /block\.settings\.(\w+)/g;
const SCHEMA_BLOCK_RE = /\{%[-\s]*schema\s*[-]?%\}([\s\S]*?)\{%[-\s]*endschema\s*[-]?%\}/;

/**
 * Infer the best Shopify schema setting type from a setting ID.
 * Uses naming convention heuristics matching the Schema Agent's inference rules.
 */
export function inferSettingType(id: string): string {
  const lower = id.toLowerCase();

  if (/(?:_color|colour)$/.test(lower) || lower === 'color') return 'color';
  if (/^(?:show_|enable_|hide_|has_|is_)/.test(lower)) return 'checkbox';
  if (/(?:image|logo|icon|banner|background_image|avatar|thumbnail)/.test(lower)) return 'image_picker';
  if (/(?:video_url|video)/.test(lower)) return 'video_url';
  if (/(?:url|link|href)/.test(lower)) return 'url';
  if (/(?:font)/.test(lower)) return 'font_picker';
  if (/(?:html|custom_code|custom_html)/.test(lower)) return 'html';
  if (/(?:description|content|body|subtext|subtitle)/.test(lower)) return 'richtext';
  if (/(?:heading|title|label|button_text|button_label|name)/.test(lower)) return 'text';
  if (/^product$/.test(lower)) return 'product';
  if (/^collection$/.test(lower)) return 'collection';
  if (/(?:columns|count|per_row|limit|spacing|padding|margin|opacity|speed|delay|width|height|radius)/.test(lower)) return 'range';
  if (/(?:style|layout|alignment|position|size|ratio|type)/.test(lower)) return 'select';
  if (/(?:text|message|placeholder|caption)/.test(lower)) return 'textarea';

  return 'text';
}

/**
 * Convert a setting ID like "heading_text" to a merchant-friendly label:
 * "Heading text"
 */
function toLabel(id: string): string {
  return id
    .replace(/_/g, ' ')
    .replace(/\b\w/, (c) => c.toUpperCase());
}

/**
 * Return a sensible default value for a given schema setting type.
 */
function defaultForType(type: string, id: string): unknown {
  switch (type) {
    case 'checkbox': return !id.startsWith('hide_');
    case 'color': return 'oklch(0 0 0)';
    case 'range': return 4;
    case 'number': return 0;
    case 'text': return '';
    case 'textarea': return '';
    case 'richtext': return '<p></p>';
    case 'html': return '';
    case 'url': return '';
    case 'image_picker': return undefined;
    case 'video_url': return undefined;
    case 'font_picker': return 'assistant_n4';
    case 'product': return undefined;
    case 'collection': return undefined;
    case 'select': return undefined;
    default: return '';
  }
}

/**
 * Build a range setting config with reasonable min/max/step heuristics.
 */
function rangeConfig(id: string): { min: number; max: number; step: number; unit?: string } {
  const lower = id.toLowerCase();
  if (/opacity/.test(lower)) return { min: 0, max: 100, step: 5, unit: '%' };
  if (/speed|delay/.test(lower)) return { min: 1, max: 20, step: 1, unit: 's' };
  if (/spacing|padding|margin/.test(lower)) return { min: 0, max: 100, step: 4, unit: 'px' };
  if (/columns|per_row/.test(lower)) return { min: 1, max: 6, step: 1 };
  if (/radius/.test(lower)) return { min: 0, max: 40, step: 2, unit: 'px' };
  if (/(?:width|height)/.test(lower)) return { min: 0, max: 1200, step: 10, unit: 'px' };
  if (/count|limit/.test(lower)) return { min: 1, max: 50, step: 1 };
  return { min: 0, max: 100, step: 1 };
}

/**
 * Build a single schema setting object from an inferred type and setting ID.
 */
function buildSetting(id: string): Record<string, unknown> {
  const type = inferSettingType(id);
  const setting: Record<string, unknown> = {
    type,
    id,
    label: toLabel(id),
  };

  if (type === 'range') {
    const cfg = rangeConfig(id);
    Object.assign(setting, cfg);
    setting.default = cfg.min + Math.floor((cfg.max - cfg.min) / 2);
  } else if (type === 'select') {
    setting.options = [
      { value: 'default', label: 'Default' },
    ];
    setting.default = 'default';
  } else if (type === 'video_url') {
    setting.accepts = ['youtube', 'vimeo'];
  } else {
    const def = defaultForType(type, id);
    if (def !== undefined) {
      setting.default = def;
    }
  }

  return setting;
}

/**
 * Scan Liquid content for section.settings.X and block.settings.X references.
 * Returns a structured analysis of what settings the schema needs to define.
 */
export function analyzeSchemaNeeds(content: string): SchemaAnalysis {
  const sectionSettingsSet = new Set<string>();
  const blockSettingsSet = new Set<string>();

  let match: RegExpExecArray | null;

  const sectionRe = new RegExp(SECTION_SETTING_RE.source, 'g');
  while ((match = sectionRe.exec(content)) !== null) {
    sectionSettingsSet.add(match[1]);
  }

  const blockRe = new RegExp(BLOCK_SETTING_RE.source, 'g');
  while ((match = blockRe.exec(content)) !== null) {
    blockSettingsSet.add(match[1]);
  }

  const schemaMatch = SCHEMA_BLOCK_RE.exec(content);
  let existingSchemaJson: unknown = undefined;
  if (schemaMatch) {
    try {
      existingSchemaJson = JSON.parse(schemaMatch[1].trim());
    } catch {
      /* malformed schema — leave as undefined */
    }
  }

  // Detect block types from {% when 'type' %} patterns inside block loops
  const blockTypes = new Map<string, string[]>();
  const whenRe = /\{%[-\s]*when\s+['"](\w+)['"]\s*[-]?%\}/g;
  const hasBlockLoop = /\{%[-\s]*for\s+block\s+in\s+section\.blocks/.test(content);

  if (hasBlockLoop) {
    const blockSettingsArr = Array.from(blockSettingsSet);
    while ((match = whenRe.exec(content)) !== null) {
      const blockType = match[1];
      if (!blockTypes.has(blockType)) {
        blockTypes.set(blockType, []);
      }
    }

    if (blockTypes.size > 0) {
      // Try to associate settings with block types by proximity in source
      // Fallback: all block settings go under each block type
      for (const [type] of blockTypes) {
        blockTypes.set(type, blockSettingsArr);
      }
    } else {
      // No {% when %} blocks found — generic block
      if (blockSettingsArr.length > 0) {
        blockTypes.set('item', blockSettingsArr);
      }
    }
  } else if (blockSettingsSet.size > 0) {
    blockTypes.set('item', Array.from(blockSettingsSet));
  }

  return {
    sectionSettings: Array.from(sectionSettingsSet),
    blockSettings: blockTypes,
    hasSchema: !!schemaMatch,
    existingSchemaJson,
  };
}

/**
 * Generate a complete {% schema %} block from an analysis result.
 * Produces settings with inferred types and sensible defaults.
 */
export function generateSchemaStub(
  analysis: SchemaAnalysis,
  sectionName: string,
): string {
  const schema: Record<string, unknown> = {
    name: sectionName,
  };

  // Build section-level settings
  const settings: Record<string, unknown>[] = analysis.sectionSettings.map(
    (id) => buildSetting(id)
  );

  // Append standard motion controls
  settings.push(
    {
      type: 'checkbox',
      id: 'enable_animations',
      label: 'Enable animations',
      default: true,
    },
    {
      type: 'select',
      id: 'animation_style',
      label: 'Animation style',
      options: [
        { value: 'fade', label: 'Fade in' },
        { value: 'slide', label: 'Slide up' },
        { value: 'scale', label: 'Scale in' },
      ],
      default: 'fade',
    },
  );

  schema.settings = settings;

  // Build blocks
  if (analysis.blockSettings.size > 0) {
    const blocks: Record<string, unknown>[] = [];
    for (const [type, settingIds] of analysis.blockSettings) {
      blocks.push({
        type,
        name: toLabel(type),
        settings: settingIds.map((id) => buildSetting(id)),
      });
    }
    schema.blocks = blocks;
    schema.max_blocks = 16;
  }

  // Presets
  schema.presets = [
    {
      name: sectionName,
    },
  ];

  const json = JSON.stringify(schema, null, 2);
  return `{% schema %}\n${json}\n{% endschema %}`;
}
