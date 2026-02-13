import type {
  LiquidASTNode,
  TextNode,
  OutputNode,
  AssignNode,
  IfNode,
  UnlessNode,
  ForNode,
  CaseNode,
  CaptureNode,
  RawNode,
  CommentNode,
  RenderNode,
  IncludeNode,
  SectionTagNode,
  SchemaNode,
  FormNode,
  PaginateNode,
  TableRowNode,
  LayoutNode,
  StyleNode,
  JavaScriptNode,
  StylesheetNode,
  IncrementNode,
  DecrementNode,
  BreakNode,
  ContinueNode,
  LiquidTagNode,
  Expression,
  FilterApplication,
} from './liquid-ast';

// ── Visitor Interface ────────────────────────────────────────────────────────

/**
 * Visitor interface for walking a Liquid AST.
 * Implement the methods you need; unimplemented methods are skipped.
 * Return `false` from any visit method to prevent walking into children.
 */
export interface LiquidASTVisitor {
  visitText?(node: TextNode): void | false;
  visitOutput?(node: OutputNode): void | false;
  visitAssign?(node: AssignNode): void | false;
  visitIf?(node: IfNode): void | false;
  visitUnless?(node: UnlessNode): void | false;
  visitFor?(node: ForNode): void | false;
  visitCase?(node: CaseNode): void | false;
  visitCapture?(node: CaptureNode): void | false;
  visitRaw?(node: RawNode): void | false;
  visitComment?(node: CommentNode): void | false;
  visitRender?(node: RenderNode): void | false;
  visitInclude?(node: IncludeNode): void | false;
  visitSectionTag?(node: SectionTagNode): void | false;
  visitSchema?(node: SchemaNode): void | false;
  visitForm?(node: FormNode): void | false;
  visitPaginate?(node: PaginateNode): void | false;
  visitTableRow?(node: TableRowNode): void | false;
  visitLayout?(node: LayoutNode): void | false;
  visitStyle?(node: StyleNode): void | false;
  visitJavaScript?(node: JavaScriptNode): void | false;
  visitStylesheet?(node: StylesheetNode): void | false;
  visitIncrement?(node: IncrementNode): void | false;
  visitDecrement?(node: DecrementNode): void | false;
  visitBreak?(node: BreakNode): void | false;
  visitContinue?(node: ContinueNode): void | false;
  visitLiquidTag?(node: LiquidTagNode): void | false;

  /** Called for every expression node encountered during traversal. */
  visitExpression?(node: Expression): void;
  /** Called for every filter application encountered during traversal. */
  visitFilter?(node: FilterApplication): void;
}

// ── Walker Implementation ────────────────────────────────────────────────────

/**
 * Walk a Liquid AST, calling visitor methods for each node.
 * Recursively descends into child nodes (body, branches, etc.).
 */
export function walkLiquidAST(nodes: LiquidASTNode[], visitor: LiquidASTVisitor): void {
  for (const node of nodes) {
    walkNode(node, visitor);
  }
}

function walkNode(node: LiquidASTNode, visitor: LiquidASTVisitor): void {
  switch (node.type) {
    case 'Text':
      visitor.visitText?.(node);
      break;

    case 'Output': {
      const skip = visitor.visitOutput?.(node);
      if (skip === false) break;
      walkExpression(node.expression, visitor);
      for (const filter of node.filters) walkFilter(filter, visitor);
      break;
    }

    case 'Assign': {
      const skip = visitor.visitAssign?.(node);
      if (skip === false) break;
      walkExpression(node.value, visitor);
      for (const filter of node.filters) walkFilter(filter, visitor);
      break;
    }

    case 'If': {
      const skip = visitor.visitIf?.(node);
      if (skip === false) break;
      for (const branch of node.branches) {
        if (branch.condition) walkExpression(branch.condition, visitor);
        walkLiquidAST(branch.body, visitor);
      }
      break;
    }

    case 'Unless': {
      const skip = visitor.visitUnless?.(node);
      if (skip === false) break;
      walkExpression(node.condition, visitor);
      walkLiquidAST(node.consequent, visitor);
      walkLiquidAST(node.alternate, visitor);
      break;
    }

    case 'For': {
      const skip = visitor.visitFor?.(node);
      if (skip === false) break;
      walkExpression(node.collection, visitor);
      if (node.limit) walkExpression(node.limit, visitor);
      if (node.offset) walkExpression(node.offset, visitor);
      walkLiquidAST(node.body, visitor);
      walkLiquidAST(node.elseBody, visitor);
      break;
    }

    case 'Case': {
      const skip = visitor.visitCase?.(node);
      if (skip === false) break;
      walkExpression(node.expression, visitor);
      for (const when of node.whens) {
        for (const val of when.values) walkExpression(val, visitor);
        walkLiquidAST(when.body, visitor);
      }
      walkLiquidAST(node.elseBody, visitor);
      break;
    }

    case 'Capture': {
      const skip = visitor.visitCapture?.(node);
      if (skip === false) break;
      walkLiquidAST(node.body, visitor);
      break;
    }

    case 'Raw':
      visitor.visitRaw?.(node);
      break;

    case 'Comment':
      visitor.visitComment?.(node);
      break;

    case 'Render': {
      const skip = visitor.visitRender?.(node);
      if (skip === false) break;
      if (node.variable) walkExpression(node.variable, visitor);
      for (const arg of node.args) walkExpression(arg.value, visitor);
      break;
    }

    case 'Include': {
      const skip = visitor.visitInclude?.(node);
      if (skip === false) break;
      if (node.variable) walkExpression(node.variable, visitor);
      for (const arg of node.args) walkExpression(arg.value, visitor);
      break;
    }

    case 'SectionTag':
      visitor.visitSectionTag?.(node);
      break;

    case 'Schema':
      visitor.visitSchema?.(node);
      break;

    case 'Form': {
      const skip = visitor.visitForm?.(node);
      if (skip === false) break;
      walkExpression(node.formType, visitor);
      for (const arg of node.args) walkExpression(arg, visitor);
      walkLiquidAST(node.body, visitor);
      break;
    }

    case 'Paginate': {
      const skip = visitor.visitPaginate?.(node);
      if (skip === false) break;
      walkExpression(node.collection, visitor);
      walkExpression(node.pageSize, visitor);
      walkLiquidAST(node.body, visitor);
      break;
    }

    case 'TableRow': {
      const skip = visitor.visitTableRow?.(node);
      if (skip === false) break;
      walkExpression(node.collection, visitor);
      if (node.limit) walkExpression(node.limit, visitor);
      if (node.offset) walkExpression(node.offset, visitor);
      if (node.cols) walkExpression(node.cols, visitor);
      walkLiquidAST(node.body, visitor);
      break;
    }

    case 'Layout': {
      const skip = visitor.visitLayout?.(node);
      if (skip === false) break;
      walkExpression(node.name, visitor);
      break;
    }

    case 'Style':
      visitor.visitStyle?.(node);
      break;

    case 'JavaScript':
      visitor.visitJavaScript?.(node);
      break;

    case 'Stylesheet':
      visitor.visitStylesheet?.(node);
      break;

    case 'Increment':
      visitor.visitIncrement?.(node);
      break;

    case 'Decrement':
      visitor.visitDecrement?.(node);
      break;

    case 'Break':
      visitor.visitBreak?.(node);
      break;

    case 'Continue':
      visitor.visitContinue?.(node);
      break;

    case 'LiquidTag':
      visitor.visitLiquidTag?.(node);
      break;
  }
}

function walkExpression(expr: Expression, visitor: LiquidASTVisitor): void {
  visitor.visitExpression?.(expr);

  switch (expr.type) {
    case 'VariableLookup':
      for (const lookup of expr.lookups) {
        if (typeof lookup !== 'string') walkExpression(lookup, visitor);
      }
      break;
    case 'BinaryExpression':
      walkExpression(expr.left, visitor);
      walkExpression(expr.right, visitor);
      break;
    case 'Range':
      walkExpression(expr.start, visitor);
      walkExpression(expr.end, visitor);
      break;
    // StringLiteral, NumberLiteral, BooleanLiteral, NilLiteral – leaf nodes
  }
}

function walkFilter(filter: FilterApplication, visitor: LiquidASTVisitor): void {
  visitor.visitFilter?.(filter);
  for (const arg of filter.args) walkExpression(arg, visitor);
}

// ── Legacy compatibility re-export ───────────────────────────────────────────
// The old ast-walker exported a different interface. Keep backward compat.
import type { LiquidNode } from './parser';

export type LiquidNodeVisitor = (node: LiquidNode) => void;

/**
 * @deprecated Use `walkLiquidAST` with `LiquidASTVisitor` instead.
 * Legacy walker for the flat `LiquidNode[]` from `parser.ts`.
 */
export function walkLiquidAst(nodes: LiquidNode[], visitor: LiquidNodeVisitor): void {
  for (const node of nodes) {
    visitor(node);
  }
}
