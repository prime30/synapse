import { describe, it, expect } from 'vitest';
import type { DataFlowGraph, DataFlowNode, DataFlowEdge } from '../flow-analyzer';
import {
  buildFlowPaths,
  editorToPixel,
  computeBezier,
  getVisiblePaths,
  getPathsAtPosition,
  DEFAULT_FLOW_CONFIG,
} from '../flow-graph-builder';
import type { FlowGraphConfig } from '../flow-graph-builder';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeLoc(line: number, column: number, length = 10) {
  return { line, column, offset: 0, length };
}

function makeNode(overrides: Partial<DataFlowNode> & { id: string }): DataFlowNode {
  return {
    kind: 'assignment',
    variableName: 'x',
    loc: makeLoc(1, 1),
    expressionText: 'x = 1',
    filters: [],
    dataType: 'unknown',
    ...overrides,
  };
}

function makeEdge(from: string, to: string, kind: DataFlowEdge['kind'] = 'data_dependency'): DataFlowEdge {
  return { id: `e-${from}-${to}`, from, to, kind };
}

function makeGraph(
  nodes: DataFlowNode[],
  edges: DataFlowEdge[],
  defs?: Map<string, string[]>,
  usages?: Map<string, string[]>,
): DataFlowGraph {
  const variableDefinitions = defs ?? new Map();
  const variableUsages = usages ?? new Map();
  return { nodes, edges, variableDefinitions, variableUsages };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('editorToPixel', () => {
  it('converts line 1 column 1 to gutter + half lineHeight', () => {
    const cfg = { ...DEFAULT_FLOW_CONFIG };
    const { x, y } = editorToPixel(1, 1, cfg);
    expect(x).toBe(cfg.gutterWidth); // (1-1)*charWidth = 0
    expect(y).toBe(cfg.lineHeight / 2); // (1-1)*lineHeight + lineHeight/2
  });

  it('applies scroll offsets', () => {
    const cfg: FlowGraphConfig = { ...DEFAULT_FLOW_CONFIG, scrollTop: 100, scrollLeft: 50 };
    const { x, y } = editorToPixel(1, 1, cfg);
    expect(x).toBe(cfg.gutterWidth - 50);
    expect(y).toBe(cfg.lineHeight / 2 - 100);
  });

  it('scales with line and column', () => {
    const cfg = { ...DEFAULT_FLOW_CONFIG };
    const { x, y } = editorToPixel(5, 10, cfg);
    expect(x).toBeCloseTo(cfg.gutterWidth + 9 * cfg.charWidth);
    expect(y).toBeCloseTo(4 * cfg.lineHeight + cfg.lineHeight / 2);
  });
});

describe('computeBezier', () => {
  it('returns start and end matching inputs', () => {
    const start = { x: 10, y: 20 };
    const end = { x: 200, y: 400 };
    const curve = computeBezier(start, end);
    expect(curve.start).toEqual(start);
    expect(curve.end).toEqual(end);
  });

  it('places control points at vertical midpoint for diagonal paths', () => {
    const start = { x: 50, y: 0 };
    const end = { x: 200, y: 100 };
    const curve = computeBezier(start, end);
    const midY = 50;
    expect(curve.cp1.y).toBe(midY);
    expect(curve.cp2.y).toBe(midY);
  });

  it('adds horizontal bow for near-vertical paths', () => {
    const start = { x: 100, y: 0 };
    const end = { x: 105, y: 200 };
    const curve = computeBezier(start, end);
    // Near-vertical: dx < 20, so horizontal bow > 0
    expect(curve.cp1.x).toBeGreaterThan(start.x);
    expect(curve.cp2.x).toBeGreaterThan(end.x);
  });

  it('produces deterministic output', () => {
    const start = { x: 30, y: 40 };
    const end = { x: 150, y: 300 };
    const a = computeBezier(start, end);
    const b = computeBezier(start, end);
    expect(a).toEqual(b);
  });
});

describe('buildFlowPaths', () => {
  it('returns empty array for empty graph', () => {
    const graph = makeGraph([], []);
    expect(buildFlowPaths(graph)).toEqual([]);
  });

  it('returns empty array when no variable definitions exist', () => {
    const n = makeNode({ id: 'n1' });
    const graph = makeGraph([n], []);
    expect(buildFlowPaths(graph)).toEqual([]);
  });

  it('builds a path for a simple assignment -> output chain', () => {
    const n1 = makeNode({
      id: 'n1',
      kind: 'assignment',
      variableName: 'title',
      loc: makeLoc(1, 1, 20),
      expressionText: 'title = "Hello"',
      dataType: 'string',
    });
    const n2 = makeNode({
      id: 'n2',
      kind: 'output',
      variableName: 'title',
      loc: makeLoc(5, 3, 12),
      expressionText: '{{ title }}',
      dataType: 'string',
    });
    const edge = makeEdge('n1', 'n2');
    const defs = new Map([['title', ['n1']]]);
    const usages = new Map([['title', ['n2']]]);
    const graph = makeGraph([n1, n2], [edge], defs, usages);

    const paths = buildFlowPaths(graph);
    expect(paths).toHaveLength(1);

    const path = paths[0];
    expect(path.variableName).toBe('title');
    expect(path.dataType).toBe('string');
    expect(path.points).toHaveLength(2);
    expect(path.curves).toHaveLength(1);
    expect(path.active).toBe(false);
    expect(path.id).toMatch(/^flow-path-\d+$/);
  });

  it('assigns correct style from edge kind', () => {
    const n1 = makeNode({ id: 'n1', loc: makeLoc(1, 1) });
    const n2 = makeNode({ id: 'n2', loc: makeLoc(3, 1) });
    const edge = makeEdge('n1', 'n2', 'filter_chain');
    const defs = new Map([['x', ['n1']]]);
    const graph = makeGraph([n1, n2], [edge], defs);

    const paths = buildFlowPaths(graph);
    expect(paths).toHaveLength(1);
    expect(paths[0].style).toBe('filter');
  });

  it('accepts partial config overrides', () => {
    const n1 = makeNode({ id: 'n1', loc: makeLoc(1, 1) });
    const n2 = makeNode({ id: 'n2', loc: makeLoc(2, 1) });
    const edge = makeEdge('n1', 'n2');
    const defs = new Map([['x', ['n1']]]);
    const graph = makeGraph([n1, n2], [edge], defs);

    const pathsDefault = buildFlowPaths(graph);
    const pathsCustom = buildFlowPaths(graph, { lineHeight: 24 });

    // Curves should differ because lineHeight changed
    expect(pathsDefault[0].curves[0].end.y).not.toBe(pathsCustom[0].curves[0].end.y);
  });

  it('builds multiple paths for separate variable chains', () => {
    const n1 = makeNode({ id: 'n1', variableName: 'a', loc: makeLoc(1, 1, 5) });
    const n2 = makeNode({ id: 'n2', variableName: 'a', loc: makeLoc(3, 1, 5) });
    const n3 = makeNode({ id: 'n3', variableName: 'b', loc: makeLoc(2, 1, 5) });
    const n4 = makeNode({ id: 'n4', variableName: 'b', loc: makeLoc(4, 1, 5) });

    const e1 = makeEdge('n1', 'n2');
    const e2 = makeEdge('n3', 'n4');
    const defs = new Map([['a', ['n1']], ['b', ['n3']]]);
    const graph = makeGraph([n1, n2, n3, n4], [e1, e2], defs);

    const paths = buildFlowPaths(graph);
    expect(paths).toHaveLength(2);

    const names = paths.map((p) => p.variableName).sort();
    expect(names).toEqual(['a', 'b']);
  });
});

describe('getVisiblePaths', () => {
  it('returns only paths within viewport bounds', () => {
    const n1 = makeNode({ id: 'n1', loc: makeLoc(1, 1, 5) });
    const n2 = makeNode({ id: 'n2', loc: makeLoc(3, 1, 5) });
    const n3 = makeNode({ id: 'n3', loc: makeLoc(100, 1, 5) });
    const n4 = makeNode({ id: 'n4', loc: makeLoc(102, 1, 5) });

    const e1 = makeEdge('n1', 'n2');
    const e2 = makeEdge('n3', 'n4');
    const defs = new Map([['x', ['n1']], ['y', ['n3']]]);
    const graph = makeGraph([n1, n2, n3, n4], [e1, e2], defs);

    const cfg = { ...DEFAULT_FLOW_CONFIG };
    const paths = buildFlowPaths(graph, cfg);
    expect(paths).toHaveLength(2);

    // Viewport covers only lines 1-10 (roughly 0 to 190px)
    const visible = getVisiblePaths(paths, 0, 190, cfg);
    expect(visible).toHaveLength(1);
    expect(visible[0].variableName).toBe('x');
  });

  it('returns empty array when no paths are visible', () => {
    const n1 = makeNode({ id: 'n1', loc: makeLoc(50, 1, 5) });
    const n2 = makeNode({ id: 'n2', loc: makeLoc(52, 1, 5) });
    const e = makeEdge('n1', 'n2');
    const defs = new Map([['x', ['n1']]]);
    const graph = makeGraph([n1, n2], [e], defs);

    const cfg = { ...DEFAULT_FLOW_CONFIG };
    const paths = buildFlowPaths(graph, cfg);
    // Viewport at top of file (0-50px), path is around line 50 (~950px)
    const visible = getVisiblePaths(paths, 0, 50, cfg);
    expect(visible).toHaveLength(0);
  });
});

describe('getPathsAtPosition', () => {
  it('returns paths matching exact line', () => {
    const n1 = makeNode({ id: 'n1', variableName: 'x', loc: makeLoc(5, 3, 7) });
    const n2 = makeNode({ id: 'n2', variableName: 'x', loc: makeLoc(10, 3, 7) });
    const e = makeEdge('n1', 'n2');
    const defs = new Map([['x', ['n1']]]);
    const graph = makeGraph([n1, n2], [e], defs);

    const paths = buildFlowPaths(graph);
    const atLine5 = getPathsAtPosition(paths, 5, 3);
    expect(atLine5).toHaveLength(1);
  });

  it('matches within ±1 line tolerance', () => {
    const n1 = makeNode({ id: 'n1', variableName: 'x', loc: makeLoc(5, 3, 7) });
    const n2 = makeNode({ id: 'n2', variableName: 'x', loc: makeLoc(10, 3, 7) });
    const e = makeEdge('n1', 'n2');
    const defs = new Map([['x', ['n1']]]);
    const graph = makeGraph([n1, n2], [e], defs);

    const paths = buildFlowPaths(graph);

    // Line 6 is within ±1 of line 5
    const adjacent = getPathsAtPosition(paths, 6, 3);
    expect(adjacent).toHaveLength(1);

    // Line 7 is NOT within ±1 of any point (points are at 5 and 10)
    const far = getPathsAtPosition(paths, 7, 3);
    expect(far).toHaveLength(0);
  });

  it('considers column proximity (±10 columns)', () => {
    const n1 = makeNode({ id: 'n1', variableName: 'x', loc: makeLoc(5, 3, 7) });
    const n2 = makeNode({ id: 'n2', variableName: 'x', loc: makeLoc(10, 3, 7) });
    const e = makeEdge('n1', 'n2');
    const defs = new Map([['x', ['n1']]]);
    const graph = makeGraph([n1, n2], [e], defs);

    const paths = buildFlowPaths(graph);

    // Column 50 is far from column 3
    const farColumn = getPathsAtPosition(paths, 5, 50);
    expect(farColumn).toHaveLength(0);
  });

  it('returns empty array when no paths match', () => {
    expect(getPathsAtPosition([], 1, 1)).toEqual([]);
  });
});
