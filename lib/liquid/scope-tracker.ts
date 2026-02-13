import type {
  LiquidASTNode,
  AssignNode,
  ForNode,
  CaptureNode,
  TableRowNode,
  Expression,
} from './liquid-ast';
import { walkLiquidAST } from './ast-walker';

interface ScopedVariable {
  name: string;
  type: string;
}

/**
 * Tracks variable scopes during Liquid template validation.
 * Uses a stack of Maps to manage variable visibility across nested scopes
 * (e.g., for loops, captures, etc.).
 */
export class ScopeTracker {
  private scopes: Map<string, ScopedVariable>[] = [new Map()];

  /** Push a new scope onto the stack (e.g., entering a for loop). */
  pushScope(): void {
    this.scopes.push(new Map());
  }

  /** Pop the innermost scope off the stack. */
  popScope(): void {
    if (this.scopes.length > 1) {
      this.scopes.pop();
    }
  }

  /** Add a variable to the current (innermost) scope. */
  addVariable(name: string, type: string): void {
    const currentScope = this.scopes[this.scopes.length - 1];
    currentScope.set(name, { name, type });
  }

  /**
   * Look up a variable by name, searching from the innermost scope outward.
   * Returns the variable definition if found, or null if not in any scope.
   */
  getVariable(name: string): ScopedVariable | null {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const variable = this.scopes[i].get(name);
      if (variable) {
        return variable;
      }
    }
    return null;
  }

  /** Returns the current nesting depth (0 = global scope). */
  getCurrentDepth(): number {
    return this.scopes.length - 1;
  }

  // ── AST-based scope building ─────────────────────────────────────────────

  /**
   * Process an Assign AST node: adds the variable to the current scope.
   * Infers type as "any" unless more info is available.
   */
  processAssign(node: AssignNode): void {
    const type = inferExpressionRootType(node.value);
    this.addVariable(node.name, type);
  }

  /**
   * Process a For AST node: pushes a new scope with the iterator variable
   * and the `forloop` helper. Call popScope() when done with the body.
   */
  processFor(node: ForNode): void {
    this.pushScope();
    const collectionType = inferExpressionRootType(node.collection);
    const itemType = collectionType.startsWith('array<')
      ? collectionType.slice(6, -1)
      : 'any';
    this.addVariable(node.variable, itemType);
    this.addVariable('forloop', 'object');
  }

  /**
   * Process a TableRow AST node: same scope semantics as For.
   */
  processTableRow(node: TableRowNode): void {
    this.pushScope();
    const collectionType = inferExpressionRootType(node.collection);
    const itemType = collectionType.startsWith('array<')
      ? collectionType.slice(6, -1)
      : 'any';
    this.addVariable(node.variable, itemType);
    this.addVariable('tablerowloop', 'object');
  }

  /**
   * Process a Capture AST node: adds the captured variable to the current scope.
   */
  processCapture(node: CaptureNode): void {
    this.addVariable(node.name, 'string');
  }

  /**
   * Build scopes from a full AST. Walks the tree and processes
   * assign, for, capture, and tablerow nodes to build scope state.
   * Useful for a one-pass scope analysis.
   */
  buildFromAST(nodes: LiquidASTNode[]): void {
    walkLiquidAST(nodes, {
      visitAssign: (node) => {
        this.processAssign(node);
      },
      visitFor: (node) => {
        this.processFor(node);
        // Walk body manually then pop scope
        walkLiquidAST(node.body, this.buildVisitor());
        walkLiquidAST(node.elseBody, this.buildVisitor());
        this.popScope();
        return false; // don't recurse again
      },
      visitTableRow: (node) => {
        this.processTableRow(node);
        walkLiquidAST(node.body, this.buildVisitor());
        this.popScope();
        return false;
      },
      visitCapture: (node) => {
        this.processCapture(node);
      },
    });
  }

  /** Create a visitor that builds scopes (for recursive use). */
  private buildVisitor() {
    return {
      visitAssign: (node: AssignNode) => {
        this.processAssign(node);
      },
      visitCapture: (node: CaptureNode) => {
        this.processCapture(node);
      },
    };
  }
}

/**
 * Infer a rough root type from an expression.
 * Returns "string", "number", "boolean", "any", or the variable's root name.
 */
function inferExpressionRootType(expr: Expression): string {
  switch (expr.type) {
    case 'StringLiteral':
      return 'string';
    case 'NumberLiteral':
      return 'number';
    case 'BooleanLiteral':
      return 'boolean';
    case 'NilLiteral':
      return 'any';
    case 'Range':
      return 'array';
    case 'VariableLookup':
      return expr.name;
    case 'BinaryExpression':
      return 'boolean';
    default:
      return 'any';
  }
}
