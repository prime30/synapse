import shopifySchema from "./shopify-schema.json";
import { STANDARD_FILTERS } from "./standard-filters";
import type {
  LiquidASTNode,
  Expression,
  VariableLookup,
  OutputNode,
  AssignNode,
  FilterApplication,
  IfNode,
  ForNode,
  CaptureNode,
  BinaryExpression,
} from "./liquid-ast";
import { walkLiquidAST } from "./ast-walker";
import type { ScopeTracker } from "./scope-tracker";

/** Liquid built-in variables that are always in scope. */
const LIQUID_BUILTINS = new Set([
  "forloop",
  "tablerowloop",
  "now",
  "today",
  "blank",
  "empty",
  "nil",
  "null",
  "true",
  "false",
  "settings",
  "section",
  "block",
  "template",
  "request",
  "content_for_header",
  "content_for_layout",
]);

interface SchemaObject {
  properties: Record<string, string>;
}

interface ShopifySchema {
  objects: Record<string, SchemaObject>;
}

const schema: ShopifySchema = shopifySchema as ShopifySchema;

/** Result of a type-check issue found during AST walking. */
export interface TypeIssue {
  message: string;
  line: number;
  column: number;
  severity: "error" | "warning";
}

/**
 * Provides type-checking capabilities for Liquid templates by leveraging
 * the Shopify schema and standard filter definitions.
 */
export class TypeChecker {
  private schema: ShopifySchema;
  private filterMap: Map<string, { inputType: string; outputType: string }>;

  constructor() {
    this.schema = schema;
    this.filterMap = new Map();

    for (const filter of STANDARD_FILTERS) {
      this.filterMap.set(filter.name, {
        inputType: filter.inputType,
        outputType: filter.outputType,
      });
    }
  }

  /**
   * Check whether a filter can accept the given input type.
   * Returns { valid: true } if compatible, or { valid: false, message } otherwise.
   */
  checkFilterType(
    filterName: string,
    inputType: string,
  ): { valid: boolean; message?: string } {
    const filter = this.filterMap.get(filterName);

    if (!filter) {
      return { valid: false, message: `Unknown filter: "${filterName}"` };
    }

    // "any" input type accepts everything
    if (filter.inputType === "any") {
      return { valid: true };
    }

    // "any" input value is always compatible
    if (inputType === "any") {
      return { valid: true };
    }

    // Check if the input type matches or is a subtype (e.g., "array<string>" matches "array")
    if (
      inputType === filter.inputType ||
      inputType.startsWith(`${filter.inputType}<`) ||
      (filter.inputType === "array" && inputType.startsWith("array"))
    ) {
      return { valid: true };
    }

    return {
      valid: false,
      message: `Filter "${filterName}" expects input type "${filter.inputType}", but received "${inputType}"`,
    };
  }

  /**
   * Infer the type of a dotted expression from the Shopify schema.
   * Examples:
   *   "product.title" → "string"
   *   "product.price" → "number"
   *   "product" → "object"
   *   "unknown_thing" → "unknown"
   */
  inferType(expression: string): string {
    const parts = expression.trim().split(".");

    if (parts.length === 0) {
      return "unknown";
    }

    const rootName = parts[0];
    const rootObject = this.schema.objects[rootName];

    if (!rootObject) {
      return "unknown";
    }

    if (parts.length === 1) {
      return "object";
    }

    // Walk the property chain
    let currentObject: SchemaObject | undefined = rootObject;

    for (let i = 1; i < parts.length; i++) {
      const prop = parts[i];

      if (!currentObject || !currentObject.properties) {
        return "unknown";
      }

      const propType = currentObject.properties[prop];

      if (!propType) {
        return "unknown";
      }

      // If this is the last part, return the type
      if (i === parts.length - 1) {
        return this.normalizeType(propType);
      }

      // Otherwise, resolve the type to an object for further traversal
      const resolvedTypeName = this.extractObjectType(propType);

      if (!resolvedTypeName) {
        return "unknown";
      }

      currentObject = this.schema.objects[resolvedTypeName];
    }

    return "unknown";
  }

  // ── AST-based type inference ─────────────────────────────────────────────

  /**
   * Infer the type of an Expression AST node.
   * Uses the Shopify schema for variable lookups.
   */
  inferExpressionType(expr: Expression): string {
    switch (expr.type) {
      case "StringLiteral":
        return "string";
      case "NumberLiteral":
        return "number";
      case "BooleanLiteral":
        return "boolean";
      case "NilLiteral":
        return "any";
      case "Range":
        return "array";
      case "BinaryExpression": {
        const op = expr.operator;
        if (
          op === "==" ||
          op === "!=" ||
          op === "<" ||
          op === ">" ||
          op === "<=" ||
          op === ">=" ||
          op === "contains" ||
          op === "and" ||
          op === "or"
        ) {
          return "boolean";
        }
        return "any";
      }
      case "VariableLookup":
        return this.inferVariableLookupType(expr);
      default:
        return "unknown";
    }
  }

  /**
   * Infer the type of a VariableLookup by walking the Shopify schema.
   */
  inferVariableLookupType(lookup: VariableLookup): string {
    const dotPath = [lookup.name, ...lookup.lookups.filter((l): l is string => typeof l === "string")].join(".");
    return this.inferType(dotPath);
  }

  /**
   * Infer the output type after applying a filter chain to an input expression.
   */
  inferFilteredType(inputType: string, filters: FilterApplication[]): string {
    let currentType = inputType;
    for (const filter of filters) {
      const outputType = this.getFilterOutputType(filter.name);
      if (outputType) {
        currentType = outputType;
      }
    }
    return currentType;
  }

  /**
   * Walk an AST and collect type-check issues (mismatched filter types,
   * undefined variables, comparison type mismatches).
   * Uses optional ScopeTracker for scope-aware variable lookup.
   */
  walkAndCheck(
    nodes: LiquidASTNode[],
    assignedTypes?: Map<string, string>,
    scopeTracker?: ScopeTracker,
    customFilters?: string[],
  ): TypeIssue[] {
    // Register custom filters as pass-through (any -> any) so they aren't flagged
    if (customFilters) {
      for (const name of customFilters) {
        if (!this.filterMap.has(name)) {
          this.filterMap.set(name, { inputType: 'any', outputType: 'any' });
        }
      }
    }
    const issues: TypeIssue[] = [];
    const varTypes = assignedTypes ?? new Map<string, string>();

    walkLiquidAST(nodes, {
      visitAssign: (node: AssignNode) => {
        const valueType = this.inferExpressionType(node.value);
        const finalType = this.inferFilteredType(valueType, node.filters);
        varTypes.set(node.name, finalType);
      },

      visitOutput: (node: OutputNode) => {
        const expr = node.expression;
        if (expr.type === "VariableLookup") {
          const rootName = expr.name;
          if (!this.isVariableDefined(rootName, varTypes, scopeTracker)) {
            issues.push({
              message: `Possibly undefined variable "${rootName}"`,
              line: expr.loc?.line ?? 0,
              column: expr.loc?.column ?? 0,
              severity: "warning",
            });
          }
        }
        const exprType = this.inferExpressionType(expr);
        this.checkFilterChainTypes(exprType, node.filters, issues);
      },

      visitFor: (node: ForNode) => {
        varTypes.set(node.variable, "any");
        varTypes.set("forloop", "object");
      },

      visitCapture: (node: CaptureNode) => {
        varTypes.set(node.name, "string");
      },

      visitIf: (node: IfNode) => {
        for (const branch of node.branches) {
          if (
            branch.condition &&
            branch.condition.type === "BinaryExpression"
          ) {
            this.checkComparisonTypes(branch.condition, issues);
          }
        }
      },
    });

    return issues;
  }

  /**
   * Check if a variable name is defined in schema, varTypes, builtins, or scope.
   */
  private isVariableDefined(
    rootName: string,
    varTypes: Map<string, string>,
    scopeTracker?: ScopeTracker,
  ): boolean {
    if (this.schema.objects[rootName]) return true;
    if (varTypes.has(rootName)) return true;
    if (LIQUID_BUILTINS.has(rootName)) return true;
    if (scopeTracker?.getVariable(rootName)) return true;
    return false;
  }

  /**
   * Check BinaryExpression conditions for type mismatches in comparisons.
   */
  private checkComparisonTypes(
    expr: BinaryExpression,
    issues: TypeIssue[],
  ): void {
    const comparisonOps = ["==", "!=", "<", ">", "<=", ">="];
    if (!comparisonOps.includes(expr.operator)) return;

    const leftType = this.inferExpressionType(expr.left);
    const rightType = this.inferExpressionType(expr.right);

    if (leftType === "unknown" || rightType === "unknown") return;
    if (leftType === "any" || rightType === "any") return;

    if (leftType !== rightType) {
      issues.push({
        message: `Type mismatch in comparison: "${leftType}" ${expr.operator} "${rightType}"`,
        line: expr.loc?.line ?? 0,
        column: expr.loc?.column ?? 0,
        severity: "warning",
      });
    }
  }

  /**
   * Check a filter chain for type compatibility issues.
   */
  private checkFilterChainTypes(
    inputType: string,
    filters: FilterApplication[],
    issues: TypeIssue[],
  ): void {
    let currentType = inputType;
    for (const filter of filters) {
      const result = this.checkFilterType(filter.name, currentType);
      if (!result.valid && result.message) {
        issues.push({
          message: result.message,
          line: filter.loc.line,
          column: filter.loc.column,
          severity: "warning",
        });
      }
      const outputType = this.getFilterOutputType(filter.name);
      if (outputType) currentType = outputType;
    }
  }

  /**
   * Normalize complex types to their base type:
   *   "array<string>" → "array"
   *   "string" → "string"
   *   "image" → "object" (if it's a known object)
   */
  private normalizeType(typeStr: string): string {
    if (typeStr.startsWith("array<")) {
      return "array";
    }

    const primitives = ["string", "number", "boolean"];
    if (primitives.includes(typeStr)) {
      return typeStr;
    }

    // Check if it's a known schema object (like "image", "variant")
    if (this.schema.objects[typeStr]) {
      return "object";
    }

    return typeStr;
  }

  /**
   * Extract the object type name from a schema type string.
   * "image" → "image"
   * "array<variant>" → "variant"
   * "string" → null (not an object)
   */
  private extractObjectType(typeStr: string): string | null {
    // Handle array types: array<variant> → variant
    const arrayMatch = typeStr.match(/^array<(.+)>$/);
    if (arrayMatch) {
      const innerType = arrayMatch[1];
      if (this.schema.objects[innerType]) {
        return innerType;
      }
      return null;
    }

    // Handle direct object references: "image", "variant", etc.
    if (this.schema.objects[typeStr]) {
      return typeStr;
    }

    return null;
  }

  /** Get the output type of a filter (for chaining). */
  getFilterOutputType(filterName: string): string | null {
    const filter = this.filterMap.get(filterName);
    return filter ? filter.outputType : null;
  }
}
