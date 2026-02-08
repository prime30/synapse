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
}
