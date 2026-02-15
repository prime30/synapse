'use client';

/**
 * useSchemaParser — parses {% schema %} blocks from Liquid files
 * and exposes structured settings/blocks data with mutation methods.
 *
 * EPIC 11: Foundation hook for the Customizer Mode.
 */

import { useState, useCallback } from 'react';
import { parseSchemaFromContent } from '@/lib/liquid/schema-parser';
import type { ParsedSchema, SchemaSetting, SchemaBlock } from '@/lib/liquid/schema-parser';

export type { ParsedSchema, SchemaSetting, SchemaBlock, SchemaPreset } from '@/lib/liquid/schema-parser';

// ── Serializer ─────────────────────────────────────────────────────────

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
