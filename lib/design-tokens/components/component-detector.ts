/**
 * REQ-52: Component Detection
 * Groups related theme files into logical components based on naming conventions
 * and directory structure. E.g., cart.liquid + cart.css + cart.js → "Cart" component.
 */

export interface ButtonTokenSet {
  background?: string;
  color?: string;
  borderColor?: string;
  borderRadius?: string;
  padding?: string;
}

/** Semantic component classification (content-aware). */
export type SemanticComponentType =
  | 'card'
  | 'form'
  | 'navigation'
  | 'modal'
  | 'badge'
  | null;

/** Token set for a semantic component (colors, spacing, typography). */
export interface SemanticTokenSet {
  colors?: string[];
  spacing?: string[];
  typography?: string[];
}

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
  /** Button variant names (e.g. primary, secondary, outline, ghost) */
  variants?: string[];
  /** Token set per variant for button components */
  buttonTokenSet?: Record<string, ButtonTokenSet>;
  /** Content-aware semantic classification */
  semanticType?: SemanticComponentType;
  /** Token set for semantic components (colors, spacing, typography) */
  semanticTokenSet?: SemanticTokenSet;
  /** Icon metadata (Phase 10c): name, viewBox, fill pattern */
  iconMetadata?: {
    name: string;
    viewBox?: string;
    fillPattern: 'currentColor' | 'hardcoded';
  };
}

export interface FileInput {
  path: string;
  content: string;
}

/**
 * Detect component groups from a list of theme files (with content for content-aware detection).
 * Groups files that share a base name across extensions.
 *
 * Examples:
 *  - sections/cart.liquid + assets/cart.css + assets/cart.js → "Cart" (section)
 *  - snippets/product-card.liquid + assets/product-card.css → "Product Card" (snippet)
 *  - sections/header.liquid alone → "Header" (section)
 */
export function detectComponents(files: FileInput[]): DetectedComponent[] {
  const baseNameMap = new Map<string, FileInput[]>();

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
    const liquidFile = groupFiles.find((f) => f.path.endsWith('.liquid'));
    const hasMultipleFiles = groupFiles.length > 1;

    if (!liquidFile && !hasMultipleFiles) continue;

    const primaryFile = liquidFile?.path ?? groupFiles[0].path;
    const type = inferComponentType(primaryFile);
    const directory = primaryFile.split('/')[0] ?? '';
    const displayName = toDisplayName(baseName);

    const comp: DetectedComponent = {
      name: displayName,
      primaryFile,
      files: groupFiles.map((f) => f.path).sort(),
      type,
      directory,
    };

    const buttonInfo = detectButtonComponent(groupFiles);
    if (buttonInfo) {
      comp.variants = buttonInfo.variants;
      comp.buttonTokenSet = buttonInfo.tokenSet;
    }

    const semanticInfo = detectSemanticComponent(groupFiles);
    if (semanticInfo) {
      comp.semanticType = semanticInfo.type;
      comp.semanticTokenSet = semanticInfo.tokenSet;
    }

    // Icon: snippets/icon-*.liquid — store metadata in iconMetadata (type stays 'snippet')
    if (primaryFile.includes('/') && primaryFile.split('/')[0] === 'snippets') {
      const fileName = primaryFile.split('/').pop() ?? '';
      if (/^icon-/.test(fileName)) {
        comp.iconMetadata = detectIconMetadata(groupFiles, baseName);
      }
    }

    components.push(comp);
  }

  return components.sort((a, b) => a.name.localeCompare(b.name));
}

const BUTTON_CSS_PATTERNS = [
  /\.btn\b/,
  /\.button\b/,
  /\.t4s-btn\b/,
  /\.shopify-payment-button\b/,
  /\.btn-primary\b/,
  /\.btn-secondary\b/,
];

const BUTTON_LIQUID_PATTERNS = [
  /<button\b/,
  /<a\s+[^>]*class="[^"]*btn/,
  /\{%\s*render\s+['"]button/,
];

// ---------------------------------------------------------------------------
// Semantic component detection (Phase 10b)
// ---------------------------------------------------------------------------

const SEMANTIC_PATTERNS: {
  type: SemanticComponentType;
  patterns: RegExp[];
}[] = [
  {
    type: 'card',
    patterns: [
      /\.card\b/,
      /product-card/,
      /\.grid-item\b/,
      /\.card__/,
      /class="[^"]*card[^"]*"/,
    ],
  },
  {
    type: 'form',
    patterns: [
      /<form\b/,
      /\.form-/,
      /<input\b/,
      /<select\b/,
      /<textarea\b/,
    ],
  },
  {
    type: 'navigation',
    patterns: [
      /<nav\b/,
      /\.nav-/,
      /\.menu-/,
      /breadcrumb/,
      /aria-label="[^"]*nav/,
    ],
  },
  {
    type: 'modal',
    patterns: [
      /\.modal\b/,
      /\.drawer\b/,
      /<dialog\b/,
      /aria-modal/,
      /\.popup\b/,
    ],
  },
  {
    type: 'badge',
    patterns: [
      /\.badge\b/,
      /\.tag\b/,
      /\.label\b/,
    ],
  },
];

function extractSemanticTokenSet(content: string): SemanticTokenSet {
  const tokenSet: SemanticTokenSet = {};
  const colors = content.match(
    /(?:color|background(?:-color)?|border-color|fill)\s*:\s*([^;}{]+)/gi,
  );
  if (colors) {
    tokenSet.colors = colors.map((m) => m.split(/\s*:\s*/)[1]?.trim() ?? '').filter(Boolean);
  }
  const spacing = content.match(
    /(?:margin|padding|gap)\s*:\s*([^;}{]+)/gi,
  );
  if (spacing) {
    tokenSet.spacing = spacing.map((m) => m.split(/\s*:\s*/)[1]?.trim() ?? '').filter(Boolean);
  }
  const typo = content.match(
    /(?:font-size|font-family|font-weight|line-height)\s*:\s*([^;}{]+)/gi,
  );
  if (typo) {
    tokenSet.typography = typo.map((m) => m.split(/\s*:\s*/)[1]?.trim() ?? '').filter(Boolean);
  }
  return tokenSet;
}

// ---------------------------------------------------------------------------
// Icon metadata detection (Phase 10c)
// ---------------------------------------------------------------------------

function detectIconMetadata(
  files: FileInput[],
  baseName: string,
): { name: string; viewBox?: string; fillPattern: 'currentColor' | 'hardcoded' } {
  const allContent = files.map((f) => f.content).join('\n');
  const viewBoxMatch = allContent.match(/viewBox\s*=\s*["']([^"']+)["']/i);
  const viewBox = viewBoxMatch?.[1];
  const hasCurrentColor =
    /fill\s*=\s*["']currentColor["']/i.test(allContent) ||
    /fill:\s*currentColor/i.test(allContent);
  const hasHardcodedFill =
    /fill\s*=\s*["']#[0-9a-fA-F]{3,8}["']/i.test(allContent) ||
    /fill:\s*#[0-9a-fA-F]{3,8}/i.test(allContent) ||
    /fill:\s*rgb/i.test(allContent);
  const fillPattern: 'currentColor' | 'hardcoded' =
    hasCurrentColor && !hasHardcodedFill ? 'currentColor' : 'hardcoded';
  const name = baseName.startsWith('icon') ? baseName : `icon-${baseName}`;
  return {
    name,
    viewBox,
    fillPattern,
  };
}

function detectSemanticComponent(
  files: FileInput[],
): { type: SemanticComponentType; tokenSet: SemanticTokenSet } | null {
  const allContent = files.map((f) => f.content).join('\n');
  for (const { type, patterns } of SEMANTIC_PATTERNS) {
    for (const re of patterns) {
      if (re.test(allContent)) {
        const tokenSet = extractSemanticTokenSet(allContent);
        return { type, tokenSet };
      }
    }
  }
  return null;
}

function detectButtonComponent(files: FileInput[]): { variants: string[]; tokenSet: Record<string, ButtonTokenSet> } | null {
  let hasButton = false;
  const allContent = files.map((f) => f.content).join('\n');

  for (const re of BUTTON_CSS_PATTERNS) {
    if (re.test(allContent)) {
      hasButton = true;
      break;
    }
  }
  if (!hasButton) {
    for (const re of BUTTON_LIQUID_PATTERNS) {
      if (re.test(allContent)) {
        hasButton = true;
        break;
      }
    }
  }
  if (!hasButton) return null;

  const variants: string[] = [];
  const tokenSet: Record<string, ButtonTokenSet> = {};

  const variantSuffixRe = /\.(?:btn|button|t4s-btn)(?:--|-)?([\w-]+)?\s*\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = variantSuffixRe.exec(allContent)) !== null) {
    const variant = m[1] ?? 'default';
    if (!variants.includes(variant)) variants.push(variant);

    const block = m[2];
    const tokens: ButtonTokenSet = {};
    const bgMatch = block.match(/(?:background(?:-color)?|background)\s*:\s*([^;]+)/i);
    if (bgMatch) tokens.background = bgMatch[1].trim();
    const colorMatch = block.match(/color\s*:\s*([^;]+)/i);
    if (colorMatch) tokens.color = colorMatch[1].trim();
    const borderMatch = block.match(/border(?:-color)?\s*:\s*([^;]+)/i);
    if (borderMatch) tokens.borderColor = borderMatch[1].trim();
    const radiusMatch = block.match(/border-radius\s*:\s*([^;]+)/i);
    if (radiusMatch) tokens.borderRadius = radiusMatch[1].trim();
    const padMatch = block.match(/padding\s*:\s*([^;]+)/i);
    if (padMatch) tokens.padding = padMatch[1].trim();

    if (Object.keys(tokens).length > 0) {
      tokenSet[variant] = tokens;
    }
  }

  if (variants.length === 0 && Object.keys(tokenSet).length === 0) {
    const simpleBtnRe = /\.(?:btn|button|t4s-btn)\s*\{([^}]+)\}/g;
    while ((m = simpleBtnRe.exec(allContent)) !== null) {
      const block = m[1];
      const tokens: ButtonTokenSet = {};
      const bgMatch = block.match(/(?:background(?:-color)?|background)\s*:\s*([^;]+)/i);
      if (bgMatch) tokens.background = bgMatch[1].trim();
      const colorMatch = block.match(/color\s*:\s*([^;]+)/i);
      if (colorMatch) tokens.color = colorMatch[1].trim();
      const radiusMatch = block.match(/border-radius\s*:\s*([^;]+)/i);
      if (radiusMatch) tokens.borderRadius = radiusMatch[1].trim();
      const padMatch = block.match(/padding\s*:\s*([^;]+)/i);
      if (padMatch) tokens.padding = padMatch[1].trim();
      if (Object.keys(tokens).length > 0) {
        tokenSet['default'] = tokens;
        if (!variants.includes('default')) variants.push('default');
      }
      break;
    }
  }

  return variants.length > 0 || Object.keys(tokenSet).length > 0 ? { variants, tokenSet } : null;
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

/** Infer component type from the file's directory and content (Phase 10c: icon). */
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
