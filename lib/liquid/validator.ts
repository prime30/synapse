import { STANDARD_TAGS } from "./standard-tags";
import { STANDARD_FILTERS } from "./standard-filters";
import { TypeChecker } from "./type-checker";
import { ScopeTracker } from "./scope-tracker";
import { parseLiquidAST } from "./liquid-ast";
import shopifySchema from "./shopify-schema.json";

// ── Public types ────────────────────────────────────────────────────────────

export interface ValidationError {
  type: "syntax" | "semantic" | "security";
  line: number;
  column: number;
  message: string;
  severity: "error" | "warning" | "info";
  suggestion?: string;
}

export type ValidationWarning = ValidationError;

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Compute the Levenshtein edit distance between two strings. */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0),
  );

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }

  return dp[m][n];
}

/**
 * Find the closest match for a name from a list of candidates.
 * Returns the suggestion string or undefined if no close match found.
 */
function findClosestMatch(
  name: string,
  candidates: string[],
  maxDistance = 3,
): string | undefined {
  let best: string | undefined;
  let bestDist = Infinity;

  for (const candidate of candidates) {
    const dist = editDistance(name.toLowerCase(), candidate.toLowerCase());
    if (dist < bestDist && dist <= maxDistance) {
      bestDist = dist;
      best = candidate;
    }
  }

  return best;
}

/** Get line and column from a string offset. */
function getLineAndColumn(
  template: string,
  offset: number,
): { line: number; column: number } {
  let line = 1;
  let lastNewline = -1;

  for (let i = 0; i < offset && i < template.length; i++) {
    if (template[i] === "\n") {
      line++;
      lastNewline = i;
    }
  }

  return { line, column: offset - lastNewline };
}

// ── Tag resolution helpers ──────────────────────────────────────────────────

/** Map of closing tags to their opening counterparts. */
const CLOSING_TO_OPENING: Record<string, string> = {};
/** Set of tags that require closing. */
const BLOCK_TAGS = new Set<string>();

for (const tag of STANDARD_TAGS) {
  if (tag.requiresClosing) {
    BLOCK_TAGS.add(tag.name);
    CLOSING_TO_OPENING[`end${tag.name}`] = tag.name;
  }
}

/** Tags that are intermediate (live inside a block but don't open/close). */
const INTERMEDIATE_TAGS = new Set(["elsif", "else", "when"]);

// ── Validator ───────────────────────────────────────────────────────────────

/**
 * Validates Liquid templates for syntax, semantic, and security issues.
 * Uses regex-based parsing (no liquidjs dependency).
 */
export class LiquidValidator {
  private typeChecker: TypeChecker;

  constructor() {
    this.typeChecker = new TypeChecker();
  }

  /**
   * Run all validations on a template.
   * If projectId is provided, attempts to load custom tags/filters from the
   * database (fails gracefully if unavailable).
   */
  async validate(
    template: string,
    projectId?: string,
  ): Promise<ValidationResult> {
    let customTags: string[] = [];
    let customFilters: string[] = [];

    if (projectId) {
      try {
        const loaded = await this.loadCustomDefinitions(projectId);
        customTags = loaded.tags;
        customFilters = loaded.filters;
      } catch {
        // Gracefully ignore – proceed with standard definitions only
      }
    }

    const syntaxErrors = this.validateSyntax(template);
    const semanticErrors = this.validateSemantics(
      template,
      customTags,
      customFilters,
    );
    const securityErrors = this.validateSecurity(template);

    const all = [...syntaxErrors, ...semanticErrors, ...securityErrors];

    const errors = all.filter((e) => e.severity === "error");
    const warnings = all.filter(
      (e) => e.severity === "warning" || e.severity === "info",
    );

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate syntax: unclosed / mismatched block tags.
   * Uses a stack-based approach.
   */
  validateSyntax(template: string): ValidationError[] {
    const errors: ValidationError[] = [];
    const stack: { tag: string; line: number; column: number }[] = [];

    // Match all Liquid tags: {% tagName ... %}
    const tagRegex = /\{%-?\s*(\w+)[^%]*-?%\}/g;
    let match: RegExpExecArray | null;

    while ((match = tagRegex.exec(template)) !== null) {
      const tagName = match[1];
      const { line, column } = getLineAndColumn(template, match.index);

      // Skip intermediate tags – they don't push/pop
      if (INTERMEDIATE_TAGS.has(tagName)) {
        continue;
      }

      // Is this a closing tag (e.g., endif, endfor)?
      const openingTag = CLOSING_TO_OPENING[tagName];
      if (openingTag) {
        if (stack.length === 0) {
          errors.push({
            type: "syntax",
            line,
            column,
            message: `Unexpected closing tag "{% ${tagName} %}" with no matching opening tag`,
            severity: "error",
          });
        } else {
          const top = stack[stack.length - 1];
          if (top.tag === openingTag) {
            stack.pop();
          } else {
            errors.push({
              type: "syntax",
              line,
              column,
              message: `Mismatched tag: expected "{% end${top.tag} %}" but found "{% ${tagName} %}"`,
              severity: "error",
              suggestion: `Replace with {% end${top.tag} %}`,
            });
            stack.pop();
          }
        }
        continue;
      }

      // Is this an opening block tag?
      if (BLOCK_TAGS.has(tagName)) {
        stack.push({ tag: tagName, line, column });
      }
    }

    // Any remaining on the stack are unclosed
    for (const unclosed of stack) {
      errors.push({
        type: "syntax",
        line: unclosed.line,
        column: unclosed.column,
        message: `Unclosed tag "{% ${unclosed.tag} %}" — expected "{% end${unclosed.tag} %}"`,
        severity: "error",
        suggestion: `Add {% end${unclosed.tag} %} to close this block`,
      });
    }

    return errors;
  }

  /**
   * Validate semantics: unknown variables, unknown filters, type mismatches.
   */
  validateSemantics(
    template: string,
    customTags: string[] = [],
    customFilters: string[] = [],
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    // Build the set of all known filter names
    const allFilterNames = new Set<string>([
      ...STANDARD_FILTERS.map((f) => f.name),
      ...customFilters,
    ]);

    // Build the set of all known tag names
    const allTagNames = new Set<string>([
      ...STANDARD_TAGS.map((t) => t.name),
      ...customTags,
    ]);

    // Known Shopify global objects
    const schemaObjects = Object.keys(
      (shopifySchema as { objects: Record<string, unknown> }).objects,
    );

    // Track assigned variables
    const assignedVariables = new Set<string>();

    // Common Liquid built-in variables that are always available
    const builtinVariables = new Set([
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
      "canonical_url",
      "current_page",
      "current_tags",
      "handle",
      "page_title",
      "page_description",
      "form",
      "paginate",
      "checkout",
      "order",
      "shipping_method",
      "tax_line",
      "transaction",
      "theme",
      "routes",
      "linklists",
      "linklist",
      "link",
      "pages",
      "all_products",
      "collections",
      "search",
      "recommendations",
      "predictive_search",
      "comment",
      "gift_card",
      "scripts",
      "country_option_tags",
      "locale",
      "localization",
      "policy",
      "additional_checkout_buttons",
      "content_for_additional_checkout_buttons",
      "powered_by_link",
    ]);

    // Collect assign statements
    const assignRegex = /\{%-?\s*assign\s+(\w+)\s*=/g;
    let assignMatch: RegExpExecArray | null;
    while ((assignMatch = assignRegex.exec(template)) !== null) {
      assignedVariables.add(assignMatch[1]);
    }

    // Collect capture variables
    const captureRegex = /\{%-?\s*capture\s+(\w+)\s*-?%\}/g;
    let captureMatch: RegExpExecArray | null;
    while ((captureMatch = captureRegex.exec(template)) !== null) {
      assignedVariables.add(captureMatch[1]);
    }

    // Collect for-loop iterator variables
    const forRegex = /\{%-?\s*for\s+(\w+)\s+in\s+/g;
    let forMatch: RegExpExecArray | null;
    while ((forMatch = forRegex.exec(template)) !== null) {
      assignedVariables.add(forMatch[1]);
    }

    // Check output tags {{ ... }} for unknown variables and filters
    const outputRegex = /\{\{-?\s*([^}]*?)\s*-?\}\}/g;
    let outputMatch: RegExpExecArray | null;

    while ((outputMatch = outputRegex.exec(template)) !== null) {
      const content = outputMatch[1].trim();
      const { line, column } = getLineAndColumn(template, outputMatch.index);

      if (!content) continue;

      // Split by pipes to get expression and filters
      const parts = content.split("|").map((p) => p.trim());
      const expression = parts[0];

      // Check the variable/expression
      if (expression) {
        // Skip string literals, numbers, booleans
        if (
          /^['"]/.test(expression) ||
          /^\d+(\.\d+)?$/.test(expression) ||
          expression === "true" ||
          expression === "false" ||
          expression === "nil" ||
          expression === "null" ||
          expression === "blank" ||
          expression === "empty"
        ) {
          // Literal – no check needed
        } else {
          const rootVar = expression.split(".")[0].split("[")[0].trim();

          if (
            rootVar &&
            !schemaObjects.includes(rootVar) &&
            !assignedVariables.has(rootVar) &&
            !builtinVariables.has(rootVar)
          ) {
            const allKnown = [
              ...schemaObjects,
              ...Array.from(assignedVariables),
              ...Array.from(builtinVariables),
            ];
            const suggestion = findClosestMatch(rootVar, allKnown);

            errors.push({
              type: "semantic",
              line,
              column,
              message: `Unknown variable "${rootVar}"`,
              severity: "warning",
              ...(suggestion
                ? { suggestion: `Did you mean "${suggestion}"?` }
                : {}),
            });
          }
        }
      }

      // Check filters
      for (let i = 1; i < parts.length; i++) {
        const filterPart = parts[i].trim();
        const filterName = filterPart.split(":")[0].split(" ")[0].trim();

        if (filterName && !allFilterNames.has(filterName)) {
          const suggestion = findClosestMatch(
            filterName,
            Array.from(allFilterNames),
          );

          errors.push({
            type: "semantic",
            line,
            column,
            message: `Unknown filter "${filterName}"`,
            severity: "warning",
            ...(suggestion
              ? { suggestion: `Did you mean "${suggestion}"?` }
              : {}),
          });
        }
      }
    }

    // Check unknown tag names in {% ... %}
    const tagRegex = /\{%-?\s*(\w+)/g;
    let tagMatch: RegExpExecArray | null;

    while ((tagMatch = tagRegex.exec(template)) !== null) {
      const tagName = tagMatch[1];
      const { line, column } = getLineAndColumn(template, tagMatch.index);

      if (
        !allTagNames.has(tagName) &&
        !CLOSING_TO_OPENING[tagName] &&
        !INTERMEDIATE_TAGS.has(tagName) &&
        !customTags.includes(tagName)
      ) {
        errors.push({
          type: "semantic",
          line,
          column,
          message: `Unknown tag "${tagName}"`,
          severity: "warning",
        });
      }
    }

    // AST-based type checking (enhanced validation layer)
    try {
      const parseResult = parseLiquidAST(template);

      if (parseResult.ast.length > 0) {
        // Build scope from AST
        const astScope = new ScopeTracker();
        astScope.buildFromAST(parseResult.ast);

        // Run type checker with scope context (pass customFilters so they're not flagged)
        const typeIssues = this.typeChecker.walkAndCheck(
          parseResult.ast,
          undefined,
          astScope,
          customFilters,
        );

        // Merge AST-based issues into errors (avoid duplicates)
        const existingMessages = new Set(
          errors.map((e) => `${e.line}:${e.message}`),
        );
        for (const issue of typeIssues) {
          const key = `${issue.line}:${issue.message}`;
          if (!existingMessages.has(key)) {
            errors.push({
              type: "semantic",
              line: issue.line,
              column: issue.column,
              message: issue.message,
              severity: issue.severity,
            });
          }
        }
      }
    } catch {
      // AST parsing may fail on malformed templates; regex checks above still apply
    }

    return errors;
  }

  /**
   * Validate security: flag potentially dangerous unescaped output patterns.
   */
  validateSecurity(template: string): ValidationError[] {
    const errors: ValidationError[] = [];

    // Sensitive objects that should be escaped
    const sensitivePatterns = [
      { pattern: /\{\{-?\s*request\b[^}]*-?\}\}/g, label: "request" },
      { pattern: /\{\{-?\s*form\b[^}]*-?\}\}/g, label: "form" },
      {
        pattern: /\{\{-?\s*customer\..*?-?\}\}/g,
        label: "customer",
      },
    ];

    for (const { pattern, label } of sensitivePatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(template)) !== null) {
        const content = match[0];

        // Check if escape filter is applied
        if (!content.includes("| escape") && !content.includes("|escape")) {
          const { line, column } = getLineAndColumn(template, match.index);

          errors.push({
            type: "security",
            line,
            column,
            message: `Potentially unsafe unescaped output of "${label}" object — XSS risk`,
            severity: "warning",
            suggestion: `Add the "escape" filter: {{ ${label}... | escape }}`,
          });
        }
      }
    }

    // Flag raw tag usage as informational
    const rawRegex = /\{%-?\s*raw\s*-?%\}/g;
    let rawMatch: RegExpExecArray | null;
    while ((rawMatch = rawRegex.exec(template)) !== null) {
      const { line, column } = getLineAndColumn(template, rawMatch.index);
      errors.push({
        type: "security",
        line,
        column,
        message:
          'Usage of {% raw %} disables Liquid processing — ensure content is trusted',
        severity: "info",
      });
    }

    return errors;
  }

  /**
   * Attempt to load custom tag/filter definitions for a project from the database.
   * This is a stub that can be wired to a real DB client.
   */
  private async loadCustomDefinitions(
    _projectId: string,
  ): Promise<{ tags: string[]; filters: string[] }> {
    // In production, this would query the database:
    // const { data } = await supabase.from('custom_liquid_tags').select('name').eq('project_id', projectId);
    // For now, return empty arrays – the caller handles this gracefully.
    return { tags: [], filters: [] };
  }
}
