/**
 * Monaco completion provider for locale/translation key completions
 * inside {{ 'KEY' | t }} or {{ "KEY" | t }} patterns.
 */

import type { editor, Position, IRange, CancellationToken } from 'monaco-editor';

export function createTranslationProvider(
  monaco: typeof import('monaco-editor'),
  getLocaleEntries: () => Array<{ key: string; value: string }>
): import('monaco-editor').languages.CompletionItemProvider {
  return {
    triggerCharacters: ["'", '"', '.'],

    provideCompletionItems(
      model: editor.ITextModel,
      position: Position,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by CompletionItemProvider interface
      _context: import('monaco-editor').languages.CompletionContext,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by CompletionItemProvider interface
      _token: CancellationToken
    ): import('monaco-editor').languages.ProviderResult<import('monaco-editor').languages.CompletionList> {
      const lineNumber = position.lineNumber;
      const column = position.column;
      const lineContent = model.getLineContent(lineNumber);

      // Detect when cursor is inside quotes that are followed by | t (possibly with other filters)
      const match = findTranslationQuoteContext(lineContent, column);
      if (!match) return { suggestions: [] };

      const { keyStart, keyEnd } = match;

      // Get the partial key the user has typed so far
      const prefix = lineContent.slice(keyStart - 1, column - 1);
      const entries = getLocaleEntries();

      // Filter entries by prefix and build completion items
      const suggestions = buildSuggestions(
        entries,
        prefix,
        monaco,
        lineNumber,
        keyStart,
        keyEnd
      );

      return { suggestions };
    },
  };
}

interface TranslationQuoteContext {
  quote: "'" | '"';
  keyStart: number;
  keyEnd: number;
}

/**
 * Find if the cursor is inside a translation pattern: {{ 'KEY' | t }} or {{ "KEY" | t }}
 * Returns the column range of the key (between quotes).
 */
function findTranslationQuoteContext(
  lineContent: string,
  column: number
): TranslationQuoteContext | null {
  // Look for pattern: {{ ' or {{ " followed eventually by | t
  const openDouble = /\{\{\s*"/;
  const openSingle = /\{\{\s*'/;

  let best: TranslationQuoteContext | null = null;

  for (const [re, quote] of [
    [openSingle, "'"] as const,
    [openDouble, '"'] as const,
  ]) {
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(lineContent)) !== null) {
      const quoteStart = m.index + m[0].length; // column of first char after quote
      const closeQuote = lineContent.indexOf(quote, quoteStart);
      if (closeQuote === -1) continue;

      const keyEnd = closeQuote;
      const pipeMatch = lineContent.slice(closeQuote + 1).match(/\|\s*t\b/);
      if (!pipeMatch) continue;

      // Cursor must be between the opening quote and closing quote (1-based columns)
      const keyStartCol = quoteStart + 1; // 1-based
      const keyEndCol = keyEnd + 1; // 1-based

      if (column >= keyStartCol && column <= keyEndCol) {
        if (!best || quoteStart > (best.keyStart - 1)) {
          best = {
            quote: quote as "'" | '"',
            keyStart: keyStartCol,
            keyEnd: keyEndCol,
          };
        }
      }
    }
  }

  return best;
}

function buildSuggestions(
  entries: Array<{ key: string; value: string }>,
  prefix: string,
  monaco: typeof import('monaco-editor'),
  lineNumber: number,
  keyStart: number,
  keyEnd: number
): import('monaco-editor').languages.CompletionItem[] {
  const CompletionItemKind = monaco.languages.CompletionItemKind.Value;

  // For prefix "general." we want keys like "general.submit", "general.cancel"
  // For prefix "" we want all top-level keys or full keys
  const normalizedPrefix = prefix.trim();

  const matches = entries.filter((entry) => {
    if (normalizedPrefix === '') return true;
    if (entry.key === normalizedPrefix) return true;
    if (entry.key.startsWith(normalizedPrefix + '.')) return true;
    return false;
  });

  // Deduplicate and optionally collapse to "next segment" for dot completion
  const seen = new Set<string>();
  const items: import('monaco-editor').languages.CompletionItem[] = [];

  for (const { key, value } of matches) {
    let insertKey = key;
    let label = key;

    if (normalizedPrefix && key.startsWith(normalizedPrefix + '.')) {
      const suffix = key.slice(normalizedPrefix.length + 1);
      const nextDot = suffix.indexOf('.');
      if (nextDot >= 0) {
        insertKey = normalizedPrefix + '.' + suffix.slice(0, nextDot);
        label = insertKey;
      }
    }

    if (seen.has(insertKey)) continue;
    seen.add(insertKey);

    const range: IRange = {
      startLineNumber: lineNumber,
      startColumn: keyStart,
      endLineNumber: lineNumber,
      endColumn: keyEnd,
    };

    items.push({
      label,
      kind: CompletionItemKind,
      detail: value.length > 80 ? value.slice(0, 77) + '...' : value,
      documentation: value,
      insertText: insertKey,
      range,
    });
  }

  return items;
}
