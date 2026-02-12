// ─────────────────────────────────────────────────────────────────────────────
// Liquid Flow Graph Builder
// Converts a DataFlowGraph into FlowPath[] with pixel-coordinate bezier curves
// suitable for rendering on an HTML5 Canvas behind a Monaco editor.
// ─────────────────────────────────────────────────────────────────────────────

import type { DataFlowGraph, DataFlowNode, DataFlowEdge } from './flow-analyzer';

// ── Types ────────────────────────────────────────────────────────────────────

/** A point in editor coordinate space (line/column map to Monaco line numbers). */
export interface FlowPoint {
  /** 1-based line number in the editor */
  line: number;
  /** 1-based column number */
  column: number;
  /** The data flow node at this point */
  nodeId: string;
  /** Display label for this point */
  label: string;
}

/** Bezier control points for smooth curve rendering. */
export interface BezierCurve {
  start: { x: number; y: number };
  cp1: { x: number; y: number };
  cp2: { x: number; y: number };
  end: { x: number; y: number };
}

/** Visual style hints for rendering. */
export type FlowPathStyle = 'assignment' | 'output' | 'filter' | 'control' | 'scope';

/** A complete flow path from source to destination. */
export interface FlowPath {
  id: string;
  /** Ordered list of points along this path */
  points: FlowPoint[];
  /** Pre-computed bezier curves between consecutive points */
  curves: BezierCurve[];
  /** Visual style hint */
  style: FlowPathStyle;
  /** The data type flowing through this path */
  dataType: DataFlowNode['dataType'];
  /** Whether this path is currently active (based on cursor position) */
  active: boolean;
  /** Source variable name */
  variableName: string;
}

/** Configuration for the graph builder. */
export interface FlowGraphConfig {
  /** Pixels per editor line (typically ~19px in Monaco) */
  lineHeight: number;
  /** Pixels per character width (typically ~7.6px in Monaco at 14px font) */
  charWidth: number;
  /** Left gutter offset in pixels (line numbers area) */
  gutterWidth: number;
  /** Top offset for scroll position */
  scrollTop: number;
  /** Left offset for scroll position */
  scrollLeft: number;
}

/** Default configuration matching standard Monaco editor metrics. */
export const DEFAULT_FLOW_CONFIG: FlowGraphConfig = {
  lineHeight: 19,
  charWidth: 7.6,
  gutterWidth: 64,
  scrollTop: 0,
  scrollLeft: 0,
};

// ── Coordinate Helpers ───────────────────────────────────────────────────────

/**
 * Convert editor coordinates (line, column) to pixel coordinates
 * relative to the editor's canvas.
 */
export function editorToPixel(
  line: number,
  column: number,
  config: FlowGraphConfig,
): { x: number; y: number } {
  return {
    x: config.gutterWidth + (column - 1) * config.charWidth - config.scrollLeft,
    y: (line - 1) * config.lineHeight - config.scrollTop + config.lineHeight / 2,
  };
}

/**
 * Compute bezier control points for a smooth curve between two points.
 * Uses a vertical offset to create gentle S-curves that avoid overlapping
 * with editor text.
 */
export function computeBezier(
  start: { x: number; y: number },
  end: { x: number; y: number },
): BezierCurve {
  const dy = end.y - start.y;
  const dx = end.x - start.x;

  // For near-vertical paths (same or similar column), offset horizontally
  // to create a visible S-curve. Otherwise use a vertical midpoint offset.
  const isNearVertical = Math.abs(dx) < 20;
  const horizontalBow = isNearVertical ? Math.min(40, Math.abs(dy) * 0.3) : 0;

  const midY = (start.y + end.y) / 2;

  return {
    start,
    cp1: { x: start.x + horizontalBow, y: midY },
    cp2: { x: end.x + horizontalBow, y: midY },
    end,
  };
}

// ── Internal Helpers ─────────────────────────────────────────────────────────

/** Map an edge kind to a visual style. */
function edgeKindToStyle(kind: DataFlowEdge['kind']): FlowPathStyle {
  switch (kind) {
    case 'data_dependency': return 'assignment';
    case 'filter_chain':    return 'filter';
    case 'control_flow':    return 'control';
    case 'scope_injection': return 'scope';
    default:                return 'assignment';
  }
}

/** Resolve a node by id from a lookup map. */
function resolveNode(
  nodeMap: Map<string, DataFlowNode>,
  id: string,
): DataFlowNode | undefined {
  return nodeMap.get(id);
}

/** Build an adjacency list (from -> to[]) from edges. */
function buildAdjacency(edges: DataFlowEdge[]): Map<string, DataFlowEdge[]> {
  const adj = new Map<string, DataFlowEdge[]>();
  for (const e of edges) {
    const list = adj.get(e.from);
    if (list) list.push(e);
    else adj.set(e.from, [e]);
  }
  return adj;
}

/** Create a FlowPoint from a DataFlowNode. */
function nodeToPoint(node: DataFlowNode): FlowPoint {
  return {
    line: node.loc.line,
    column: node.loc.column,
    nodeId: node.id,
    label: node.expressionText,
  };
}

/**
 * Walk the graph from a definition node, following outgoing edges to collect
 * an ordered chain of nodes (BFS by line order).
 */
function collectChain(
  startId: string,
  adj: Map<string, DataFlowEdge[]>,
  nodeMap: Map<string, DataFlowNode>,
  visited: Set<string>,
): { nodes: DataFlowNode[]; edges: DataFlowEdge[] } {
  const resultNodes: DataFlowNode[] = [];
  const resultEdges: DataFlowEdge[] = [];
  const queue = [startId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const node = resolveNode(nodeMap, current);
    if (node) resultNodes.push(node);

    const outEdges = adj.get(current) ?? [];
    for (const edge of outEdges) {
      if (!visited.has(edge.to)) {
        resultEdges.push(edge);
        queue.push(edge.to);
      }
    }
  }

  // Sort nodes by line number so paths flow top-to-bottom
  resultNodes.sort((a, b) => a.loc.line - b.loc.line);
  return { nodes: resultNodes, edges: resultEdges };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Build renderable flow paths from a data flow graph.
 * Each path represents a variable's journey from definition to usage.
 */
export function buildFlowPaths(
  graph: DataFlowGraph,
  config?: Partial<FlowGraphConfig>,
): FlowPath[] {
  if (!graph.nodes.length) return [];

  const cfg: FlowGraphConfig = { ...DEFAULT_FLOW_CONFIG, ...config };
  const nodeMap = new Map<string, DataFlowNode>();
  for (const n of graph.nodes) nodeMap.set(n.id, n);

  const adj = buildAdjacency(graph.edges);
  const visited = new Set<string>();
  const paths: FlowPath[] = [];
  let pathCounter = 0;

  // Walk each variable's definition chain
  for (const [varName, defIds] of graph.variableDefinitions) {
    for (const defId of defIds) {
      if (visited.has(defId)) continue;

      const chain = collectChain(defId, adj, nodeMap, visited);
      if (chain.nodes.length < 2) continue; // need at least 2 points for a path

      const points = chain.nodes.map(nodeToPoint);
      const dominantEdge = chain.edges[0];
      const style = dominantEdge ? edgeKindToStyle(dominantEdge.kind) : 'assignment';
      const rootNode = resolveNode(nodeMap, defId);

      // Compute bezier curves between consecutive points
      const curves: BezierCurve[] = [];
      for (let i = 0; i < points.length - 1; i++) {
        const startPx = editorToPixel(points[i].line, points[i].column, cfg);
        const endPx = editorToPixel(points[i + 1].line, points[i + 1].column, cfg);
        curves.push(computeBezier(startPx, endPx));
      }

      paths.push({
        id: `flow-path-${pathCounter++}`,
        points,
        curves,
        style,
        dataType: rootNode?.dataType ?? 'unknown',
        active: false,
        variableName: varName,
      });
    }
  }

  return paths;
}

/**
 * Get flow paths that are visible within a viewport range.
 * Used for off-screen culling to avoid rendering invisible paths.
 */
export function getVisiblePaths(
  paths: FlowPath[],
  viewportTop: number,
  viewportBottom: number,
  config: FlowGraphConfig,
): FlowPath[] {
  return paths.filter((path) =>
    path.points.some((point) => {
      const { y } = editorToPixel(point.line, point.column, config);
      return y >= viewportTop && y <= viewportBottom;
    }),
  );
}

/**
 * Find paths that pass through or near a given editor position.
 * Used for hover highlighting. Matches any path with a point within
 * ±1 line of the target position.
 */
export function getPathsAtPosition(
  paths: FlowPath[],
  line: number,
  column: number,
): FlowPath[] {
  return paths.filter((path) =>
    path.points.some(
      (point) => Math.abs(point.line - line) <= 1 && Math.abs(point.column - column) <= 10,
    ),
  );
}
