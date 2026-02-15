// ── Types ────────────────────────────────────────────────────────────────────

/**
 * Represents a lightweight DOM element for comparison.
 */
export interface DOMElement {
  tag: string;
  id?: string;
  classes?: string[];
  text?: string;
  children?: DOMElement[];
  visible?: boolean;
  /** For img elements: the src attribute */
  src?: string;
}

/**
 * A snapshot of the page DOM at a point in time.
 */
export interface DOMSnapshot {
  url?: string;
  elements: DOMElement[];
}

/**
 * A detected structural regression between before and after snapshots.
 */
export interface StructuralRegression {
  type: 'missing_element' | 'broken_image' | 'visibility_change' | 'section_removed';
  description: string;
  severity: 'error' | 'warning';
  /** CSS-like selector or description of the affected element */
  element?: string;
}

/**
 * Result of comparing before/after DOM snapshots.
 */
export interface PreviewVerificationResult {
  passed: boolean;
  regressions: StructuralRegression[];
  /** Formatted string describing regressions for agent review */
  formatted: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Recursively flatten a DOM element tree for easy lookup.
 */
export function flattenElements(elements: DOMElement[]): DOMElement[] {
  const result: DOMElement[] = [];
  for (const el of elements) {
    result.push(el);
    if (el.children && el.children.length > 0) {
      result.push(...flattenElements(el.children));
    }
  }
  return result;
}

/**
 * Check if an element represents a Shopify section
 * (id starts with 'shopify-section-' or has 'shopify-section' class).
 */
function isShopifySection(el: DOMElement): boolean {
  if (el.id?.startsWith('shopify-section-')) return true;
  if (el.classes?.includes('shopify-section')) return true;
  return false;
}

/**
 * Get a human-readable identifier for an element.
 */
function describeElement(el: DOMElement): string {
  if (el.id) return `${el.tag}#${el.id}`;
  if (el.classes && el.classes.length > 0) return `${el.tag}.${el.classes[0]}`;
  return el.tag;
}

// ── Main function ────────────────────────────────────────────────────────────

/**
 * Compare before and after DOM snapshots to detect structural regressions.
 *
 * This is a lightweight structural comparison — not pixel-perfect, but catches
 * major breakage like missing sections, broken images, and visibility changes.
 */
export function compareSnapshots(
  before: DOMSnapshot,
  after: DOMSnapshot,
): PreviewVerificationResult {
  const regressions: StructuralRegression[] = [];

  const beforeFlat = flattenElements(before.elements);
  const afterFlat = flattenElements(after.elements);

  // Build lookup maps by ID for efficient comparison
  const afterById = new Map<string, DOMElement>();
  for (const el of afterFlat) {
    if (el.id) afterById.set(el.id, el);
  }

  const beforeById = new Map<string, DOMElement>();
  for (const el of beforeFlat) {
    if (el.id) beforeById.set(el.id, el);
  }

  // 1. Missing elements: elements with IDs in "before" that are absent in "after"
  for (const el of beforeFlat) {
    if (!el.id) continue;
    if (!afterById.has(el.id)) {
      // Check if it's a Shopify section (higher severity)
      if (isShopifySection(el)) {
        regressions.push({
          type: 'section_removed',
          description: `Section removed: ${el.id} no longer present`,
          severity: 'error',
          element: describeElement(el),
        });
      } else {
        regressions.push({
          type: 'missing_element',
          description: `Element ${describeElement(el)} no longer present in DOM`,
          severity: 'warning',
          element: describeElement(el),
        });
      }
    }
  }

  // 2. Broken images: img elements in "after" with empty/undefined src
  for (const el of afterFlat) {
    if (el.tag === 'img' && (!el.src || el.src.trim() === '')) {
      regressions.push({
        type: 'broken_image',
        description: `Broken image: ${describeElement(el)} has empty src`,
        severity: 'warning',
        element: describeElement(el),
      });
    }
  }

  // 3. Visibility changes: elements that went from visible to hidden
  for (const el of beforeFlat) {
    if (!el.id || el.visible !== true) continue;
    const afterEl = afterById.get(el.id);
    if (afterEl && afterEl.visible === false) {
      regressions.push({
        type: 'visibility_change',
        description: `Visibility change: ${describeElement(el)} changed from visible to hidden`,
        severity: 'warning',
        element: describeElement(el),
      });
    }
  }

  // Determine pass/fail: only error-severity regressions fail
  const errorCount = regressions.filter((r) => r.severity === 'error').length;
  const passed = errorCount === 0;

  // Format for agent review
  const formatted = formatRegressions(regressions);

  return { passed, regressions, formatted };
}

// ── Formatting ───────────────────────────────────────────────────────────────

function formatRegressions(regressions: StructuralRegression[]): string {
  if (regressions.length === 0) return '';

  const lines: string[] = ['[Preview Regressions]'];
  for (const reg of regressions) {
    lines.push(`- [${reg.severity}] ${reg.description}`);
  }
  return lines.join('\n');
}
