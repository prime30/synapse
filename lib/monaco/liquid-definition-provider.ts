import type { editor, Position, CancellationToken } from 'monaco-editor';

export interface FileResolver {
  resolveFile(path: string): { uri: string; exists: boolean } | null;
}

interface PatternMatch {
  path: string;
  /** 0-based start column of the quoted string (inclusive) */
  startCol: number;
  /** 0-based end column of the quoted string (inclusive) */
  endCol: number;
}

function findMatchAtCursor(
  lineContent: string,
  cursorColumn: number
): PatternMatch | null {
  const cursorIdx = cursorColumn - 1;

  const patterns: Array<{
    regex: RegExp;
    map: (m: string) => string;
  }> = [
    { regex: /\{%\s*render\s+['"]([^'"]+)['"]/g, map: (m) => `snippets/${m}.liquid` },
    { regex: /\{%\s*section\s+['"]([^'"]+)['"]/g, map: (m) => `sections/${m}.liquid` },
    { regex: /\{%\s*include\s+['"]([^'"]+)['"]/g, map: (m) => `snippets/${m}.liquid` },
    { regex: /\{\{\s*['"]([^'"]+)['"]\s*\|\s*asset_url/g, map: (m) => `assets/${m}` },
  ];

  for (const { regex, map } of patterns) {
    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(lineContent)) !== null) {
      const contentStart = m.index + m[0].indexOf(m[1]);
      const quoteStart = contentStart - 1;
      const quoteEnd = contentStart + m[1].length;
      if (cursorIdx >= quoteStart && cursorIdx <= quoteEnd) {
        return {
          path: map(m[1]),
          startCol: quoteStart,
          endCol: quoteEnd,
        };
      }
    }
  }
  return null;
}

export function createLiquidDefinitionProvider(
  monaco: typeof import('monaco-editor'),
  fileResolver: FileResolver
): import('monaco-editor').languages.DefinitionProvider {
  return {
    provideDefinition(
      model: editor.ITextModel,
      position: Position,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by DefinitionProvider interface
      _token: CancellationToken
    ): import('monaco-editor').languages.Definition | undefined {
      const lineContent = model.getLineContent(position.lineNumber);
      const match = findMatchAtCursor(lineContent, position.column);
      if (!match) return undefined;

      const resolved = fileResolver.resolveFile(match.path);
      if (!resolved) return undefined;

      const uri = monaco.Uri.parse(resolved.uri);
      const range = { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 };

      return { uri, range };
    },
  };
}
