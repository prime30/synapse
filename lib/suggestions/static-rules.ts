import { analyzeLiquid } from './rules/liquid-rules';
import { analyzeJavaScript } from './rules/javascript-rules';
import { analyzeCSS } from './rules/css-rules';

export interface RuleViolation {
  line: number;
  column: number;
  rule: string;
  message: string;
  originalCode: string;
  suggestedCode: string;
  severity: 'error' | 'warning' | 'info';
}

/**
 * Normalize a fileType string or file extension into a known category.
 */
function resolveCategory(
  fileType: string,
  fileName: string,
): 'javascript' | 'css' | 'liquid' | 'unknown' {
  const type = fileType.toLowerCase().replace(/^\./, '');
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';

  if (
    ['javascript', 'typescript', 'js', 'ts', 'jsx', 'tsx'].includes(type) ||
    ['js', 'ts', 'jsx', 'tsx'].includes(ext)
  ) {
    return 'javascript';
  }

  if (
    ['css', 'scss', 'sass', 'less'].includes(type) ||
    ['css', 'scss', 'sass', 'less'].includes(ext)
  ) {
    return 'css';
  }

  if (type === 'liquid' || ext === 'liquid') {
    return 'liquid';
  }

  return 'unknown';
}

/**
 * Routes files to the appropriate static-analysis rule set based on type.
 */
export class StaticRuleEngine {
  analyzeFile(
    content: string,
    fileType: string,
    fileName: string,
  ): RuleViolation[] {
    const category = resolveCategory(fileType, fileName);

    switch (category) {
      case 'javascript':
        return analyzeJavaScript(content);
      case 'css':
        return analyzeCSS(content);
      case 'liquid':
        return analyzeLiquid(content);
      default:
        return [];
    }
  }
}
