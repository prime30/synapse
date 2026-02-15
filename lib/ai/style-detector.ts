/**
 * Phase 6b: Detect coding style from project files.
 * Analyzes Liquid, CSS, and JS files to infer conventions.
 */

export interface StyleProfile {
  indentation: 'tabs' | '2-spaces' | '4-spaces' | 'mixed';
  quoteStyle: 'single' | 'double' | 'mixed';
  semicolons: boolean;
  trailingCommas: boolean;
  maxLineLength: number;
  cssNamingConvention: 'BEM' | 'kebab-case' | 'camelCase' | 'mixed';
  liquidWhitespace: 'compact' | 'spaced';  // {{var}} vs {{ var }}
  sectionSchemaStyle: 'inline' | 'separate';
}

/**
 * Analyze a batch of file contents and return a style profile.
 */
export function detectStyle(files: Array<{ path: string; content: string }>): StyleProfile {
  const indentCounts = { tabs: 0, two: 0, four: 0 };
  const quoteCounts = { single: 0, double: 0 };
  let semiCount = 0;
  let noSemiCount = 0;
  let trailingCommaCount = 0;
  let noTrailingCommaCount = 0;
  let maxLine = 0;
  const cssSelectorPatterns = { bem: 0, kebab: 0, camel: 0 };
  let liquidCompact = 0;
  let liquidSpaced = 0;
  let sectionInline = 0;
  let sectionSeparate = 0;

  for (const file of files) {
    const lines = file.content.split('\n');
    for (const line of lines) {
      if (line.length > maxLine) maxLine = line.length;

      // Detect indentation
      if (line.startsWith('\t')) indentCounts.tabs++;
      else if (line.startsWith('    ')) indentCounts.four++;
      else if (line.startsWith('  ') && !line.startsWith('    ')) indentCounts.two++;

      // Detect quotes (JS/Liquid)
      const singleMatches = line.match(/'/g);
      const doubleMatches = line.match(/"/g);
      if (singleMatches) quoteCounts.single += singleMatches.length;
      if (doubleMatches) quoteCounts.double += doubleMatches.length;

      // Detect semicolons (CSS/JS lines)
      const trimmed = line.trim();
      if (trimmed.length > 0 && !trimmed.startsWith('//') && !trimmed.startsWith('/*') && !trimmed.startsWith('*')) {
        if (trimmed.endsWith(';')) semiCount++;
        else if (trimmed.match(/[a-zA-Z0-9"'\])}]$/)) noSemiCount++;
      }

      // Detect trailing commas
      if (trimmed.endsWith(',')) trailingCommaCount++;
      if (trimmed.match(/[a-zA-Z0-9"'}\]]$/) && !trimmed.endsWith(';')) noTrailingCommaCount++;
    }

    // Detect CSS naming conventions
    if (file.path.endsWith('.css') || file.path.endsWith('.scss')) {
      const bemPattern = /\.([\w-]+)__([\w-]+)(--[\w-]+)?/g;
      const kebabPattern = /\.([\w]+-[\w-]+)/g;
      const camelPattern = /\.([a-z][a-zA-Z]+[A-Z][\w]*)/g;
      const bemMatches = file.content.match(bemPattern);
      const kebabMatches = file.content.match(kebabPattern);
      const camelMatches = file.content.match(camelPattern);
      if (bemMatches) cssSelectorPatterns.bem += bemMatches.length;
      if (kebabMatches) cssSelectorPatterns.kebab += kebabMatches.length;
      if (camelMatches) cssSelectorPatterns.camel += camelMatches.length;
    }

    // Detect Liquid whitespace style
    if (file.path.endsWith('.liquid')) {
      const compactMatches = file.content.match(/\{\{[^ ]/g);
      const spacedMatches = file.content.match(/\{\{ /g);
      if (compactMatches) liquidCompact += compactMatches.length;
      if (spacedMatches) liquidSpaced += spacedMatches.length;

      // Section schema style
      if (file.content.includes('{% schema %}')) {
        // If schema is near the end, it is inline
        const schemaIdx = file.content.indexOf('{% schema %}');
        const proportion = schemaIdx / file.content.length;
        if (proportion > 0.7) sectionInline++;
        else sectionSeparate++;
      }
    }
  }

  // Determine values
  const indentation: StyleProfile['indentation'] =
    indentCounts.tabs > indentCounts.two && indentCounts.tabs > indentCounts.four ? 'tabs'
    : indentCounts.two > indentCounts.four ? '2-spaces'
    : indentCounts.four > 0 ? '4-spaces'
    : 'mixed';

  const quoteStyle: StyleProfile['quoteStyle'] =
    quoteCounts.single > quoteCounts.double * 1.5 ? 'single'
    : quoteCounts.double > quoteCounts.single * 1.5 ? 'double'
    : 'mixed';

  const cssNaming: StyleProfile['cssNamingConvention'] =
    cssSelectorPatterns.bem > cssSelectorPatterns.kebab && cssSelectorPatterns.bem > cssSelectorPatterns.camel ? 'BEM'
    : cssSelectorPatterns.camel > cssSelectorPatterns.kebab ? 'camelCase'
    : cssSelectorPatterns.kebab > 0 ? 'kebab-case'
    : 'mixed';

  return {
    indentation: indentation,
    quoteStyle: quoteStyle,
    semicolons: semiCount > noSemiCount,
    trailingCommas: trailingCommaCount > noTrailingCommaCount * 0.3,
    maxLineLength: Math.min(maxLine, 200),
    cssNamingConvention: cssNaming,
    liquidWhitespace: liquidSpaced > liquidCompact ? 'spaced' : 'compact',
    sectionSchemaStyle: sectionSeparate > sectionInline ? 'separate' : 'inline',
  };
}

/**
 * Format a style profile as a concise system prompt injection.
 */
export function formatStyleGuide(profile: StyleProfile): string {
  const rules: string[] = [];
  rules.push('Indentation: ' + profile.indentation);
  rules.push('Quote style: ' + profile.quoteStyle);
  rules.push('Semicolons: ' + (profile.semicolons ? 'yes' : 'no'));
  rules.push('Trailing commas: ' + (profile.trailingCommas ? 'yes' : 'no'));
  rules.push('Max line length: ~' + profile.maxLineLength);
  rules.push('CSS naming: ' + profile.cssNamingConvention);
  rules.push('Liquid whitespace: ' + profile.liquidWhitespace);
  rules.push('Section schema: ' + profile.sectionSchemaStyle);
  return '[Project Code Style]\n' + rules.join('\n');
}
