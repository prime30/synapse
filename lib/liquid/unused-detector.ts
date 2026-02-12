/**
 * Regex-based detection of unused variables and orphan snippets in Liquid templates.
 * Standalone — no AST parser imports.
 */

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface UnusedVariable {
  name: string;
  line: number;
  column: number;
}

export interface OrphanSnippet {
  filename: string;
  path: string;
}

// ── Variable usage ──────────────────────────────────────────────────────────────

/**
 * Check if variable is used anywhere in the file except within its own declaration.
 */
function isVariableUsedExcludingDeclaration(
  source: string,
  varName: string,
  declStart: number,
  declEnd: number
): boolean {
  const escaped = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const usageRe = new RegExp(`\\b${escaped}\\b`, 'g');
  let match: RegExpExecArray | null;
  while ((match = usageRe.exec(source)) !== null) {
    if (match.index < declStart || match.index >= declEnd) {
      return true;
    }
  }
  return false;
}

// ── detectUnusedVariables ───────────────────────────────────────────────────────

/**
 * Cross-references {% assign %} declarations against usage in the same file.
 * Returns variables that are assigned but never used.
 */
export function detectUnusedVariables(source: string): UnusedVariable[] {
  const result: UnusedVariable[] = [];
  const assignRe = /\{%\s*assign\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=/g;

  let match: RegExpExecArray | null;
  while ((match = assignRe.exec(source)) !== null) {
    const varName = match[1];
    const declStart = match.index;
    const declEnd = match.index + match[0].length;

    const used = isVariableUsedExcludingDeclaration(source, varName, declStart, declEnd);
    if (!used) {
      const { line, column } = getLineColumn(source, match.index);
      result.push({ name: varName, line, column });
    }
  }

  return result;
}

function getLineColumn(source: string, offset: number): { line: number; column: number } {
  const before = source.slice(0, offset);
  const line = (before.match(/\n/g)?.length ?? 0) + 1;
  const lastNewline = before.lastIndexOf('\n');
  const column = lastNewline === -1 ? offset + 1 : offset - lastNewline;
  return { line, column };
}

// ── detectOrphanSnippets ───────────────────────────────────────────────────────

/**
 * Cross-references snippet files against {% render %} calls across all files.
 * Returns snippets that are never referenced.
 */
export function detectOrphanSnippets(
  snippetFiles: string[],
  allFileContents: Map<string, string>
): OrphanSnippet[] {
  const referencedSnippets = new Set<string>();

  for (const content of allFileContents.values()) {
    const renderRe = /\{%\s*render\s+['"]([a-zA-Z0-9_-]+)['"]/g;
    let match: RegExpExecArray | null;
    while ((match = renderRe.exec(content)) !== null) {
      referencedSnippets.add(match[1]);
    }
  }

  const result: OrphanSnippet[] = [];
  for (const file of snippetFiles) {
    const baseName = file.replace(/\.liquid$/i, '');
    if (!referencedSnippets.has(baseName)) {
      const filename = file.split(/[/\\]/).pop() ?? file;
      result.push({ filename, path: file });
    }
  }
  return result;
}
