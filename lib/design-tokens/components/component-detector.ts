/**
 * REQ-52: Component Detection
 * Groups related theme files into logical components based on naming conventions
 * and directory structure. E.g., cart.liquid + cart.css + cart.js → "Cart" component.
 */

export interface DetectedComponent {
  /** Human-readable component name (e.g., "Cart", "Header", "Product Card") */
  name: string;
  /** Primary file path (the Liquid template if it exists) */
  primaryFile: string;
  /** All file paths belonging to this component */
  files: string[];
  /** Component type based on directory */
  type: 'section' | 'snippet' | 'css_class' | 'js_component';
  /** Directory the component lives in */
  directory: string;
}

interface FileEntry {
  path: string;
  name: string;
}

/**
 * Detect component groups from a list of theme file paths.
 * Groups files that share a base name across extensions.
 *
 * Examples:
 *  - sections/cart.liquid + assets/cart.css + assets/cart.js → "Cart" (section)
 *  - snippets/product-card.liquid + assets/product-card.css → "Product Card" (snippet)
 *  - sections/header.liquid alone → "Header" (section)
 */
export function detectComponents(files: FileEntry[]): DetectedComponent[] {
  // Build a map: baseName → files
  const baseNameMap = new Map<string, FileEntry[]>();

  for (const file of files) {
    const baseName = extractBaseName(file.path);
    if (!baseName) continue;

    const normalized = baseName.toLowerCase();
    if (!baseNameMap.has(normalized)) {
      baseNameMap.set(normalized, []);
    }
    baseNameMap.get(normalized)!.push(file);
  }

  const components: DetectedComponent[] = [];

  for (const [baseName, groupFiles] of baseNameMap) {
    // Only create a component if there's a Liquid file (the "template")
    // or if there are multiple related files (e.g., cart.css + cart.js)
    const liquidFile = groupFiles.find((f) => f.path.endsWith('.liquid'));
    const hasMultipleFiles = groupFiles.length > 1;

    if (!liquidFile && !hasMultipleFiles) continue;

    const primaryFile = liquidFile?.path ?? groupFiles[0].path;
    const type = inferComponentType(primaryFile);
    const directory = primaryFile.split('/')[0] ?? '';
    const displayName = toDisplayName(baseName);

    components.push({
      name: displayName,
      primaryFile,
      files: groupFiles.map((f) => f.path).sort(),
      type,
      directory,
    });
  }

  // Sort by name
  return components.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Extract the base name from a file path, stripping directory and extension.
 * "sections/cart-drawer.liquid" → "cart-drawer"
 * "assets/section-cart-drawer.css" → "cart-drawer" (strips "section-" prefix)
 */
function extractBaseName(path: string): string | null {
  const segments = path.split('/');
  const fileName = segments[segments.length - 1];
  if (!fileName) return null;

  // Remove extension
  const dotIndex = fileName.lastIndexOf('.');
  let base = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;

  // Strip common asset prefixes that mirror section/snippet names
  // e.g., "section-header.css" → "header", "component-card.js" → "card"
  base = base.replace(/^(?:section|snippet|component|template)-/i, '');

  return base || null;
}

/** Infer component type from the file's directory. */
function inferComponentType(
  filePath: string,
): 'section' | 'snippet' | 'css_class' | 'js_component' {
  const dir = filePath.split('/')[0]?.toLowerCase() ?? '';
  switch (dir) {
    case 'sections':
      return 'section';
    case 'snippets':
      return 'snippet';
    case 'assets': {
      if (filePath.endsWith('.js') || filePath.endsWith('.ts')) return 'js_component';
      return 'css_class';
    }
    default:
      return 'section';
  }
}

/** Convert a kebab-case base name to a display name: "cart-drawer" → "Cart Drawer" */
function toDisplayName(baseName: string): string {
  return baseName
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
