/**
 * Shopify theme directory structure model.
 * Canonical hierarchy: layout/, templates/, sections/, snippets/, assets/, config/, locales/.
 */

export const THEME_DIRECTORIES = [
  'layout',
  'templates',
  'sections',
  'snippets',
  'assets',
  'config',
  'locales',
] as const;

export type ThemeDirectoryRole = (typeof THEME_DIRECTORIES)[number];

export type ThemeFileRole =
  | 'layout'
  | 'template'
  | 'section'
  | 'snippet'
  | 'asset'
  | 'config'
  | 'locale'
  | 'unknown';

export interface ThemeFileClassification {
  path: string;
  role: ThemeFileRole;
  directory: ThemeDirectoryRole | null;
  baseName: string;
  extension: string;
}

export interface ThemeContext {
  /** Files grouped by theme role */
  byRole: Record<ThemeFileRole, string[]>;
  /** All classifications in path order */
  classifications: ThemeFileClassification[];
  /** layout file path (e.g. layout/theme.liquid) if present */
  layoutPath: string | null;
  /** template paths (templates/*.json or templates/*.liquid) */
  templatePaths: string[];
  /** section paths (sections/*.liquid) */
  sectionPaths: string[];
  /** snippet paths (snippets/*.liquid) */
  snippetPaths: string[];
  /** asset paths (assets/*) */
  assetPaths: string[];
  /** Human-readable summary for prompts */
  summary: string;
}

/** Normalize path to use forward slashes and strip leading slash */
function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\//, '');
}

/**
 * Classify a file path into a Shopify theme role.
 */
export function classifyThemePath(path: string): ThemeFileClassification {
  const normalized = normalizePath(path);
  const parts = normalized.split('/');
  const baseName = parts[parts.length - 1] ?? '';
  const ext = baseName.includes('.') ? baseName.split('.').pop() ?? '' : '';

  if (parts.length >= 1) {
    const firstDir = parts[0]?.toLowerCase();
    if (firstDir === 'layout') {
      return {
        path: normalized,
        role: 'layout',
        directory: 'layout',
        baseName,
        extension: ext,
      };
    }
    if (firstDir === 'templates') {
      return {
        path: normalized,
        role: 'template',
        directory: 'templates',
        baseName,
        extension: ext,
      };
    }
    if (firstDir === 'sections') {
      return {
        path: normalized,
        role: 'section',
        directory: 'sections',
        baseName,
        extension: ext,
      };
    }
    if (firstDir === 'snippets') {
      return {
        path: normalized,
        role: 'snippet',
        directory: 'snippets',
        baseName,
        extension: ext,
      };
    }
    if (firstDir === 'assets') {
      return {
        path: normalized,
        role: 'asset',
        directory: 'assets',
        baseName,
        extension: ext,
      };
    }
    if (firstDir === 'config') {
      return {
        path: normalized,
        role: 'config',
        directory: 'config',
        baseName,
        extension: ext,
      };
    }
    if (firstDir === 'locales') {
      return {
        path: normalized,
        role: 'locale',
        directory: 'locales',
        baseName,
        extension: ext,
      };
    }
  }

  return {
    path: normalized,
    role: 'unknown',
    directory: null,
    baseName,
    extension: ext,
  };
}

/**
 * Build theme context from a list of file paths.
 * Used by agents and context pipeline to understand theme structure.
 */
export function getThemeContext(files: Array<{ path: string }>): ThemeContext {
  const classifications = files
    .map((f) => classifyThemePath(f.path))
    .sort((a, b) => a.path.localeCompare(b.path));

  const byRole: Record<ThemeFileRole, string[]> = {
    layout: [],
    template: [],
    section: [],
    snippet: [],
    asset: [],
    config: [],
    locale: [],
    unknown: [],
  };

  let layoutPath: string | null = null;
  const templatePaths: string[] = [];
  const sectionPaths: string[] = [];
  const snippetPaths: string[] = [];
  const assetPaths: string[] = [];

  for (const c of classifications) {
    byRole[c.role].push(c.path);
    switch (c.role) {
      case 'layout':
        layoutPath = c.path;
        break;
      case 'template':
        templatePaths.push(c.path);
        break;
      case 'section':
        sectionPaths.push(c.path);
        break;
      case 'snippet':
        snippetPaths.push(c.path);
        break;
      case 'asset':
        assetPaths.push(c.path);
        break;
      default:
        break;
    }
  }

  const parts: string[] = [];
  if (layoutPath) parts.push(`Layout: ${layoutPath}`);
  if (templatePaths.length) parts.push(`Templates: ${templatePaths.length}`);
  if (sectionPaths.length) parts.push(`Sections: ${sectionPaths.length}`);
  if (snippetPaths.length) parts.push(`Snippets: ${snippetPaths.length}`);
  if (assetPaths.length) parts.push(`Assets: ${assetPaths.length}`);
  if (byRole.config.length) parts.push(`Config: ${byRole.config.length}`);
  if (byRole.locale.length) parts.push(`Locales: ${byRole.locale.length}`);
  if (byRole.unknown.length) parts.push(`Other: ${byRole.unknown.length}`);

  const summary = parts.length
    ? `Theme structure: ${parts.join('; ')}.`
    : 'No theme structure detected (paths may not follow layout/templates/sections/snippets/assets).';

  return {
    byRole,
    classifications,
    layoutPath,
    templatePaths,
    sectionPaths,
    snippetPaths,
    assetPaths,
    summary,
  };
}

/**
 * Relationship rules: templates reference sections (via JSON),
 * sections render snippets, sections reference assets.
 */
export const THEME_STRUCTURE_DOC = `
Shopify theme directory structure:
- layout/: Single main layout (e.g. theme.liquid) wrapping all pages
- templates/: JSON or .liquid defining which sections render on each page type
- sections/: Reusable section .liquid files (with optional schema)
- snippets/: Reusable .liquid partials ({% render 'snippet' %})
- assets/: JS, CSS, images ({{ 'file.js' | asset_url }})
- config/: settings_schema.json, settings_data.json
- locales/: Translation JSON files
Relationships: layout wraps content; templates reference sections; sections render snippets and reference assets.
`.trim();
