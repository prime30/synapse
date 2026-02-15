/**
 * DOM Context Formatter for LLM consumption.
 *
 * Receives a raw DOM snapshot from the Shopify preview bridge
 * (via postMessage) and produces a token-capped, LLM-friendly
 * string describing the visible page structure.
 *
 * Token budget: ~3500 tokens (~14,000 characters at ~4 chars/token).
 */

const MAX_CHARS = 14_000; // ~3500 tokens

/** Raw element data from the preview bridge snapshot. */
export interface DOMSnapshotElement {
  tag: string;
  id?: string | null;
  classes?: string[];
  /** data-* attributes */
  dataAttributes?: Record<string, string>;
  /** Inline text content (truncated) */
  textPreview?: string;
  /** Computed styles (subset) */
  styles?: Record<string, string>;
  /** Bounding rect */
  rect?: { top: number; left: number; width: number; height: number };
  /** Shopify section ID if available */
  sectionId?: string;
  /** Whether this is an app block */
  isApp?: boolean;
  /** Child elements */
  children?: DOMSnapshotElement[];
}

export interface DOMSnapshot {
  /** Page URL */
  url?: string;
  /** Viewport dimensions */
  viewport?: { width: number; height: number };
  /** Root-level elements */
  elements: DOMSnapshotElement[];
  /** Timestamp of snapshot */
  timestamp?: number;
}

/**
 * Format a raw DOM snapshot into a concise LLM-friendly string.
 *
 * The output describes the page's visual structure, section boundaries,
 * key data attributes, and visible text — capped at ~3500 tokens.
 *
 * Returns empty string if the snapshot is empty or undefined.
 */
export function formatDOMContext(snapshot: DOMSnapshot | undefined | null): string {
  if (!snapshot || !snapshot.elements?.length) return '';

  const lines: string[] = [];

  // Header
  lines.push('## Live Preview DOM Context');
  if (snapshot.url) {
    lines.push(`Page: ${snapshot.url}`);
  }
  if (snapshot.viewport) {
    lines.push(`Viewport: ${snapshot.viewport.width}x${snapshot.viewport.height}`);
  }
  lines.push('');

  // Walk elements tree with depth limit
  const elementLines = formatElements(snapshot.elements, 0, 4);
  lines.push(...elementLines);

  // Cap output
  let result = lines.join('\n');
  if (result.length > MAX_CHARS) {
    result = result.slice(0, MAX_CHARS - 50) + '\n\n... (DOM context truncated to fit token budget)';
  }

  return result;
}

/** Recursively format elements with indentation and depth limit. */
function formatElements(
  elements: DOMSnapshotElement[],
  depth: number,
  maxDepth: number
): string[] {
  if (depth >= maxDepth) return [];

  const lines: string[] = [];
  const indent = '  '.repeat(depth);

  for (const el of elements) {
    const parts: string[] = [];

    // Tag + ID
    let tag = `<${el.tag}`;
    if (el.id) tag += `#${el.id}`;
    if (el.classes?.length) {
      // Show max 3 classes
      const cls = el.classes.slice(0, 3).join('.');
      tag += `.${cls}`;
      if (el.classes.length > 3) tag += `(+${el.classes.length - 3})`;
    }
    tag += '>';
    parts.push(tag);

    // Section ID
    if (el.sectionId) {
      parts.push(`[section: ${el.sectionId}]`);
    }

    // App block indicator
    if (el.isApp) {
      parts.push('[app-block]');
    }

    // Key data attributes (Shopify-relevant ones)
    if (el.dataAttributes) {
      const relevant = Object.entries(el.dataAttributes)
        .filter(([key]) =>
          key.startsWith('section') ||
          key.startsWith('block') ||
          key.startsWith('product') ||
          key.startsWith('variant') ||
          key === 'sectionId' ||
          key === 'sectionType' ||
          key === 'shopifyEditor'
        )
        .slice(0, 5);
      if (relevant.length > 0) {
        const attrs = relevant.map(([k, v]) => `data-${k}="${truncate(v, 40)}"`).join(' ');
        parts.push(`{${attrs}}`);
      }
    }

    // Text preview (truncated)
    if (el.textPreview) {
      const text = truncate(el.textPreview.trim(), 60);
      if (text) parts.push(`"${text}"`);
    }

    // Layout hints from rect
    if (el.rect && depth < 2) {
      parts.push(`(${Math.round(el.rect.width)}x${Math.round(el.rect.height)})`);
    }

    lines.push(`${indent}${parts.join(' ')}`);

    // Recurse into children
    if (el.children?.length) {
      lines.push(...formatElements(el.children, depth + 1, maxDepth));
    }
  }

  return lines;
}

/** Truncate a string to maxLen, appending "..." if truncated. */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

/**
 * Estimate the token count of a string.
 * Uses a rough heuristic: ~4 characters per token for English text.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ── EPIC V3: Diff-friendly output mode ──────────────────────────────────────

/**
 * Format a DOM snapshot into a flat, diff-friendly representation.
 *
 * Unlike formatDOMContext (which produces indented tree output for LLM prompts),
 * this produces a flat list of element descriptors suitable for structural
 * comparison between before/after snapshots.
 *
 * Each line describes one element:
 *   tag#id.class1.class2 [section:X] [visible:true] [src:url]
 *
 * Returns empty string if the snapshot is empty or undefined.
 */
export function formatDOMForDiff(snapshot: DOMSnapshot | undefined | null): string {
  if (!snapshot || !snapshot.elements?.length) return '';

  const lines: string[] = [];
  flattenForDiff(snapshot.elements, lines);

  let result = lines.join('\n');
  if (result.length > MAX_CHARS) {
    result = result.slice(0, MAX_CHARS - 50) + '\n... (truncated)';
  }

  return result;
}

/**
 * Convert a DOMSnapshot to the lightweight DOMElement format used by
 * preview-verifier's compareSnapshots function.
 */
export function snapshotToDOMElements(snapshot: DOMSnapshot | undefined | null): import('@/lib/agents/preview-verifier').DOMElement[] {
  if (!snapshot || !snapshot.elements?.length) return [];
  return snapshot.elements.map(convertElement);
}

function convertElement(el: DOMSnapshotElement): import('@/lib/agents/preview-verifier').DOMElement {
  return {
    tag: el.tag,
    id: el.id ?? undefined,
    classes: el.classes,
    text: el.textPreview,
    visible: el.styles?.display !== 'none' && el.styles?.visibility !== 'hidden',
    src: el.tag === 'img' ? el.dataAttributes?.src ?? el.styles?.backgroundImage : undefined,
    children: el.children?.map(convertElement),
  };
}

/** Recursively flatten elements into diff-friendly single-line descriptors. */
function flattenForDiff(elements: DOMSnapshotElement[], lines: string[]): void {
  for (const el of elements) {
    const parts: string[] = [];

    // Element descriptor
    let desc = el.tag;
    if (el.id) desc += `#${el.id}`;
    if (el.classes?.length) desc += `.${el.classes.slice(0, 4).join('.')}`;
    parts.push(desc);

    // Section info
    if (el.sectionId) parts.push(`[section:${el.sectionId}]`);

    // Visibility
    const isHidden = el.styles?.display === 'none' || el.styles?.visibility === 'hidden';
    parts.push(`[visible:${isHidden ? 'false' : 'true'}]`);

    // Image src
    if (el.tag === 'img' && el.dataAttributes?.src) {
      parts.push(`[src:${truncate(el.dataAttributes.src, 80)}]`);
    }

    lines.push(parts.join(' '));

    // Recurse
    if (el.children?.length) {
      flattenForDiff(el.children, lines);
    }
  }
}
