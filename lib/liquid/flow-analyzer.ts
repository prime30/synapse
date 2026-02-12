// ─────────────────────────────────────────────────────────────────────────────
// Liquid Data Flow Analyzer
// Walks a Liquid AST to produce a DataFlowGraph tracking variable assignments,
// filter chains, and output references. Consumed by flow-graph-builder.ts.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  LiquidASTNode, Expression, FilterApplication,
  VariableLookup, SourceLocation,
} from './liquid-ast';
import { parseLiquidAST } from './liquid-ast';

// ── Data Flow Types ──────────────────────────────────────────────────────────

/** The kind of data flow node in the graph. */
export type DataFlowNodeKind =
  | 'assignment' | 'capture' | 'output' | 'filter'
  | 'for_variable' | 'render_param' | 'increment' | 'decrement';

/** A single node in the data flow graph. */
export interface DataFlowNode {
  id: string;
  kind: DataFlowNodeKind;
  variableName: string;
  /** Source location in the original template */
  loc: SourceLocation;
  /** The full expression text (for display) */
  expressionText: string;
  /** Filter chain applied to this node (if any) */
  filters: string[];
  /** Data type hint inferred from context */
  dataType: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'unknown';
}

/** An edge connecting two data flow nodes. */
export interface DataFlowEdge {
  id: string;
  from: string;
  to: string;
  kind: 'data_dependency' | 'filter_chain' | 'control_flow' | 'scope_injection';
}

/** The complete data flow graph for a Liquid template. */
export interface DataFlowGraph {
  nodes: DataFlowNode[];
  edges: DataFlowEdge[];
  /** Variables and where they are defined (variable name -> node ids) */
  variableDefinitions: Map<string, string[]>;
  /** Variables and where they are used (variable name -> node ids) */
  variableUsages: Map<string, string[]>;
}

// ── Filter type hints ────────────────────────────────────────────────────────

const NUM_F = new Set(['plus','minus','times','divided_by','modulo','floor','ceil','round','abs','at_least','at_most','size']);
const STR_F = new Set(['append','prepend','capitalize','downcase','upcase','strip','lstrip','rstrip','strip_html','strip_newlines','truncate','truncatewords','replace','replace_first','remove','remove_first','url_encode','url_decode','escape','escape_once','newline_to_br','money','money_with_currency','money_without_currency','date','img_tag','img_url','asset_url','link_to','json','handleize','handle','camelcase','sha256','md5','hmac_sha256','base64_encode','base64_decode']);
const ARR_F = new Set(['split','sort','sort_natural','reverse','compact','map','where','uniq','concat']);

// ── Internal walker ──────────────────────────────────────────────────────────

type DFType = DataFlowNode['dataType'];

class FlowAnalyzer {
  private nc = 0;
  private ec = 0;
  readonly nodes: DataFlowNode[] = [];
  readonly edges: DataFlowEdge[] = [];
  readonly variableDefinitions = new Map<string, string[]>();
  readonly variableUsages = new Map<string, string[]>();

  private nid(): string { return `df-node-${this.nc++}`; }
  private eid(): string { return `df-edge-${this.ec++}`; }

  private push(n: DataFlowNode): void { this.nodes.push(n); }

  private edge(from: string, to: string, kind: DataFlowEdge['kind']): void {
    this.edges.push({ id: this.eid(), from, to, kind });
  }

  private defn(v: string, id: string): void {
    (this.variableDefinitions.get(v) ?? (this.variableDefinitions.set(v, []), this.variableDefinitions.get(v)!)).push(id);
  }

  private use(v: string, id: string): void {
    (this.variableUsages.get(v) ?? (this.variableUsages.set(v, []), this.variableUsages.get(v)!)).push(id);
  }

  // ── Expression helpers ───────────────────────────────────────────────────

  private varRefs(expr: Expression | null | undefined): VariableLookup[] {
    if (!expr) return [];
    try {
      if (expr.type === 'VariableLookup') {
        const r: VariableLookup[] = [expr];
        for (const l of expr.lookups) if (typeof l !== 'string') r.push(...this.varRefs(l));
        return r;
      }
      if (expr.type === 'BinaryExpression') return [...this.varRefs(expr.left), ...this.varRefs(expr.right)];
      if (expr.type === 'Range') return [...this.varRefs(expr.start), ...this.varRefs(expr.end)];
    } catch { /* graceful */ }
    return [];
  }

  private txt(e: Expression | null | undefined): string {
    if (!e) return '';
    try {
      switch (e.type) {
        case 'VariableLookup': return e.name + e.lookups.map(l => typeof l === 'string' ? `.${l}` : `[${this.txt(l)}]`).join('');
        case 'StringLiteral': return `${e.quote}${e.value}${e.quote}`;
        case 'NumberLiteral': return String(e.value);
        case 'BooleanLiteral': return String(e.value);
        case 'NilLiteral': return 'nil';
        case 'Range': return `(${this.txt(e.start)}..${this.txt(e.end)})`;
        case 'BinaryExpression': return `${this.txt(e.left)} ${e.operator} ${this.txt(e.right)}`;
      }
    } catch { /* graceful */ }
    return '';
  }

  private typeExpr(e: Expression | null | undefined): DFType {
    if (!e) return 'unknown';
    if (e.type === 'StringLiteral') return 'string';
    if (e.type === 'NumberLiteral') return 'number';
    if (e.type === 'BooleanLiteral') return 'boolean';
    if (e.type === 'Range') return 'array';
    if (e.type === 'VariableLookup') {
      const last = e.lookups[e.lookups.length - 1];
      if (last === 'size') return 'number';
    }
    return 'unknown';
  }

  private typeFilters(fs: FilterApplication[], base: DFType): DFType {
    let r = base;
    for (const f of fs) {
      if (NUM_F.has(f.name)) r = 'number';
      else if (STR_F.has(f.name)) r = 'string';
      else if (ARR_F.has(f.name)) r = 'array';
    }
    return r;
  }

  private linkRefs(refs: VariableLookup[], targetId: string): void {
    for (const ref of refs) {
      this.use(ref.name, targetId);
      const defs = this.variableDefinitions.get(ref.name);
      if (defs?.length) this.edge(defs[defs.length - 1], targetId, 'data_dependency');
    }
  }

  private chainFilters(filters: FilterApplication[], srcId: string, varName: string): string {
    let prev = srcId;
    for (const f of filters) {
      const id = this.nid();
      this.push({ id, kind: 'filter', variableName: `${varName}|${f.name}`, loc: f.loc, expressionText: f.name, filters: [f.name], dataType: this.typeFilters([f], 'unknown') });
      this.edge(prev, id, 'filter_chain');
      for (const a of f.args) this.linkRefs(this.varRefs(a), id);
      prev = id;
    }
    return prev;
  }

  // ── Node processors ──────────────────────────────────────────────────────

  private walk(nodes: LiquidASTNode[]): void {
    for (const n of nodes) this.visit(n);
  }

  private visit(node: LiquidASTNode): void {
    try {
      switch (node.type) {
        case 'Assign': {
          const id = this.nid();
          const fNames = node.filters.map(f => f.name);
          this.push({ id, kind: 'assignment', variableName: node.name, loc: node.loc, expressionText: `${node.name} = ${this.txt(node.value)}`, filters: fNames, dataType: this.typeFilters(node.filters, this.typeExpr(node.value)) });
          this.defn(node.name, id);
          this.linkRefs(this.varRefs(node.value), id);
          if (node.filters.length) this.chainFilters(node.filters, id, node.name);
          break;
        }
        case 'Output': {
          const id = this.nid();
          const vn = this.txt(node.expression);
          this.push({ id, kind: 'output', variableName: vn, loc: node.loc, expressionText: `{{ ${vn} }}`, filters: node.filters.map(f => f.name), dataType: this.typeFilters(node.filters, this.typeExpr(node.expression)) });
          this.linkRefs(this.varRefs(node.expression), id);
          if (node.filters.length) this.chainFilters(node.filters, id, vn);
          break;
        }
        case 'For': {
          const id = this.nid();
          this.push({ id, kind: 'for_variable', variableName: node.variable, loc: node.loc, expressionText: `for ${node.variable} in ${this.txt(node.collection)}`, filters: [], dataType: 'unknown' });
          this.defn(node.variable, id);
          this.linkRefs(this.varRefs(node.collection), id);
          if (node.limit) this.linkRefs(this.varRefs(node.limit), id);
          if (node.offset) this.linkRefs(this.varRefs(node.offset), id);
          this.walk(node.body);
          if (node.elseBody.length) this.walk(node.elseBody);
          break;
        }
        case 'Capture': {
          const id = this.nid();
          this.push({ id, kind: 'capture', variableName: node.name, loc: node.loc, expressionText: `capture ${node.name}`, filters: [], dataType: 'string' });
          this.defn(node.name, id);
          this.walk(node.body);
          break;
        }
        case 'Render':
          this.processSnippetArgs(node.snippetName, node.args, node.loc);
          if (node.variable) {
            const id = this.nid();
            const alias = node.alias ?? node.snippetName;
            this.push({ id, kind: 'render_param', variableName: alias, loc: node.loc, expressionText: `render '${node.snippetName}' ${node.isFor ? 'for' : 'with'} ${this.txt(node.variable)}`, filters: [], dataType: this.typeExpr(node.variable) });
            this.defn(alias, id);
            this.linkRefs(this.varRefs(node.variable), id);
          }
          break;
        case 'Include':
          this.processSnippetArgs(node.snippetName, node.args, node.loc);
          if (node.variable) {
            const id = this.nid();
            this.push({ id, kind: 'render_param', variableName: node.snippetName, loc: node.loc, expressionText: `include '${node.snippetName}' with ${this.txt(node.variable)}`, filters: [], dataType: this.typeExpr(node.variable) });
            this.linkRefs(this.varRefs(node.variable), id);
          }
          break;
        case 'Increment': {
          const id = this.nid();
          this.push({ id, kind: 'increment', variableName: node.name, loc: node.loc, expressionText: `increment ${node.name}`, filters: [], dataType: 'number' });
          this.defn(node.name, id);
          break;
        }
        case 'Decrement': {
          const id = this.nid();
          this.push({ id, kind: 'decrement', variableName: node.name, loc: node.loc, expressionText: `decrement ${node.name}`, filters: [], dataType: 'number' });
          this.defn(node.name, id);
          break;
        }
        case 'If':
          for (const b of node.branches) this.walk(b.body);
          break;
        case 'Unless':
          this.walk(node.consequent);
          this.walk(node.alternate);
          break;
        case 'Case':
          for (const w of node.whens) this.walk(w.body);
          if (node.elseBody.length) this.walk(node.elseBody);
          break;
        case 'Form': case 'Paginate':
          this.walk(node.body);
          break;
        case 'TableRow':
          this.walk(node.body);
          break;
        default: break;
      }
    } catch { /* graceful skip */ }
  }

  private processSnippetArgs(snippet: string, args: { name: string; value: Expression }[], loc: SourceLocation): void {
    for (const arg of args) {
      const id = this.nid();
      this.push({ id, kind: 'render_param', variableName: arg.name, loc, expressionText: `${snippet}: ${arg.name}: ${this.txt(arg.value)}`, filters: [], dataType: this.typeExpr(arg.value) });
      this.defn(arg.name, id);
      this.linkRefs(this.varRefs(arg.value), id);
    }
  }

  analyze(ast: LiquidASTNode[]): DataFlowGraph {
    this.walk(ast);
    return { nodes: this.nodes, edges: this.edges, variableDefinitions: this.variableDefinitions, variableUsages: this.variableUsages };
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Analyze a Liquid AST and build a data flow graph.
 *
 * Walks the AST recursively, tracking variable assignments, filter chains,
 * output references, and scope boundaries to produce a complete picture of
 * how data flows through the template.
 */
export function analyzeDataFlow(ast: LiquidASTNode[]): DataFlowGraph {
  try {
    return new FlowAnalyzer().analyze(ast);
  } catch {
    return { nodes: [], edges: [], variableDefinitions: new Map(), variableUsages: new Map() };
  }
}

/**
 * Parse a Liquid template source string and analyze its data flow in one step.
 *
 * Convenience wrapper that calls `parseLiquidAST` then `analyzeDataFlow`.
 */
export function analyzeDataFlowFromSource(source: string): DataFlowGraph {
  try {
    return analyzeDataFlow(parseLiquidAST(source).ast);
  } catch {
    return { nodes: [], edges: [], variableDefinitions: new Map(), variableUsages: new Map() };
  }
}
