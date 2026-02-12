import type { languages } from 'monaco-editor';
import schema from '@/lib/liquid/shopify-schema.json';

interface SchemaObject {
  properties?: Record<string, string>;
}

interface ShopifySchema {
  objects: Record<string, SchemaObject>;
  global_objects: string[];
}

const shopifySchema = schema as ShopifySchema;

/** Resolve a type string to the element type (e.g. array<variant> -> variant). */
function resolveElementType(typeStr: string): string | null {
  const arrayMatch = typeStr.match(/^array<(.+)>$/);
  if (arrayMatch) return arrayMatch[1].trim();
  return typeStr;
}

/** Get the properties of a type from the schema. */
function getPropertiesForType(typeName: string): Record<string, string> | null {
  const obj = shopifySchema.objects[typeName];
  return obj?.properties ?? null;
}

/** Resolve a single property access: objType.propertyName -> property type. */
function resolveProperty(objType: string, propName: string): string | null {
  const props = getPropertiesForType(objType);
  if (!props) return null;
  const propType = props[propName];
  return propType ?? null;
}

/** Parse schema block to extract setting IDs for section.settings and block.settings. */
function parseSchemaSettings(text: string): {
  sectionSettings: string[];
  blockSettingsByType: Record<string, string[]>;
} {
  const sectionSettings: string[] = [];
  const blockSettingsByType: Record<string, string[]> = {};

  const schemaStart = text.indexOf('{% schema %}');
  const schemaEnd = text.indexOf('{% endschema %}');
  if (schemaStart === -1 || schemaEnd === -1 || schemaEnd <= schemaStart) {
    return { sectionSettings, blockSettingsByType };
  }

  const jsonStr = text.slice(schemaStart + '{% schema %}'.length, schemaEnd).trim();
  let schemaObj: Record<string, unknown>;
  try {
    schemaObj = JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    return { sectionSettings, blockSettingsByType };
  }

  const settingsArr = schemaObj.settings as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(settingsArr)) {
    for (const s of settingsArr) {
      const id = s.id as string | undefined;
      if (id) sectionSettings.push(id);
    }
  }

  const blocksArr = schemaObj.blocks as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(blocksArr)) {
    for (const b of blocksArr) {
      const type = (b.type as string) ?? 'unknown';
      const blockSettings = (b.settings as Array<Record<string, unknown>>) ?? [];
      blockSettingsByType[type] = blockSettings
        .map((s) => s.id as string | undefined)
        .filter((id): id is string => !!id);
    }
  }

  return { sectionSettings, blockSettingsByType };
}

/** Parse {% assign VAR = EXPR %} from full text. Returns map of var name -> inferred type. */
function parseAssigns(text: string): Map<string, string> {
  const assigns = new Map<string, string>();
  const assignRe = /\{%[- ]*assign[- ]+(\w+)[- ]*=[- ]*(.+?)[- ]*%\}/g;
  let m: RegExpExecArray | null;
  while ((m = assignRe.exec(text)) !== null) {
    const varName = m[1];
    const expr = m[2].trim();
    const type = inferAssignType(expr);
    assigns.set(varName, type);
  }
  return assigns;
}

/** Infer type from a Liquid expression string (RHS of assign). */
function inferAssignType(expr: string): string {
  // Remove filters: "x | default: 1" -> "x"
  const pipeIdx = expr.indexOf('|');
  const baseExpr = pipeIdx >= 0 ? expr.slice(0, pipeIdx).trim() : expr;

  // Handle dot chains
  const parts = baseExpr.split(/\./).map((p) => p.trim());
  if (parts.length >= 1 && parts[0]) {
    const resolved = resolveChainFromRoot(parts[0], parts.slice(1));
    if (resolved) return resolved;
  }

  return 'any';
}

/** Resolve chain from root (which may be global object or already resolved). */
function resolveChainFromRoot(root: string, rest: string[]): string | null {
  let currentType: string | null = null;

  if (shopifySchema.global_objects.includes(root)) {
    currentType = root;
  } else {
    return null;
  }

  for (const seg of rest) {
    if (!currentType) return null;
    if (seg === 'first' || seg === 'last' || /^\d+$/.test(seg)) {
      const elemType = resolveElementType(currentType);
      currentType = elemType ?? 'any';
      continue;
    }
    const propType = resolveProperty(currentType, seg);
    if (!propType) {
      if (currentType === 'collections' || root === 'collections') return 'collection';
      if (currentType === 'linklists' || root === 'linklists') return 'linklist';
      if (currentType === 'pages' || root === 'pages') return 'page';
      if (currentType === 'blogs' || root === 'blogs') return 'blog';
      return null;
    }
    currentType = propType;
  }

  return currentType;
}

/** Resolve full chain including first segment as variable from assigns. */
function resolveChainWithAssigns(
  chain: string[],
  assigns: Map<string, string>
): string | null {
  if (chain.length === 0) return null;
  const first = chain[0];
  let currentType: string | null = null;

  if (shopifySchema.global_objects.includes(first)) {
    currentType = first;
  } else {
    const assignedType = assigns.get(first);
    if (assignedType) currentType = assignedType;
    else return null;
  }

  for (let i = 1; i < chain.length; i++) {
    const seg = chain[i];
    if (!currentType) return null;

    if (seg === 'first' || seg === 'last' || /^\d+$/.test(seg)) {
      const elemType = resolveElementType(currentType);
      currentType = elemType ?? 'any';
      continue;
    }

    const propType = resolveProperty(currentType, seg);
    if (!propType) {
      if ((currentType === 'collections' || first === 'collections') && i === 1)
        currentType = 'collection';
      else if ((currentType === 'linklists' || first === 'linklists') && i === 1)
        currentType = 'linklist';
      else if ((currentType === 'pages' || first === 'pages') && i === 1)
        currentType = 'page';
      else if ((currentType === 'blogs' || first === 'blogs') && i === 1)
        currentType = 'blog';
      else return null;
    } else {
      currentType = propType;
    }
  }

  return currentType;
}

/** Detect if we're in {{ }} or {% %} and extract the expression before cursor. */
function getLiquidContext(
  text: string,
  offset: number
): { kind: 'output' | 'tag'; expr: string; afterDot: boolean } | null {
  const before = text.slice(0, offset);

  const outputStart = before.lastIndexOf('{{');
  const tagStart = before.lastIndexOf('{%');
  const inOutput = outputStart >= 0 && (tagStart < 0 || outputStart > tagStart);
  const inTag = tagStart >= 0 && (outputStart < 0 || tagStart > outputStart);

  if (inOutput) {
    const content = before.slice(outputStart + 2);
    const trimmed = content.trimEnd();
    const afterDot = trimmed.endsWith('.');
    const expr = (afterDot ? trimmed.slice(0, -1) : trimmed).trim();
    return { kind: 'output', expr, afterDot };
  }

  if (inTag) {
    const content = before.slice(tagStart + 2);
    const trimmed = content.trimEnd();
    const afterDot = trimmed.endsWith('.');
    const expr = (afterDot ? trimmed.slice(0, -1) : trimmed).trim();
    return { kind: 'tag', expr, afterDot };
  }

  return null;
}

/** Split expression into dot chain parts. */
function parseDotChain(expr: string): string[] {
  return expr
    .split(/\./)
    .map((p) => p.trim())
    .filter(Boolean);
}

/**
 * Creates a Monaco CompletionItemProvider for Liquid templates.
 * Provides object-aware completions from Shopify schema, type-through-assign,
 * and schema setting completions.
 */
export function createLiquidCompletionProvider(
  monaco: typeof import('monaco-editor')
): languages.CompletionItemProvider {
  return {
    triggerCharacters: ['.'],

    async provideCompletionItems(model, position) {
      const text = model.getValue();
      const offset = model.getOffsetAt(position);

      const ctx = getLiquidContext(text, offset);
      if (!ctx) return { suggestions: [] };

      const assigns = parseAssigns(text);
      const { sectionSettings, blockSettingsByType } = parseSchemaSettings(text);

      const suggestions: languages.CompletionItem[] = [];

      if (ctx.afterDot) {
        const chain = parseDotChain(ctx.expr);
        if (chain.length === 0) return { suggestions: [] };

        // section.settings. -> offer setting IDs
        if (
          chain.length >= 2 &&
          (chain[0] === 'section' && chain[1] === 'settings')
        ) {
          for (const id of sectionSettings) {
            suggestions.push({
              label: id,
              kind: monaco.languages.CompletionItemKind.Value,
              insertText: id,
            });
          }
          return { suggestions };
        }

        // block.settings. -> offer setting IDs from all blocks
        if (
          chain.length >= 2 &&
          chain[0] === 'block' &&
          chain[1] === 'settings'
        ) {
          const allBlockSettings = new Set<string>();
          for (const ids of Object.values(blockSettingsByType)) {
            ids.forEach((id) => allBlockSettings.add(id));
          }
          for (const id of allBlockSettings) {
            suggestions.push({
              label: id,
              kind: monaco.languages.CompletionItemKind.Value,
              insertText: id,
            });
          }
          return { suggestions };
        }

        // Resolve chain to get properties
        const resolvedType = resolveChainWithAssigns(chain, assigns);
        if (resolvedType) {
          const props = getPropertiesForType(resolvedType);
          if (props) {
            for (const [propName] of Object.entries(props)) {
              suggestions.push({
                label: propName,
                kind: monaco.languages.CompletionItemKind.Property,
                insertText: propName,
                detail: `(${resolvedType})`,
              });
            }
          }
        }

        return { suggestions };
      }

      // No dot: offer global objects and assigned variables (inside {{ }})
      if (ctx.kind === 'output' && !ctx.afterDot) {
        for (const name of shopifySchema.global_objects) {
          suggestions.push({
            label: name,
            kind: monaco.languages.CompletionItemKind.Variable,
            insertText: name,
          });
        }
        for (const [varName] of assigns) {
          suggestions.push({
            label: varName,
            kind: monaco.languages.CompletionItemKind.Variable,
            insertText: varName,
          });
        }
      }

      return { suggestions };
    },
  };
}
