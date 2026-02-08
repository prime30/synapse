export interface ThemeFile {
  path: string;
  content: string;
}

export interface ThemeDependency {
  source: string;
  target: string;
}

export function analyzeThemeStructure(files: ThemeFile[]): ThemeDependency[] {
  const deps: ThemeDependency[] = [];
  const renderRegex = /\{%-?\s*(?:render|include)\s+['"]([^'"]+)['"]/g;

  for (const file of files) {
    let match: RegExpExecArray | null;
    while ((match = renderRegex.exec(file.content)) !== null) {
      deps.push({ source: file.path, target: `snippets/${match[1]}.liquid` });
    }
  }

  return deps;
}
