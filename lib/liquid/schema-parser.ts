/**
 * Parses {% schema %} blocks from Liquid files into structured JSON.
 * Used by useSchemaParser and other schema-aware features.
 */

const SCHEMA_RE = /\{%[-\s]*schema\s*%\}([\s\S]*?)\{%[-\s]*endschema\s*%\}/;

// ── Schema types ──────────────────────────────────────────────────────

export interface SchemaSettingBase {
  type: string;
  id: string;
  label: string;
  default?: unknown;
  info?: string;
  placeholder?: string;
}

export interface SchemaSettingText extends SchemaSettingBase {
  type: 'text' | 'textarea' | 'richtext' | 'html' | 'liquid' | 'url';
}

export interface SchemaSettingNumber extends SchemaSettingBase {
  type: 'number' | 'range';
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

export interface SchemaSettingSelect extends SchemaSettingBase {
  type: 'select' | 'radio';
  options: Array<{ value: string; label: string; group?: string }>;
}

export interface SchemaSettingCheckbox extends SchemaSettingBase {
  type: 'checkbox';
  default?: boolean;
}

export interface SchemaSettingColor extends SchemaSettingBase {
  type: 'color' | 'color_background';
}

export interface SchemaSettingImage extends SchemaSettingBase {
  type: 'image_picker';
}

export interface SchemaSettingVideo extends SchemaSettingBase {
  type: 'video_url';
  accept?: string[];
}

export interface SchemaSettingFont extends SchemaSettingBase {
  type: 'font_picker';
}

export interface SchemaSettingResource extends SchemaSettingBase {
  type: 'collection' | 'product' | 'article' | 'blog' | 'page' | 'link_list';
}

export type SchemaSetting =
  | SchemaSettingText
  | SchemaSettingNumber
  | SchemaSettingSelect
  | SchemaSettingCheckbox
  | SchemaSettingColor
  | SchemaSettingImage
  | SchemaSettingVideo
  | SchemaSettingFont
  | SchemaSettingResource;

export interface SchemaBlock {
  type: string;
  name: string;
  limit?: number;
  settings: SchemaSetting[];
}

export interface SchemaPreset {
  name: string;
  settings?: Record<string, unknown>;
  blocks?: Array<{ type: string; settings?: Record<string, unknown> }>;
}

export interface ParsedSchema {
  name: string;
  tag?: string;
  class?: string;
  limit?: number;
  settings: SchemaSetting[];
  blocks: SchemaBlock[];
  presets: SchemaPreset[];
  templates?: string[];
  /** Raw JSON for editing */
  raw: Record<string, unknown>;
}

// ── Parser ────────────────────────────────────────────────────────────

/**
 * Extracts and parses the {% schema %} block from Liquid file content.
 * Returns structured schema data or null if no valid block is found.
 */
export function parseSchemaFromContent(content: string): ParsedSchema | null {
  const match = SCHEMA_RE.exec(content);
  if (!match) return null;

  try {
    const raw = JSON.parse(match[1]) as Record<string, unknown>;

    return {
      name: (raw.name as string) ?? 'Untitled',
      tag: raw.tag as string | undefined,
      class: raw.class as string | undefined,
      limit: raw.limit as number | undefined,
      settings: (raw.settings as SchemaSetting[]) ?? [],
      blocks: (raw.blocks as SchemaBlock[]) ?? [],
      presets: (raw.presets as SchemaPreset[]) ?? [],
      templates: raw.templates as string[] | undefined,
      raw,
    };
  } catch {
    return null;
  }
}
