// ---------------------------------------------------------------------------
// Image Optimizer – image optimization recommendations
// ---------------------------------------------------------------------------

/** Types of image issues that can be detected. */
export type ImageIssueType =
  | 'no-lazy-loading'
  | 'no-srcset'
  | 'no-webp'
  | 'oversized'
  | 'no-alt'
  | 'no-width-height';

/** A single image optimisation issue. */
export interface ImageIssue {
  path: string;
  issue: ImageIssueType;
  recommendation: string;
  estimatedSavings?: string;
}

/** Full image analysis report. */
export interface ImageReport {
  issues: ImageIssue[];
  totalImages: number;
  optimizedCount: number;
  potentialSavings: string;
}

// ---------------------------------------------------------------------------
// Regex patterns
// ---------------------------------------------------------------------------

/** Matches `<img ...>` tags (self-closing or not). */
const IMG_TAG_RE = /<img\b[^>]*>/gi;

/** Matches Shopify `{{ ... | img_url ... }}` or `| image_url` filter usage. */
const SHOPIFY_IMG_RE = /\{\{[^}]*\|\s*(?:img_url|image_url)[^}]*\}\}/gi;

/** Attribute extractor helpers. */
function getAttr(tag: string, attr: string): string | null {
  const re = new RegExp(`${attr}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i');
  const m = tag.match(re);
  return m ? m[1] ?? m[2] ?? null : null;
}

function hasAttr(tag: string, attr: string): boolean {
  return new RegExp(`\\b${attr}\\b`, 'i').test(tag);
}

// ---------------------------------------------------------------------------
// Per-image checks
// ---------------------------------------------------------------------------

function checkImgTag(
  tag: string,
  filePath: string,
): ImageIssue[] {
  const issues: ImageIssue[] = [];

  // Missing loading="lazy"
  const loadingVal = getAttr(tag, 'loading');
  if (loadingVal !== 'lazy') {
    issues.push({
      path: filePath,
      issue: 'no-lazy-loading',
      recommendation:
        'Add loading="lazy" to defer off-screen images and reduce initial page weight.',
    });
  }

  // Missing srcset
  if (!hasAttr(tag, 'srcset')) {
    issues.push({
      path: filePath,
      issue: 'no-srcset',
      recommendation:
        'Provide a srcset attribute with multiple resolutions so the browser can pick the best size.',
      estimatedSavings: '20-60% on mobile',
    });
  }

  // Missing alt
  const altVal = getAttr(tag, 'alt');
  if (altVal === null) {
    issues.push({
      path: filePath,
      issue: 'no-alt',
      recommendation:
        'Add a descriptive alt attribute for accessibility and SEO.',
    });
  }

  // Missing explicit width/height
  if (!hasAttr(tag, 'width') || !hasAttr(tag, 'height')) {
    issues.push({
      path: filePath,
      issue: 'no-width-height',
      recommendation:
        'Specify width and height attributes to prevent layout shift (CLS).',
    });
  }

  return issues;
}

function checkShopifyImgTag(
  tag: string,
  filePath: string,
): ImageIssue[] {
  const issues: ImageIssue[] = [];

  // Not using Shopify image_url filter with width params (no WebP auto-conversion)
  if (!/image_url/i.test(tag)) {
    issues.push({
      path: filePath,
      issue: 'no-webp',
      recommendation:
        'Use the Shopify | image_url filter with width parameter to serve optimised WebP images automatically.',
      estimatedSavings: '25-35% vs JPEG/PNG',
    });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scan Liquid/HTML files for `<img>` and Shopify image tags and return
 * optimisation recommendations.
 */
export function analyzeImages(
  files: { path: string; content: string }[],
): ImageReport {
  const issues: ImageIssue[] = [];
  let totalImages = 0;

  for (const file of files) {
    // Standard HTML <img> tags
    const imgMatches = file.content.match(IMG_TAG_RE) ?? [];
    totalImages += imgMatches.length;

    for (const tag of imgMatches) {
      issues.push(...checkImgTag(tag, file.path));
    }

    // Shopify image filter tags
    const shopifyMatches = file.content.match(SHOPIFY_IMG_RE) ?? [];
    totalImages += shopifyMatches.length;

    for (const tag of shopifyMatches) {
      issues.push(...checkShopifyImgTag(tag, file.path));
    }
  }

  // An image is "optimised" if it produced zero issues
  const filesWithIssues = new Set(issues.map((i) => `${i.path}:${i.issue}`));
  const optimizedCount = Math.max(0, totalImages - filesWithIssues.size);

  // Rough estimate: each fixable image could save ~30 KB on average
  const potentialKb = issues.filter(
    (i) => i.issue === 'no-srcset' || i.issue === 'no-webp',
  ).length * 30;

  return {
    issues,
    totalImages,
    optimizedCount,
    potentialSavings: potentialKb > 0 ? `~${potentialKb} KB` : '0 KB',
  };
}
