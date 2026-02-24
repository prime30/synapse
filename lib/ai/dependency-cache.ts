/**
 * TODO: Wire into dependencies API route or ContextDrawer when a path-based
 * format is needed. The route at /api/projects/[projectId]/dependencies
 * currently uses DependencyDetector (lib/context/detector) with file IDs.
 */

export interface FileDependency {
  path: string;
  dependencies: string[]; // files this file references
}

export interface DependencyGraph {
  files: FileDependency[];
  generatedAt: string;
}

export function buildDependencyGraph(
  fileContents: Map<string, string>
): DependencyGraph {
  const files: FileDependency[] = [];

  for (const [path, content] of fileContents) {
    const deps: string[] = [];

    // Liquid render/include: {% render 'snippet-name' %} or {% include 'snippet-name' %}
    const liquidRefs = content.matchAll(
      /\{%[-\s]*(?:render|include)\s+['"]([^'"]+)['"]/g
    );
    for (const match of liquidRefs) {
      const ref = match[1];
      deps.push(ref.includes('/') ? ref : `snippets/${ref}.liquid`);
    }

    // Liquid section: {% section 'section-name' %}
    const sectionRefs = content.matchAll(
      /\{%[-\s]*section\s+['"]([^'"]+)['"]/g
    );
    for (const match of sectionRefs) {
      deps.push(`sections/${match[1]}.liquid`);
    }

    // CSS @import
    if (path.endsWith('.css')) {
      const cssImports = content.matchAll(/@import\s+['"]([^'"]+)['"]/g);
      for (const match of cssImports) deps.push(match[1]);
    }

    // JS import
    if (path.endsWith('.js') || path.endsWith('.ts')) {
      const jsImports = content.matchAll(
        /import\s+.*?from\s+['"]([^'"]+)['"]/g
      );
      for (const match of jsImports) deps.push(match[1]);
    }

    // asset_url references
    const assetRefs = content.matchAll(/['"]([^'"]+)['"]\s*\|\s*asset_url/g);
    for (const match of assetRefs) {
      deps.push(`assets/${match[1]}`);
    }

    files.push({ path, dependencies: [...new Set(deps)] });
  }

  return { files, generatedAt: new Date().toISOString() };
}
