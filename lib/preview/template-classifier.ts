/**
 * Template classifier -- maps Shopify theme template file paths to
 * structured metadata for the preview dropdown.
 */

import type { PreviewResourceType } from '@/lib/types/preview';

// ── Types ─────────────────────────────────────────────────────────────

export interface TemplateEntry {
  fileId: string | null;
  filePath: string;
  templateType: string;
  variant: string | null;
  label: string;
  group: number;
  needsResource: boolean;
  resourceType: PreviewResourceType | null;
  previewBasePath: string;
  disabled: boolean;
  iconKey: string;
}

// ── Template type metadata ────────────────────────────────────────────

interface TemplateTypeMeta {
  label: string;
  group: number;
  previewBasePath: string;
  needsResource: boolean;
  resourceType: PreviewResourceType | null;
  disabled: boolean;
  iconKey: string;
}

const TEMPLATE_TYPE_MAP: Record<string, TemplateTypeMeta> = {
  index: {
    label: 'Home page',
    group: 0,
    previewBasePath: '/',
    needsResource: false,
    resourceType: null,
    disabled: false,
    iconKey: 'home',
  },
  product: {
    label: 'Products',
    group: 0,
    previewBasePath: '/products/',
    needsResource: true,
    resourceType: 'product',
    disabled: false,
    iconKey: 'tag',
  },
  collection: {
    label: 'Collections',
    group: 0,
    previewBasePath: '/collections/',
    needsResource: true,
    resourceType: 'collection',
    disabled: false,
    iconKey: 'tags',
  },
  'list-collections': {
    label: 'Collections list',
    group: 0,
    previewBasePath: '/collections',
    needsResource: false,
    resourceType: null,
    disabled: false,
    iconKey: 'list',
  },
  gift_card: {
    label: 'Gift card',
    group: 0,
    previewBasePath: '/gift_cards/lookup',
    needsResource: false,
    resourceType: null,
    disabled: false,
    iconKey: 'gift',
  },
  cart: {
    label: 'Cart',
    group: 1,
    previewBasePath: '/cart',
    needsResource: false,
    resourceType: null,
    disabled: false,
    iconKey: 'cart',
  },
  article: {
    label: 'Blog posts',
    group: 2,
    previewBasePath: '/blogs/',
    needsResource: true,
    resourceType: 'blog',
    disabled: false,
    iconKey: 'article',
  },
  page: {
    label: 'Pages',
    group: 2,
    previewBasePath: '/pages/',
    needsResource: true,
    resourceType: 'page',
    disabled: false,
    iconKey: 'page',
  },
  blog: {
    label: 'Blogs',
    group: 2,
    previewBasePath: '/blogs/',
    needsResource: true,
    resourceType: 'blog',
    disabled: false,
    iconKey: 'book',
  },
  search: {
    label: 'Search',
    group: 3,
    previewBasePath: '/search',
    needsResource: false,
    resourceType: null,
    disabled: false,
    iconKey: 'search',
  },
  password: {
    label: 'Password',
    group: 3,
    previewBasePath: '/',
    needsResource: false,
    resourceType: null,
    disabled: true,
    iconKey: 'lock',
  },
  '404': {
    label: '404 page',
    group: 3,
    previewBasePath: '/404',
    needsResource: false,
    resourceType: null,
    disabled: false,
    iconKey: 'globe',
  },
  customers: {
    label: 'Customer accounts',
    group: 4,
    previewBasePath: '/account',
    needsResource: false,
    resourceType: null,
    disabled: true,
    iconKey: 'user',
  },
};

// ── Classifier ────────────────────────────────────────────────────────

/**
 * Parse a template path like `templates/product.with-video.json` into
 * a structured TemplateEntry. Returns `null` for non-template paths.
 */
export function classifyTemplateFile(
  path: string,
  fileId?: string | null
): TemplateEntry | null {
  const normalized = path.replace(/\\/g, '/').replace(/^\//, '');
  if (!normalized.startsWith('templates/')) return null;

  const rest = normalized.slice('templates/'.length);

  // Handle customers/ subdirectory
  if (rest.startsWith('customers/')) {
    const baseName = rest.slice('customers/'.length);
    const nameWithoutExt = baseName.replace(/\.(json|liquid)$/, '');
    const meta = TEMPLATE_TYPE_MAP['customers'];
    return {
      fileId: fileId ?? null,
      filePath: normalized,
      templateType: 'customers',
      variant: nameWithoutExt,
      label: `Customer: ${nameWithoutExt.replace(/[_-]/g, ' ')}`,
      group: meta.group,
      needsResource: meta.needsResource,
      resourceType: meta.resourceType,
      previewBasePath: meta.previewBasePath,
      disabled: meta.disabled,
      iconKey: meta.iconKey,
    };
  }

  // Remove extension (.json or .liquid)
  const nameWithoutExt = rest.replace(/\.(json|liquid)$/, '');

  // Split on dots: first part is template type, rest is variant
  // e.g. "product.with-video" -> type="product", variant="with-video"
  // e.g. "product" -> type="product", variant=null
  const dotIndex = nameWithoutExt.indexOf('.');
  const templateType = dotIndex >= 0 ? nameWithoutExt.slice(0, dotIndex) : nameWithoutExt;
  const variant = dotIndex >= 0 ? nameWithoutExt.slice(dotIndex + 1) : null;

  const meta = TEMPLATE_TYPE_MAP[templateType];

  if (!meta) {
    // Unknown template type
    return {
      fileId: fileId ?? null,
      filePath: normalized,
      templateType,
      variant,
      label: variant
        ? `${templateType} (${variant})`
        : templateType.replace(/[_-]/g, ' '),
      group: 5,
      needsResource: false,
      resourceType: null,
      previewBasePath: '/',
      disabled: false,
      iconKey: 'file',
    };
  }

  const label = variant ? `${meta.label} (${variant})` : meta.label;

  return {
    fileId: fileId ?? null,
    filePath: normalized,
    templateType,
    variant,
    label,
    group: meta.group,
    needsResource: meta.needsResource,
    resourceType: meta.resourceType,
    previewBasePath: meta.previewBasePath,
    disabled: meta.disabled,
    iconKey: meta.iconKey,
  };
}

// ── Builder ───────────────────────────────────────────────────────────

const DEFAULT_ENTRIES: TemplateEntry[] = [
  'index', 'product', 'collection', 'cart', 'page', 'blog', 'search', '404',
].map((type) => {
  const meta = TEMPLATE_TYPE_MAP[type]!;
  return {
    fileId: null,
    filePath: `templates/${type}.json`,
    templateType: type,
    variant: null,
    label: meta.label,
    group: meta.group,
    needsResource: meta.needsResource,
    resourceType: meta.resourceType,
    previewBasePath: meta.previewBasePath,
    disabled: meta.disabled,
    iconKey: meta.iconKey,
  };
});

/**
 * Build template entries from a list of project files.
 * Filters for template files, classifies, sorts, and returns entries.
 * Falls back to sensible defaults when no template files exist.
 */
export function buildTemplateEntries(
  files: { id: string; path: string }[]
): TemplateEntry[] {
  const entries: TemplateEntry[] = [];

  for (const file of files) {
    const entry = classifyTemplateFile(file.path, file.id);
    if (entry) {
      entries.push(entry);
    }
  }

  if (entries.length === 0) {
    return DEFAULT_ENTRIES;
  }

  // Sort by group, then label
  entries.sort((a, b) => {
    if (a.group !== b.group) return a.group - b.group;
    // Default (variant=null) comes before variants within same type
    if (a.templateType === b.templateType) {
      if (a.variant === null && b.variant !== null) return -1;
      if (a.variant !== null && b.variant === null) return 1;
    }
    return a.label.localeCompare(b.label);
  });

  return entries;
}

/**
 * Get unique template types that have at least one entry.
 * Used for the main dropdown list (collapsed view).
 */
export function getUniqueTemplateTypes(
  entries: TemplateEntry[]
): TemplateEntry[] {
  const seen = new Set<string>();
  const result: TemplateEntry[] = [];
  for (const entry of entries) {
    if (!seen.has(entry.templateType)) {
      seen.add(entry.templateType);
      // Pick the default (variant=null) or first entry for each type
      const defaultEntry = entries.find(
        (e) => e.templateType === entry.templateType && e.variant === null
      );
      result.push(defaultEntry ?? entry);
    }
  }
  return result;
}

/**
 * Get all entries of a specific template type (for sub-menu).
 */
export function getTemplateVariants(
  entries: TemplateEntry[],
  templateType: string
): TemplateEntry[] {
  return entries.filter((e) => e.templateType === templateType);
}
