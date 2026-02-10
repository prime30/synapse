/**
 * REQ-52 Task 5: Basic syntax validators for CSS and Liquid.
 *
 * Used by the TokenApplicator to verify that file content is still
 * syntactically valid after token replacements — before writing to DB.
 */

import type { ValidationResult } from './types';

// ---------------------------------------------------------------------------
// CSS validator
// ---------------------------------------------------------------------------

/**
 * Lightweight CSS syntax check:
 *  1. Balanced curly braces `{ }`
 *  2. No unmatched single or double quotes
 *  3. Balanced parentheses `( )`
 */
export function validateCSS(content: string): ValidationResult {
  const errors: string[] = [];

  // --- balanced braces ---
  let braceDepth = 0;
  let parenDepth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === '\\') {
      escaped = true;
      continue;
    }

    // Toggle quote tracking
    if (ch === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }
    if (ch === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    // Skip characters inside strings
    if (inSingleQuote || inDoubleQuote) continue;

    if (ch === '{') braceDepth++;
    if (ch === '}') braceDepth--;
    if (ch === '(') parenDepth++;
    if (ch === ')') parenDepth--;

    if (braceDepth < 0) {
      errors.push(`Unexpected closing brace '}' at position ${i}`);
      braceDepth = 0; // reset to keep scanning
    }
    if (parenDepth < 0) {
      errors.push(`Unexpected closing parenthesis ')' at position ${i}`);
      parenDepth = 0;
    }
  }

  if (inSingleQuote) errors.push('Unmatched single quote');
  if (inDoubleQuote) errors.push('Unmatched double quote');
  if (braceDepth > 0) errors.push(`${braceDepth} unclosed brace(s) '{'`);
  if (parenDepth > 0) errors.push(`${parenDepth} unclosed parenthesis '('`);

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Liquid validator
// ---------------------------------------------------------------------------

/** Liquid block tags that require a matching `end*` tag. */
const LIQUID_BLOCK_TAGS = new Set([
  'if',
  'unless',
  'case',
  'for',
  'tablerow',
  'capture',
  'comment',
  'raw',
  'paginate',
  'form',
  'style',
  'schema',
  'javascript',
]);

/**
 * Lightweight Liquid syntax check:
 *  1. Matched `{% tag %}` / `{% endtag %}` pairs.
 *  2. Balanced `{{ }}` output tags.
 */
export function validateLiquid(content: string): ValidationResult {
  const errors: string[] = [];

  // --- matched block tags ---
  const tagStack: string[] = [];
  const blockTagRegex = /\{%-?\s*(end)?(\w+)[^}]*?-?%\}/g;

  let match: RegExpExecArray | null;
  while ((match = blockTagRegex.exec(content)) !== null) {
    const isEnd = !!match[1];
    const tagName = match[2];

    if (!LIQUID_BLOCK_TAGS.has(tagName)) continue;

    if (isEnd) {
      if (tagStack.length === 0) {
        errors.push(`Unexpected {% end${tagName} %} with no matching open tag`);
      } else {
        const expected = tagStack.pop()!;
        if (expected !== tagName) {
          errors.push(
            `Mismatched Liquid tags: expected {% end${expected} %}, found {% end${tagName} %}`,
          );
        }
      }
    } else {
      tagStack.push(tagName);
    }
  }

  for (const remaining of tagStack) {
    errors.push(`Unclosed Liquid tag: {% ${remaining} %}`);
  }

  // --- balanced output delimiters ---
  const openOutputs = (content.match(/\{\{/g) ?? []).length;
  const closeOutputs = (content.match(/\}\}/g) ?? []).length;
  if (openOutputs !== closeOutputs) {
    errors.push(
      `Unmatched Liquid output tags: ${openOutputs} opening '{{' vs ${closeOutputs} closing '}}'`,
    );
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Auto-detect validator
// ---------------------------------------------------------------------------

/**
 * Pick the right validator based on file extension / path.
 * Returns `{ valid: true, errors: [] }` for unknown file types.
 */
export function validateByFileType(filePath: string, content: string): ValidationResult {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.css') || lower.endsWith('.scss')) {
    return validateCSS(content);
  }
  if (lower.endsWith('.liquid')) {
    // Liquid files may contain embedded CSS; validate both layers
    const liquidResult = validateLiquid(content);
    return liquidResult;
  }
  // Unknown file type — skip validation
  return { valid: true, errors: [] };
}
