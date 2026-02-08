/**
 * Symbol extraction utilities for cross-file dependency detection - REQ-5
 */

export class SymbolExtractor {
  /**
   * Extract CSS class names from CSS content.
   * Matches patterns like `.className {`
   */
  extractCssClasses(cssContent: string): string[] {
    const regex = /\.([a-zA-Z_-][a-zA-Z0-9_-]*)\s*\{/g;
    const classes: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = regex.exec(cssContent)) !== null) {
      const className = match[1];
      if (!classes.includes(className)) {
        classes.push(className);
      }
    }

    return classes;
  }

  /**
   * Extract JavaScript function names from JS content.
   * Matches both `function name(...)` declarations and `const name = (...) =>` arrow functions.
   */
  extractJsFunctions(jsContent: string): string[] {
    const functions: string[] = [];

    // Match function declarations: function name(...)
    const funcDeclRegex = /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
    let match: RegExpExecArray | null;

    while ((match = funcDeclRegex.exec(jsContent)) !== null) {
      const name = match[1];
      if (!functions.includes(name)) {
        functions.push(name);
      }
    }

    // Match arrow functions: const/let/var name = (...) => or const name = () =>
    const arrowFuncRegex =
      /(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:\([^)]*\)|[a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>/g;

    while ((match = arrowFuncRegex.exec(jsContent)) !== null) {
      const name = match[1];
      if (!functions.includes(name)) {
        functions.push(name);
      }
    }

    return functions;
  }

  /**
   * Extract Liquid include/render template names.
   * Matches `{% include 'name' %}` and `{% render 'name' %}`.
   */
  extractLiquidIncludes(liquidContent: string): string[] {
    const regex = /\{%[-\s]*(?:include|render)\s+['"]([^'"]+)['"]/g;
    const includes: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = regex.exec(liquidContent)) !== null) {
      const name = match[1];
      if (!includes.includes(name)) {
        includes.push(name);
      }
    }

    return includes;
  }

  /**
   * Get line and column number for a character index in content.
   * Lines and columns are 1-based.
   */
  getLineNumber(
    content: string,
    index: number
  ): { line: number; column: number } {
    const before = content.substring(0, index);
    const lines = before.split('\n');
    const line = lines.length;
    const column = (lines[lines.length - 1]?.length ?? 0) + 1;
    return { line, column };
  }

  /**
   * Get a context snippet around a match position.
   * Returns the substring of `length` characters starting at `index`.
   */
  getContextSnippet(
    content: string,
    index: number,
    length: number = 50
  ): string {
    const start = Math.max(0, index);
    const end = Math.min(content.length, start + length);
    return content.substring(start, end);
  }
}
