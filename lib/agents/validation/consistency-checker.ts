import type { CodeChange, FileContext } from '@/lib/types/agent';

export interface ConsistencyIssue {
  severity: 'warning' | 'info';
  description: string;
  affectedFiles: string[];
}

/** Check cross-file consistency between proposed changes and original files */
export function checkCrossFileConsistency(
  changes: CodeChange[],
  originalFiles: FileContext[]
): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];

  // Extract class names from Liquid changes (includes general subagents changing Liquid files)
  const isLiquidFile = (c: { agentType: string; fileName: string }) =>
    c.agentType === 'liquid' || (c.agentType.startsWith('general') && c.fileName.endsWith('.liquid'));
  const isCssFile = (c: { agentType: string; fileName: string }) =>
    c.agentType === 'css' || (c.agentType.startsWith('general') && /\.(css|scss)$/.test(c.fileName));
  const isJsFile = (c: { agentType: string; fileName: string }) =>
    c.agentType === 'javascript' || (c.agentType.startsWith('general') && /\.(js|ts)$/.test(c.fileName));

  const liquidChanges = changes.filter(isLiquidFile);
  const cssChanges = changes.filter(isCssFile);
  const jsChanges = changes.filter(isJsFile);

  // Check: new classes in Liquid should have CSS selectors
  for (const liquidChange of liquidChanges) {
    const classMatches = liquidChange.proposedContent.match(
      /class="([^"]+)"/g
    );
    if (!classMatches) continue;

    for (const match of classMatches) {
      const classes = match
        .replace(/class="/, '')
        .replace(/"/, '')
        .split(/\s+/);

      for (const className of classes) {
        if (!className || className.includes('{')) continue;

        // Check if class exists in CSS changes or original CSS files
        const inCSSChanges = cssChanges.some(
          (c) =>
            c.proposedContent.includes(`.${className}`) ||
            c.proposedContent.includes(`#${className}`)
        );
        const inOriginalCSS = originalFiles
          .filter((f) => f.fileType === 'css')
          .some(
            (f) =>
              f.content.includes(`.${className}`) ||
              f.content.includes(`#${className}`)
          );

        if (!inCSSChanges && !inOriginalCSS) {
          issues.push({
            severity: 'warning',
            description: `Class "${className}" used in Liquid but no matching CSS selector found`,
            affectedFiles: [
              liquidChange.fileName,
              ...cssChanges.map((c) => c.fileName),
            ],
          });
        }
      }
    }
  }

  // Check: function calls in Liquid should match JS definitions
  for (const liquidChange of liquidChanges) {
    const funcCalls = liquidChange.proposedContent.match(
      /(\w+)\s*\(/g
    );
    if (!funcCalls) continue;

    for (const call of funcCalls) {
      const funcName = call.replace(/\s*\($/, '');
      if (['if', 'for', 'while', 'render', 'include', 'assign'].includes(funcName)) continue;

      const inJSChanges = jsChanges.some((c) =>
        c.proposedContent.includes(`function ${funcName}`) ||
        c.proposedContent.includes(`const ${funcName}`) ||
        c.proposedContent.includes(`let ${funcName}`)
      );
      const inOriginalJS = originalFiles
        .filter((f) => f.fileType === 'javascript')
        .some(
          (f) =>
            f.content.includes(`function ${funcName}`) ||
            f.content.includes(`const ${funcName}`)
        );

      if (!inJSChanges && !inOriginalJS && funcName.length > 2) {
        issues.push({
          severity: 'info',
          description: `Function "${funcName}" called in Liquid but not found in JavaScript files`,
          affectedFiles: [
            liquidChange.fileName,
            ...jsChanges.map((c) => c.fileName),
          ],
        });
      }
    }
  }

  return issues;
}
