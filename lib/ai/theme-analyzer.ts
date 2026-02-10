import { classifyThemePath } from '@/lib/shopify/theme-structure';

export interface ThemeFile {
  path: string;
  content: string;
}

export interface ThemeDependency {
  source: string;
  target: string;
}

const RENDER_INCLUDE_REGEX =
  /\{%-?\s*(?:render|include)\s+['"]([^'"]+)['"]/g;

/**
 * Analyze theme structure and extract dependencies using the theme structure model.
 * - Section/snippet: render and include → snippets
 * - Template → section: from JSON "sections" entries with "type"
 */
export function analyzeThemeStructure(files: ThemeFile[]): ThemeDependency[] {
  const deps: ThemeDependency[] = [];

  for (const file of files) {
    const classification = classifyThemePath(file.path);

    // Section/snippet → snippet (render, include)
    let match: RegExpExecArray | null;
    RENDER_INCLUDE_REGEX.lastIndex = 0;
    while ((match = RENDER_INCLUDE_REGEX.exec(file.content)) !== null) {
      const name = match[1];
      const snippetPath = name.endsWith('.liquid')
        ? `snippets/${name}`
        : `snippets/${name}.liquid`;
      deps.push({ source: file.path, target: snippetPath });
    }

    // Template → section (from JSON sections with type)
    if (classification.role === 'template' && file.path.endsWith('.json')) {
      try {
        const data = JSON.parse(file.content) as {
          sections?: Record<string, { type?: string }>;
        };
        const sections = data.sections ?? {};
        for (const key of Object.keys(sections)) {
          const sectionType = sections[key]?.type;
          if (sectionType) {
            const sectionPath = sectionType.endsWith('.liquid')
              ? `sections/${sectionType}`
              : `sections/${sectionType}.liquid`;
            deps.push({ source: file.path, target: sectionPath });
          }
        }
      } catch {
        // ignore invalid JSON
      }
    }
  }

  return deps;
}
