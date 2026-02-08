import type { RuleViolation } from '../static-rules';

export function analyzeCSS(content: string): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const lines = content.split('\n');

  // 1. Detect !important usage
  for (let i = 0; i < lines.length; i++) {
    const regex = /!important/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(lines[i])) !== null) {
      violations.push({
        line: i + 1,
        column: match.index + 1,
        rule: 'css/no-important',
        message:
          '!important usage — consider increasing specificity instead',
        originalCode: lines[i].trim(),
        suggestedCode: lines[i].trim().replace(/\s*!important/g, ''),
        severity: 'warning',
      });
    }
  }

  // 2. Detect duplicate properties within the same block
  const blockRegex = /\{([^}]*)\}/g;
  let blockMatch: RegExpExecArray | null;

  while ((blockMatch = blockRegex.exec(content)) !== null) {
    const blockContent = blockMatch[1];
    const blockStartOffset = blockMatch.index + 1;

    const declarations: Array<{ name: string; offset: number }> = [];
    const propRegex = /([\w-]+)\s*:/g;
    let propMatch: RegExpExecArray | null;

    while ((propMatch = propRegex.exec(blockContent)) !== null) {
      declarations.push({
        name: propMatch[1],
        offset: blockStartOffset + propMatch.index,
      });
    }

    const seen = new Map<string, number>();
    for (const decl of declarations) {
      if (seen.has(decl.name)) {
        const textBefore = content.substring(0, decl.offset);
        const lineNum = textBefore.split('\n').length;
        const lastNewline = textBefore.lastIndexOf('\n');
        const col = decl.offset - lastNewline;

        violations.push({
          line: lineNum,
          column: col,
          rule: 'css/no-duplicate-properties',
          message: `Duplicate property "${decl.name}" in the same block`,
          originalCode: lines[lineNum - 1]?.trim() ?? '',
          suggestedCode: `/* Remove duplicate "${decl.name}" or merge values */`,
          severity: 'warning',
        });
      } else {
        seen.set(decl.name, decl.offset);
      }
    }
  }

  // 3. Detect overly broad selectors (* selector)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match * as a standalone selector: at line start, after comma, or after whitespace
    if (
      /(?:^|[\s,])\*\s*(?:\{|,)/.test(line) ||
      /^\s*\*\s*$/.test(line)
    ) {
      violations.push({
        line: i + 1,
        column: line.indexOf('*') + 1,
        rule: 'css/no-universal-selector',
        message:
          'Universal selector (*) is overly broad — consider a more specific selector',
        originalCode: line.trim(),
        suggestedCode:
          '/* Replace * with a specific element or class selector */',
        severity: 'info',
      });
    }
  }

  return violations;
}
