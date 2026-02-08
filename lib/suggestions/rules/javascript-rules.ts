import type { RuleViolation } from '../static-rules';

export function analyzeJavaScript(content: string): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip single-line comments and blank lines
    if (trimmed.startsWith('//') || trimmed === '') {
      continue;
    }

    // 1. Detect console.log statements
    {
      const regex = /\bconsole\.log\s*\(/g;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(line)) !== null) {
        violations.push({
          line: i + 1,
          column: match.index + 1,
          rule: 'js/no-console-log',
          message:
            'console.log statement found — remove before production',
          originalCode: trimmed,
          suggestedCode: '// Remove or replace with a proper logger',
          severity: 'warning',
        });
      }
    }

    // 2. Detect var usage (suggest let/const)
    {
      const regex = /\bvar\s+\w/g;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(line)) !== null) {
        violations.push({
          line: i + 1,
          column: match.index + 1,
          rule: 'js/no-var',
          message:
            '"var" is function-scoped — use "let" or "const" for block scoping',
          originalCode: trimmed,
          suggestedCode: trimmed.replace(/\bvar\b/, 'const'),
          severity: 'warning',
        });
      }
    }

    // 3. Detect == usage (suggest ===)
    {
      const regex = /(?<![!=])==(?!=)/g;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(line)) !== null) {
        violations.push({
          line: i + 1,
          column: match.index + 1,
          rule: 'js/eqeqeq',
          message:
            'Loose equality (==) can cause type coercion — use strict equality (===)',
          originalCode: trimmed,
          suggestedCode: trimmed.replace(/(?<![!=])==(?!=)/g, '==='),
          severity: 'warning',
        });
        // Only report once per line to avoid duplicate suggestions
        break;
      }
    }
  }

  return violations;
}
