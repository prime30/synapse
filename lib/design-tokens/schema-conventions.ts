/**
 * Phase 10d: Section schema conventions analyzer.
 * Parses {% schema %} blocks across sections to track common setting IDs and block types.
 */

const SCHEMA_BLOCK = /\{%[-]?\s*schema\s*[-]?%\}([\s\S]*?)\{%[-]?\s*endschema\s*[-]?%\}/gi;

export interface SchemaConventions {
  /** Common setting IDs with their types (e.g. heading: text, color_scheme: select) */
  settingIds: Record<string, string>;
  /** Standard block types (e.g. text, image, button, collapsible_row) */
  blockTypes: string[];
}

/**
 * Analyze {% schema %} blocks across section files.
 * Aggregates setting IDs and block types into conventions.
 */
export function analyzeSchemaConventions(
  files: { path: string; content: string }[],
): SchemaConventions {
  const settingCounts = new Map<string, Map<string, number>>();
  const blockTypeCounts = new Map<string, number>();

  for (const file of files) {
    if (!file.path.includes('sections/') || !file.path.endsWith('.liquid')) continue;

    const re = new RegExp(SCHEMA_BLOCK.source, SCHEMA_BLOCK.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(file.content)) !== null) {
      try {
        const schema = JSON.parse(m[1]) as {
          settings?: Array<{ type?: string; id?: string }>;
          blocks?: Array<{ type?: string }>;
        };

        if (Array.isArray(schema.settings)) {
          for (const s of schema.settings) {
            if (s.id && s.type) {
              if (!settingCounts.has(s.id)) settingCounts.set(s.id, new Map());
              const typeMap = settingCounts.get(s.id)!;
              typeMap.set(s.type, (typeMap.get(s.type) ?? 0) + 1);
            }
          }
        }

        if (Array.isArray(schema.blocks)) {
          for (const b of schema.blocks) {
            if (b.type) {
              blockTypeCounts.set(b.type, (blockTypeCounts.get(b.type) ?? 0) + 1);
            }
          }
        }
      } catch {
        // Invalid JSON — skip
      }
    }
  }

  const settingIds: Record<string, string> = {};
  for (const [id, typeMap] of settingCounts) {
    let bestType = '';
    let bestCount = 0;
    for (const [t, c] of typeMap) {
      if (c > bestCount) {
        bestCount = c;
        bestType = t;
      }
    }
    if (bestType) settingIds[id] = bestType;
  }

  const blockTypes = [...blockTypeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t);

  return { settingIds, blockTypes };
}
