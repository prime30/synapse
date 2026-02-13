/**
 * Detects Shopify theme file paths mentioned in AI response text.
 *
 * Recognizes paths like:
 *   sections/header.liquid
 *   templates/index.json
 *   assets/theme.css
 *   snippets/cart-drawer.liquid
 *   config/settings_schema.json
 *   layout/theme.liquid
 *   locales/en.default.json
 *
 * Returns an array of { path, start, end } for each match.
 */

export interface DetectedFilePath {
  /** The file path as it appeared in the text. */
  path: string;
  /** Start index in the source text. */
  start: number;
  /** End index in the source text. */
  end: number;
}

/**
 * Known Shopify theme directories.
 * Paths must start with one of these to be considered a theme file.
 */
const THEME_DIRS = [
  'sections',
  'templates',
  'snippets',
  'assets',
  'config',
  'layout',
  'locales',
  'blocks',
];

const THEME_EXTENSIONS = [
  '.liquid',
  '.json',
  '.css',
  '.js',
  '.scss',
  '.ts',
  '.svg',
];

// Build regex: (sections|templates|...) / path-segment(s) . extension
// Supports nested paths like templates/customers/account.liquid
const dirGroup = THEME_DIRS.join('|');
const extGroup = THEME_EXTENSIONS.map((e) => e.replace('.', '\\.')).join('|');
const FILE_PATH_RE = new RegExp(
  `(?:^|[\\s\`"'(\\[{,])((${dirGroup})\\/[\\w./-]+(?:${extGroup}))`,
  'gm',
);

/**
 * Detect Shopify theme file paths in a block of text.
 *
 * Skips paths inside markdown code fences (```) to avoid
 * double-matching code blocks that are separately rendered.
 */
export function detectFilePaths(text: string): DetectedFilePath[] {
  const results: DetectedFilePath[] = [];
  const seen = new Set<string>();

  // Build set of ranges to skip (inside code fences)
  const skipRanges: [number, number][] = [];
  const fenceRe = /```[\s\S]*?```/g;
  let fenceMatch: RegExpExecArray | null;
  while ((fenceMatch = fenceRe.exec(text)) !== null) {
    skipRanges.push([fenceMatch.index, fenceMatch.index + fenceMatch[0].length]);
  }

  function isInCodeFence(idx: number): boolean {
    return skipRanges.some(([start, end]) => idx >= start && idx < end);
  }

  let match: RegExpExecArray | null;
  FILE_PATH_RE.lastIndex = 0;

  while ((match = FILE_PATH_RE.exec(text)) !== null) {
    const fullMatch = match[0];
    const path = match[1];
    // The captured group starts after the leading whitespace/delimiter
    const pathStart = match.index + fullMatch.indexOf(path);
    const pathEnd = pathStart + path.length;

    if (isInCodeFence(pathStart)) continue;
    if (seen.has(path)) continue;
    seen.add(path);

    results.push({ path, start: pathStart, end: pathEnd });
  }

  return results;
}

/**
 * Given a list of known project file paths, resolve a detected path
 * to a file ID. Supports both exact match and basename-only match.
 */
export function resolveFileId(
  detectedPath: string,
  projectFiles: { id: string; path: string; name: string }[],
): string | null {
  // Exact path match
  const exact = projectFiles.find(
    (f) => f.path === detectedPath || f.path === `/${detectedPath}`,
  );
  if (exact) return exact.id;

  // Basename match (e.g. "mini-cart.liquid" → "snippets/mini-cart.liquid")
  const basename = detectedPath.split('/').pop();
  if (basename) {
    const byName = projectFiles.find((f) => f.name === basename);
    if (byName) return byName.id;
  }

  return null;
}
