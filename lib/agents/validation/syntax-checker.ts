export interface SyntaxError {
  line: number;
  message: string;
  severity: 'error' | 'warning';
}

/** Check Liquid code for common syntax issues */
export function checkLiquid(code: string): SyntaxError[] {
  const errors: SyntaxError[] = [];
  const lines = code.split('\n');
  const tagStack: Array<{ tag: string; line: number }> = [];

  const openTags = ['if', 'unless', 'for', 'case', 'capture', 'form', 'paginate', 'tablerow', 'comment', 'raw', 'schema', 'style', 'javascript'];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Check for opening tags
    const openMatch = line.match(/\{%-?\s*(if|unless|for|case|capture|form|paginate|tablerow|comment|raw|schema|style|javascript)\b/);
    if (openMatch && openTags.includes(openMatch[1])) {
      tagStack.push({ tag: openMatch[1], line: lineNum });
    }

    // Check for closing tags
    const closeMatch = line.match(/\{%-?\s*end(\w+)/);
    if (closeMatch) {
      const expectedTag = closeMatch[1];
      if (tagStack.length === 0) {
        errors.push({ line: lineNum, message: `Unexpected {% end${expectedTag} %} with no matching opening tag`, severity: 'error' });
      } else {
        const top = tagStack.pop()!;
        if (top.tag !== expectedTag) {
          errors.push({ line: lineNum, message: `Mismatched tag: expected {% end${top.tag} %} but found {% end${expectedTag} %}`, severity: 'error' });
        }
      }
    }
  }

  // Unclosed tags
  for (const unclosed of tagStack) {
    errors.push({ line: unclosed.line, message: `Unclosed {% ${unclosed.tag} %} tag`, severity: 'error' });
  }

  return errors;
}

/** Check JavaScript code for common syntax issues */
export function checkJavaScript(code: string): SyntaxError[] {
  const errors: SyntaxError[] = [];
  const lines = code.split('\n');

  let braceCount = 0;
  let parenCount = 0;
  let bracketCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Strip strings and comments for brace counting
    const stripped = line.replace(/(["'`])(?:(?!\1|\\).|\\.)*\1/g, '""').replace(/\/\/.*$/, '');

    for (const ch of stripped) {
      if (ch === '{') braceCount++;
      if (ch === '}') braceCount--;
      if (ch === '(') parenCount++;
      if (ch === ')') parenCount--;
      if (ch === '[') bracketCount++;
      if (ch === ']') bracketCount--;
    }

    if (braceCount < 0) {
      errors.push({ line: lineNum, message: 'Extra closing brace }', severity: 'error' });
      braceCount = 0;
    }
    if (parenCount < 0) {
      errors.push({ line: lineNum, message: 'Extra closing parenthesis )', severity: 'error' });
      parenCount = 0;
    }
  }

  if (braceCount > 0) {
    errors.push({ line: lines.length, message: `${braceCount} unclosed brace(s) {`, severity: 'error' });
  }
  if (parenCount > 0) {
    errors.push({ line: lines.length, message: `${parenCount} unclosed parenthesis(es) (`, severity: 'error' });
  }
  if (bracketCount !== 0) {
    errors.push({ line: lines.length, message: 'Mismatched brackets []', severity: 'error' });
  }

  return errors;
}

/** Check CSS code for common syntax issues */
export function checkCSS(code: string): SyntaxError[] {
  const errors: SyntaxError[] = [];
  const lines = code.split('\n');

  let braceCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    for (const ch of line) {
      if (ch === '{') braceCount++;
      if (ch === '}') braceCount--;
    }

    if (braceCount < 0) {
      errors.push({ line: lineNum, message: 'Extra closing brace }', severity: 'error' });
      braceCount = 0;
    }
  }

  if (braceCount > 0) {
    errors.push({ line: lines.length, message: `${braceCount} unclosed brace(s) {`, severity: 'error' });
  }

  return errors;
}
