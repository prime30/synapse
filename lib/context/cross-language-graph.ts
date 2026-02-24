/**
 * Cross-language dependency graph for Shopify themes.
 * Tracks relationships between Liquid sections/snippets, CSS rules, and JS functions.
 *
 * Builds from file content using AST chunking and symbol extraction.
 * Cached in memory, invalidated on file change.
 */

export interface GraphNode {
  path: string;
  type: 'section' | 'snippet' | 'layout' | 'template' | 'css' | 'js' | 'json';
}

export interface GraphEdge {
  source: string;
  target: string;
  type: 'renders' | 'includes' | 'uses_class' | 'calls_function' | 'imports' | 'asset_ref';
  line?: number;
}

export interface ReferenceResult {
  file: string;
  line?: number;
  type: GraphEdge['type'];
  context?: string;
}

const RENDER_RE = /\{%[-\s]*(?:render|include)\s+['"]([^'"]+)['"]/g;
const SECTION_RE = /\{%[-\s]*section\s+['"]([^'"]+)['"]/g;
const ASSET_URL_RE = /['"]([^'"]+)\.(css|js)['"]\s*\|\s*asset_url/g;
const CSS_CLASS_USE_RE = /class\s*=\s*["']([^"']+)["']/g;
const JS_IMPORT_RE = /import\s+.*from\s+['"]([^'"]+)['"]/g;
const CSS_IMPORT_RE = /@import\s+(?:url\()?['"]([^'"]+)['"]/g;

export class ThemeDependencyGraph {
  private nodes = new Map<string, GraphNode>();
  private edges: GraphEdge[] = [];
  private reverseIndex = new Map<string, GraphEdge[]>();
  private cssClassToFile = new Map<string, string[]>();

  clear() {
    this.nodes.clear();
    this.edges = [];
    this.reverseIndex.clear();
    this.cssClassToFile.clear();
  }

  /**
   * Build the full graph from a set of theme files.
   */
  buildFromFiles(files: Array<{ path: string; content: string }>) {
    this.clear();

    // Register nodes
    for (const f of files) {
      const type = this.inferType(f.path);
      this.nodes.set(f.path, { path: f.path, type });
    }

    // Extract edges
    for (const f of files) {
      const ext = f.path.split('.').pop()?.toLowerCase();

      if (ext === 'liquid') {
        this.extractLiquidEdges(f.path, f.content);
      } else if (ext === 'css') {
        this.extractCSSEdges(f.path, f.content);
      } else if (ext === 'js') {
        this.extractJSEdges(f.path, f.content);
      }
    }

    // Build reverse index for O(1) lookups
    for (const edge of this.edges) {
      const existing = this.reverseIndex.get(edge.target) ?? [];
      existing.push(edge);
      this.reverseIndex.set(edge.target, existing);
    }
  }

  /**
   * Find all files that reference a given target.
   * e.g., findReferences('hero') returns all files that render/include 'hero'
   */
  findReferences(target: string): ReferenceResult[] {
    const results: ReferenceResult[] = [];

    // Direct reverse index lookup
    const directRefs = this.reverseIndex.get(target) ?? [];
    for (const edge of directRefs) {
      results.push({ file: edge.source, line: edge.line, type: edge.type });
    }

    // Fuzzy: try with/without extensions and path prefixes
    const variants = [
      target,
      target.replace(/\.liquid$/, ''),
      `snippets/${target}`,
      `snippets/${target}.liquid`,
      `sections/${target}`,
      `sections/${target}.liquid`,
    ];

    for (const variant of variants) {
      if (variant === target) continue;
      const refs = this.reverseIndex.get(variant) ?? [];
      for (const edge of refs) {
        if (!results.some(r => r.file === edge.source && r.type === edge.type)) {
          results.push({ file: edge.source, line: edge.line, type: edge.type });
        }
      }
    }

    return results;
  }

  /**
   * Find all files that use a specific CSS class.
   */
  findClassUsage(className: string): ReferenceResult[] {
    const files = this.cssClassToFile.get(className) ?? [];
    return files.map(f => ({ file: f, type: 'uses_class' as const }));
  }

  /**
   * Get direct dependencies of a file.
   */
  getDependencies(filePath: string): Array<{ target: string; type: GraphEdge['type'] }> {
    return this.edges
      .filter(e => e.source === filePath)
      .map(e => ({ target: e.target, type: e.type }));
  }

  /**
   * Get all dependents (files that depend on this file).
   */
  getDependents(filePath: string): Array<{ source: string; type: GraphEdge['type'] }> {
    const basename = filePath.split('/').pop()?.replace(/\.liquid$/, '') ?? filePath;
    const refs = this.findReferences(basename);
    return refs.map(r => ({ source: r.file, type: r.type }));
  }

  // ── Internal extraction ──────────────────────────────────────────────

  private extractLiquidEdges(filePath: string, content: string) {
    // render/include
    let match;
    const renderRe = new RegExp(RENDER_RE.source, 'g');
    while ((match = renderRe.exec(content)) !== null) {
      const line = content.slice(0, match.index).split('\n').length;
      this.edges.push({ source: filePath, target: match[1], type: 'renders', line });
    }

    // section
    const sectionRe = new RegExp(SECTION_RE.source, 'g');
    while ((match = sectionRe.exec(content)) !== null) {
      const line = content.slice(0, match.index).split('\n').length;
      this.edges.push({ source: filePath, target: match[1], type: 'includes', line });
    }

    // asset references
    const assetRe = new RegExp(ASSET_URL_RE.source, 'g');
    while ((match = assetRe.exec(content)) !== null) {
      this.edges.push({ source: filePath, target: `assets/${match[1]}.${match[2]}`, type: 'asset_ref' });
    }

    // CSS class usage (for reverse lookup)
    const classRe = new RegExp(CSS_CLASS_USE_RE.source, 'g');
    while ((match = classRe.exec(content)) !== null) {
      const classes = match[1].split(/\s+/).filter(Boolean);
      for (const cls of classes) {
        const existing = this.cssClassToFile.get(cls) ?? [];
        if (!existing.includes(filePath)) {
          existing.push(filePath);
          this.cssClassToFile.set(cls, existing);
        }
      }
    }
  }

  private extractCSSEdges(filePath: string, content: string) {
    let match;
    const importRe = new RegExp(CSS_IMPORT_RE.source, 'g');
    while ((match = importRe.exec(content)) !== null) {
      this.edges.push({ source: filePath, target: match[1], type: 'imports' });
    }

    // Extract class definitions for reverse class→file lookup
    const classDef = /\.([a-zA-Z_][\w-]*)\s*[{,:\s]/g;
    while ((match = classDef.exec(content)) !== null) {
      const cls = match[1];
      const existing = this.cssClassToFile.get(cls) ?? [];
      if (!existing.includes(filePath)) {
        existing.push(filePath);
        this.cssClassToFile.set(cls, existing);
      }
    }
  }

  private extractJSEdges(filePath: string, content: string) {
    let match;
    const importRe = new RegExp(JS_IMPORT_RE.source, 'g');
    while ((match = importRe.exec(content)) !== null) {
      this.edges.push({ source: filePath, target: match[1], type: 'imports' });
    }
  }

  private inferType(path: string): GraphNode['type'] {
    if (path.startsWith('sections/')) return 'section';
    if (path.startsWith('snippets/')) return 'snippet';
    if (path.startsWith('layout/')) return 'layout';
    if (path.startsWith('templates/')) return 'template';
    if (path.endsWith('.css')) return 'css';
    if (path.endsWith('.js')) return 'js';
    if (path.endsWith('.json')) return 'json';
    return 'snippet';
  }
}
