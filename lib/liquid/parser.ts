export type LiquidNodeType = 'text' | 'tag' | 'output';

export interface LiquidNode {
  type: LiquidNodeType;
  value: string;
  start: number;
  end: number;
}

/**
 * Simple Liquid parser that extracts tag/output blocks and text segments.
 * This is a lightweight parser for diagnostics and tooling hooks.
 */
export function parseLiquid(template: string): LiquidNode[] {
  const nodes: LiquidNode[] = [];
  const regex = /(\{%-?[\s\S]*?-?%\}|\{\{-?[\s\S]*?-?\}\})/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(template)) !== null) {
    if (match.index > lastIndex) {
      nodes.push({
        type: 'text',
        value: template.slice(lastIndex, match.index),
        start: lastIndex,
        end: match.index,
      });
    }

    const raw = match[0];
    const type = raw.startsWith('{{') ? 'output' : 'tag';
    nodes.push({
      type,
      value: raw,
      start: match.index,
      end: match.index + raw.length,
    });

    lastIndex = match.index + raw.length;
  }

  if (lastIndex < template.length) {
    nodes.push({
      type: 'text',
      value: template.slice(lastIndex),
      start: lastIndex,
      end: template.length,
    });
  }

  return nodes;
}
