import type { LiquidNode } from './parser';

export type LiquidNodeVisitor = (node: LiquidNode) => void;

export function walkLiquidAst(nodes: LiquidNode[], visitor: LiquidNodeVisitor) {
  for (const node of nodes) {
    visitor(node);
  }
}
