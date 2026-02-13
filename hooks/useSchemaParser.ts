'use client';

/**
 * useSchemaParser — parses {% schema %} blocks from Liquid files
 * and exposes structured settings/blocks data with mutation methods.
 *
 * EPIC 11: Foundation hook for the Customizer Mode.
 */

import { useState, useCallback } from 'react';

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

const SCHEMA_RE = /\{%[-\s]*schema\s*%\}([\s\S]*?)\{%[-\s]*endschema\s*%\}/;

function parseSchemaFromContent(content: string): ParsedSchema | null {
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

function serializeSchema(schema: ParsedSchema): string {
  const obj: Record<string, unknown> = {
    ...schema.raw,
    name: schema.name,
    settings: schema.settings,
    blocks: schema.blocks,
    presets: schema.presets,
  };
  if (schema.tag) obj.tag = schema.tag;
  if (schema.class) obj.class = schema.class;
  if (schema.limit != null) obj.limit = schema.limit;
  if (schema.templates) obj.templates = schema.templates;

  return JSON.stringify(obj, null, 2);
}

// ── Hook ──────────────────────────────────────────────────────────────

export interface UseSchemaParserResult {
  schema: ParsedSchema | null;
  parseError: string | null;

  /** Re-parse from a new Liquid content string */
  parse: (content: string) => void;

  /** Update a setting's value in the parsed schema */
  updateSetting: (settingId: string, value: unknown) => void;

  /** Update a block setting */
  updateBlockSetting: (blockIndex: number, settingId: string, value: unknown) => void;

  /** Add a new setting to the schema */
  addSetting: (setting: SchemaSetting) => void;

  /** Remove a setting by ID */
  removeSetting: (settingId: string) => void;

  /** Add a new block type */
  addBlock: (block: SchemaBlock) => void;

  /** Remove a block type */
  removeBlock: (blockType: string) => void;

  /** Get the serialized schema JSON for embedding back into Liquid */
  getSerializedSchema: () => string | null;

  /** Current setting values (for customizer form state) */
  settingValues: Record<string, unknown>;

  /** Set a value for a setting (form state, not schema mutation) */
  setSettingValue: (id: string, value: unknown) => void;

  /** Block instance state for customizer */
  blockInstances: Array<{ id: string; type: string; settings: Record<string, unknown> }>;

  /** Add a block instance */
  addBlockInstance: (type: string) => void;

  /** Remove a block instance */
  removeBlockInstance: (instanceId: string) => void;

  /** Reorder block instances */
  reorderBlockInstances: (fromIndex: number, toIndex: number) => void;
}

export function useSchemaParser(initialContent?: string): UseSchemaParserResult {
  const [schema, setSchema] = useState<ParsedSchema | null>(
    initialContent ? parseSchemaFromContent(initialContent) : null
  );
  const [parseError, setParseError] = useState<string | null>(null);
  const [settingValues, setSettingValues] = useState<Record<string, unknown>>({});
  const [blockInstances, setBlockInstances] = useState<
    Array<{ id: string; type: string; settings: Record<string, unknown> }>
  >([]);

  const parse = useCallback((content: string) => {
    try {
      const parsed = parseSchemaFromContent(content);
      if (!parsed) {
        setParseError('No {% schema %} block found');
        setSchema(null);
        return;
      }
      setSchema(parsed);
      setParseError(null);

      // Initialize setting values from defaults
      const defaults: Record<string, unknown> = {};
      for (const s of parsed.settings) {
        if (s.default !== undefined) {
          defaults[s.id] = s.default;
        }
      }
      setSettingValues(defaults);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Parse error');
      setSchema(null);
    }
  }, []);

  const updateSetting = useCallback((settingId: string, value: unknown) => {
    setSchema((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        settings: prev.settings.map((s) =>
          s.id === settingId ? { ...s, default: value } : s
        ),
      } as ParsedSchema;
    });
  }, []);

  const updateBlockSetting = useCallback(
    (blockIndex: number, settingId: string, value: unknown) => {
      setSchema((prev) => {
        if (!prev) return prev;
        const blocks = [...prev.blocks];
        if (blocks[blockIndex]) {
          blocks[blockIndex] = {
            ...blocks[blockIndex],
            settings: blocks[blockIndex].settings.map((s) =>
              s.id === settingId ? { ...s, default: value } : s
            ) as SchemaSetting[],
          };
        }
        return { ...prev, blocks } as ParsedSchema;
      });
    },
    []
  );

  const addSetting = useCallback((setting: SchemaSetting) => {
    setSchema((prev) => {
      if (!prev) return prev;
      return { ...prev, settings: [...prev.settings, setting] };
    });
  }, []);

  const removeSetting = useCallback((settingId: string) => {
    setSchema((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        settings: prev.settings.filter((s) => s.id !== settingId),
      };
    });
  }, []);

  const addBlock = useCallback((block: SchemaBlock) => {
    setSchema((prev) => {
      if (!prev) return prev;
      return { ...prev, blocks: [...prev.blocks, block] };
    });
  }, []);

  const removeBlock = useCallback((blockType: string) => {
    setSchema((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        blocks: prev.blocks.filter((b) => b.type !== blockType),
      };
    });
  }, []);

  const getSerializedSchema = useCallback(() => {
    if (!schema) return null;
    return serializeSchema(schema);
  }, [schema]);

  const setSettingValue = useCallback((id: string, value: unknown) => {
    setSettingValues((prev) => ({ ...prev, [id]: value }));
  }, []);

  const addBlockInstance = useCallback((type: string) => {
    setBlockInstances((prev) => [
      ...prev,
      { id: `block-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, type, settings: {} },
    ]);
  }, []);

  const removeBlockInstance = useCallback((instanceId: string) => {
    setBlockInstances((prev) => prev.filter((b) => b.id !== instanceId));
  }, []);

  const reorderBlockInstances = useCallback((fromIndex: number, toIndex: number) => {
    setBlockInstances((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  return {
    schema,
    parseError,
    parse,
    updateSetting,
    updateBlockSetting,
    addSetting,
    removeSetting,
    addBlock,
    removeBlock,
    getSerializedSchema,
    settingValues,
    setSettingValue,
    blockInstances,
    addBlockInstance,
    removeBlockInstance,
    reorderBlockInstances,
  };
}
