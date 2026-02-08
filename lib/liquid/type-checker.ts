import shopifySchema from "./shopify-schema.json";
import { STANDARD_FILTERS } from "./standard-filters";

interface SchemaObject {
  properties: Record<string, string>;
}

interface ShopifySchema {
  objects: Record<string, SchemaObject>;
}

const schema: ShopifySchema = shopifySchema as ShopifySchema;

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
