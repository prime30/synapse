/**
 * Derive relevant Liquid files for the current preview page.
 *
 * Given a preview URL and a list of visible sections (from the bridge),
 * returns the template path plus section file paths -- excluding layout
 * and global assets.
 */

// -- Pathname to template type mapping ------------------------------------

const PATHNAME_TO_TEMPLATE: [RegExp, string][] = [
  [/^\/$/, 'index'],
  [/^\/index\/?$/, 'index'],
  [/^\/products\//, 'product'],
  [/^\/collections\/?$/, 'list-collections'],
  [/^\/collections\//, 'collection'],
  [/^\/cart\/?$/, 'cart'],
  [/^\/pages\//, 'page'],
  // Blog article: /blogs/{handle}/{article-handle}
  [/^\/blogs\/[^/]+\/[^/]+/, 'article'],
  // Blog listing: /blogs/{handle}
  [/^\/blogs\//, 'blog'],
  [/^\/search\/?$/, 'search'],
  [/^\/404\/?$/, '404'],
  [/^\/gift_cards\//, 'gift_card'],
  [/^\/account\/?/, 'customers'],
  [/^\/password\/?$/, 'password'],
];

/**
 * Map a storefront pathname (e.g. "/products/superweft") to a Shopify
 * template type (e.g. "product"). Returns null if unrecognised.
 */
export function pathnameToTemplateType(pathname: string): string | null {
  const clean = pathname.split('?')[0].split('#')[0];
  for (const [re, type] of PATHNAME_TO_TEMPLATE) {
    if (re.test(clean)) return type;
  }
  return null;
}

/**
 * Map a storefront pathname to the corresponding template file path,
 * e.g. "/products/foo" -> "templates/product.liquid".
 */
export function pathnameToTemplatePath(pathname: string): string | null {
  const type = pathnameToTemplateType(pathname);
  if (!type) return null;
  if (type === 'customers') return 'templates/customers/login.liquid';
  return `templates/${type}.liquid`;
}

// -- Section normalisation ------------------------------------------------

/**
 * Normalise a raw section ID by stripping common Shopify prefixes.
 * Mirrors the logic in AgentPromptPanel and synapse-bridge.js.
 */
function normalizeSectionId(raw: string): string {
  let id = raw.replace(/^shopify-section-/, '');
  const tplMatch = id.match(/^template--\d+__(.+)$/);
  if (tplMatch) id = tplMatch[1];
  return id;
}

// -- Related snippets per template/section ---------------------------------

/** Snippets to include when a given section (e.g. main-product) is visible. */
const SECTION_RELATED_SNIPPETS: Record<string, string[]> = {
  'main-product': ['snippets/product-form.liquid', 'snippets/product-form-dynamic.liquid', 'snippets/grouped-form.liquid'],
  'featured-product': ['snippets/product-form.liquid', 'snippets/product-form-dynamic.liquid'],
  'main-qv': ['snippets/product-form.liquid', 'snippets/product-form-dynamic.liquid'],
  'main-qs': ['snippets/product-form.liquid', 'snippets/product-form-dynamic.liquid'],
};

/** Snippets to include when on a given template type (e.g. product). */
const TEMPLATE_RELATED_SNIPPETS: Record<string, string[]> = {
  product: ['snippets/product-form.liquid', 'snippets/product-form-dynamic.liquid'],
  collection: ['snippets/product-card.liquid', 'snippets/card-product.liquid'],
  cart: ['snippets/cart-drawer.liquid', 'snippets/cart-item.liquid'],
};

// -- Public API -----------------------------------------------------------

export interface RelevantLiquidFiles {
  templatePath: string | null;
  sectionPaths: string[];
  /** Related snippet paths (e.g. product-form-dynamic when on product page). */
  snippetPaths: string[];
}

export interface VisibleSection {
  id: string | null;
  type: string;
}

/**
 * Derive the relevant Liquid files for a preview page.
 *
 * @param url - Full preview URL (or just a pathname).
 * @param visibleSections - Sections reported by the bridge.
 * @returns Template path (if determinable) and deduplicated, sorted section paths.
 */
export function deriveRelevantLiquidFiles(
  url: string,
  visibleSections: VisibleSection[],
): RelevantLiquidFiles {
  // Extract pathname from URL (may be full URL or relative)
  let pathname = '/';
  try {
    if (url.startsWith('http')) {
      pathname = new URL(url).pathname;
    } else {
      pathname = url.split('?')[0].split('#')[0] || '/';
    }
  } catch {
    pathname = url.split('?')[0].split('#')[0] || '/';
  }

  // If the URL goes through our proxy, extract the real storefront path
  const proxyMatch = pathname.match(/\/api\/projects\/[^/]+\/preview/);
  if (proxyMatch) {
    try {
      const u = new URL(url, 'http://localhost');
      const pathParam = u.searchParams.get('path');
      if (pathParam) pathname = pathParam;
    } catch {
      // fall through with original pathname
    }
  }

  const templatePath = pathnameToTemplatePath(pathname);

  // Derive section paths from visible sections
  const sectionSet = new Set<string>();
  for (const s of visibleSections) {
    const sectionType = s.type || (s.id ? normalizeSectionId(s.id) : '');
    if (sectionType && !/[/\\]/.test(sectionType)) {
      sectionSet.add(`sections/${sectionType}.liquid`);
    }
  }

  const sectionPaths = Array.from(sectionSet).sort();

  // Related snippets: from template type and from visible sections
  const snippetSet = new Set<string>();
  const templateType = pathnameToTemplateType(pathname);
  if (templateType && TEMPLATE_RELATED_SNIPPETS[templateType]) {
    for (const p of TEMPLATE_RELATED_SNIPPETS[templateType]) snippetSet.add(p);
  }
  for (const sectionPath of sectionPaths) {
    const sectionName = sectionPath.replace(/^sections\//, '').replace(/\.liquid$/, '');
    if (SECTION_RELATED_SNIPPETS[sectionName]) {
      for (const p of SECTION_RELATED_SNIPPETS[sectionName]) snippetSet.add(p);
    }
  }
  const snippetPaths = Array.from(snippetSet).sort();

  return { templatePath, sectionPaths, snippetPaths };
}

/**
 * Flatten the result into a single deduplicated list: template first, then sections, then related snippets.
 */
export function flattenRelevantFiles(result: RelevantLiquidFiles): string[] {
  const seen = new Set<string>();
  const files: string[] = [];
  const add = (path: string) => {
    if (path && !seen.has(path)) {
      seen.add(path);
      files.push(path);
    }
  };
  if (result.templatePath) add(result.templatePath);
  for (const sp of result.sectionPaths) add(sp);
  for (const sp of result.snippetPaths ?? []) add(sp);
  return files;
}
