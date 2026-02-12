// ---------------------------------------------------------------------------
// Theme Performance – performance scoring engine
// ---------------------------------------------------------------------------

import { analyzeAssets } from './asset-analyzer';
import { analyzeImages } from './image-optimizer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Performance analysis categories. */
export type PerformanceCategory =
  | 'asset-weight'
  | 'render-blocking'
  | 'image-optimization'
  | 'liquid-complexity'
  | 'network-requests';

/** A single finding produced by a performance rule. */
export interface PerformanceFinding {
  category: PerformanceCategory;
  rule: string;
  /** Score for this specific finding, 0–100. */
  score: number;
  /** Weight of this finding within its category (used for averaging). */
  weight: number;
  message: string;
  file?: string;
  recommendation?: string;
}

/** The complete performance report for a theme. */
export interface PerformanceReport {
  /** Weighted overall score, 0–100. */
  overallScore: number;
  findings: PerformanceFinding[];
  categoryScores: Record<PerformanceCategory, number>;
  analyzedAt: string;
}

// ---------------------------------------------------------------------------
// Category weights (must sum to 100)
// ---------------------------------------------------------------------------

const CATEGORY_WEIGHTS: Record<PerformanceCategory, number> = {
  'asset-weight': 25,
  'render-blocking': 25,
  'image-optimization': 30,
  'liquid-complexity': 20,
  'network-requests': 0, // reserved for future network analysis
};

// ---------------------------------------------------------------------------
// Rule runners
// ---------------------------------------------------------------------------

type FileInput = { path: string; content: string; size: number };

// -- Asset weight -----------------------------------------------------------

function runAssetWeightRules(files: FileInput[]): PerformanceFinding[] {
  const findings: PerformanceFinding[] = [];
  const report = analyzeAssets(files);

  // Total CSS + JS + font weight
  const textAssets = report.assets.filter(
    (a) => a.type === 'css' || a.type === 'js' || a.type === 'font',
  );
  const totalTextSize = textAssets.reduce((s, a) => s + a.size, 0);
  const totalKb = Math.round(totalTextSize / 1024);

  // 0 KB → 100, 500+ KB → 0
  const totalScore = Math.max(0, Math.min(100, 100 - (totalKb / 500) * 100));
  findings.push({
    category: 'asset-weight',
    rule: 'total-asset-size',
    score: Math.round(totalScore),
    weight: 3,
    message: `Total CSS/JS/font weight is ${totalKb} KB.`,
    recommendation:
      totalKb > 300
        ? 'Consider code-splitting, removing unused CSS, or lazy-loading non-critical scripts.'
        : undefined,
  });

  // Individual files > 100 KB
  for (const asset of textAssets) {
    const kb = Math.round(asset.size / 1024);
    if (kb > 100) {
      findings.push({
        category: 'asset-weight',
        rule: 'large-file',
        score: Math.max(0, 100 - ((kb - 100) / 200) * 100),
        weight: 1,
        message: `${asset.path} is ${kb} KB.`,
        file: asset.path,
        recommendation: 'Minify this file or split it into smaller chunks.',
      });
    }
  }

  // Un-minified JS/CSS
  const unminified = report.assets.filter(
    (a) => (a.type === 'css' || a.type === 'js') && a.isMinified === false,
  );
  if (unminified.length > 0) {
    findings.push({
      category: 'asset-weight',
      rule: 'unminified-assets',
      score: Math.max(0, 100 - unminified.length * 15),
      weight: 2,
      message: `${unminified.length} asset(s) are not minified.`,
      recommendation: 'Minify CSS and JS assets to reduce transfer size.',
    });
  }

  return findings;
}

// -- Render blocking --------------------------------------------------------

function runRenderBlockingRules(files: FileInput[]): PerformanceFinding[] {
  const findings: PerformanceFinding[] = [];

  for (const file of files) {
    // CSS in <head> without media attribute
    const cssLinkRe = /<link\b[^>]*rel\s*=\s*["']stylesheet["'][^>]*>/gi;
    let m: RegExpExecArray | null;
    while ((m = cssLinkRe.exec(file.content)) !== null) {
      if (!/\bmedia\s*=/i.test(m[0])) {
        findings.push({
          category: 'render-blocking',
          rule: 'css-no-media',
          score: 60,
          weight: 1,
          message: 'Stylesheet loaded without a media attribute may block rendering.',
          file: file.path,
          recommendation: 'Add a media attribute (e.g. media="print") and swap on load, or inline critical CSS.',
        });
      }
    }

    // Synchronous scripts (no async/defer)
    const scriptRe = /<script\b[^>]*src\s*=\s*["'][^"']+["'][^>]*>/gi;
    while ((m = scriptRe.exec(file.content)) !== null) {
      const tag = m[0];
      if (!/\b(async|defer)\b/i.test(tag) && !/type\s*=\s*["']module["']/i.test(tag)) {
        findings.push({
          category: 'render-blocking',
          rule: 'sync-script',
          score: 40,
          weight: 1,
          message: 'Synchronous script blocks page rendering.',
          file: file.path,
          recommendation: 'Add the async or defer attribute, or use type="module".',
        });
      }
    }
  }

  // If no render-blocking issues, add a perfect finding so the category isn't empty
  if (findings.length === 0) {
    findings.push({
      category: 'render-blocking',
      rule: 'no-blocking',
      score: 100,
      weight: 1,
      message: 'No render-blocking resources detected.',
    });
  }

  return findings;
}

// -- Image optimization -----------------------------------------------------

function runImageOptRules(files: FileInput[]): PerformanceFinding[] {
  const findings: PerformanceFinding[] = [];
  const report = analyzeImages(files);

  if (report.totalImages === 0) {
    findings.push({
      category: 'image-optimization',
      rule: 'no-images',
      score: 100,
      weight: 1,
      message: 'No images found to optimise.',
    });
    return findings;
  }

  const optimizedPct = (report.optimizedCount / report.totalImages) * 100;
  findings.push({
    category: 'image-optimization',
    rule: 'image-opt-ratio',
    score: Math.round(optimizedPct),
    weight: 3,
    message: `${report.optimizedCount}/${report.totalImages} images are fully optimised.`,
    recommendation:
      optimizedPct < 80
        ? `Potential savings: ${report.potentialSavings}. Add lazy-loading, srcset, and use Shopify image_url for WebP.`
        : undefined,
  });

  // Summarise by issue type
  const issueTypes = new Map<string, number>();
  for (const issue of report.issues) {
    issueTypes.set(issue.issue, (issueTypes.get(issue.issue) ?? 0) + 1);
  }

  for (const [type, count] of issueTypes) {
    findings.push({
      category: 'image-optimization',
      rule: `img-${type}`,
      score: Math.max(0, 100 - count * 10),
      weight: 1,
      message: `${count} image(s) have issue: ${type}.`,
      recommendation: report.issues.find((i) => i.issue === type)?.recommendation,
    });
  }

  return findings;
}

// -- Liquid complexity ------------------------------------------------------

function runLiquidRules(files: FileInput[]): PerformanceFinding[] {
  const findings: PerformanceFinding[] = [];

  for (const file of files) {
    if (!file.path.endsWith('.liquid')) continue;

    // Deeply nested for loops (>3 levels)
    let maxDepth = 0;
    let depth = 0;
    // Simple counting approach
    const tokens = file.content.split(/(\{%[-\s]*(?:for|endfor)\b)/);
    for (const token of tokens) {
      if (/\{%[-\s]*for\b/.test(token)) {
        depth++;
        if (depth > maxDepth) maxDepth = depth;
      } else if (/\{%[-\s]*endfor/.test(token)) {
        depth = Math.max(0, depth - 1);
      }
    }

    if (maxDepth > 3) {
      findings.push({
        category: 'liquid-complexity',
        rule: 'nested-for-loops',
        score: Math.max(0, 100 - (maxDepth - 3) * 25),
        weight: 2,
        message: `${file.path} has for-loops nested ${maxDepth} levels deep.`,
        file: file.path,
        recommendation: 'Extract deeply nested loops into snippets or simplify the data structure.',
      });
    }

    // Too many render/include tags (>20 per file)
    const renderCount = (file.content.match(/\{%[-\s]*(?:render|include)\b/g) ?? []).length;
    if (renderCount > 20) {
      findings.push({
        category: 'liquid-complexity',
        rule: 'too-many-renders',
        score: Math.max(0, 100 - (renderCount - 20) * 5),
        weight: 2,
        message: `${file.path} has ${renderCount} render/include tags.`,
        file: file.path,
        recommendation: 'Reduce the number of rendered snippets or consolidate related snippets.',
      });
    }
  }

  // No liquid issues → perfect
  if (findings.length === 0) {
    findings.push({
      category: 'liquid-complexity',
      rule: 'liquid-ok',
      score: 100,
      weight: 1,
      message: 'No liquid complexity issues detected.',
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function computeCategoryScore(findings: PerformanceFinding[]): number {
  if (findings.length === 0) return 100;
  const totalWeight = findings.reduce((s, f) => s + f.weight, 0);
  if (totalWeight === 0) return 100;
  const weightedSum = findings.reduce((s, f) => s + f.score * f.weight, 0);
  return Math.round(weightedSum / totalWeight);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyse theme files and produce a 0-100 performance score with detailed
 * findings broken down by category.
 */
export function analyzeThemePerformance(
  files: { path: string; content: string; size: number }[],
): PerformanceReport {
  // Collect findings per category
  const assetFindings = runAssetWeightRules(files);
  const renderFindings = runRenderBlockingRules(files);
  const imageFindings = runImageOptRules(files);
  const liquidFindings = runLiquidRules(files);

  const allFindings = [
    ...assetFindings,
    ...renderFindings,
    ...imageFindings,
    ...liquidFindings,
  ];

  // Calculate per-category scores
  const categoryScores: Record<PerformanceCategory, number> = {
    'asset-weight': computeCategoryScore(assetFindings),
    'render-blocking': computeCategoryScore(renderFindings),
    'image-optimization': computeCategoryScore(imageFindings),
    'liquid-complexity': computeCategoryScore(liquidFindings),
    'network-requests': 100, // placeholder
  };

  // Weighted overall score
  let overallScore = 0;
  let totalWeightUsed = 0;
  for (const [cat, weight] of Object.entries(CATEGORY_WEIGHTS)) {
    if (weight === 0) continue;
    overallScore += categoryScores[cat as PerformanceCategory] * weight;
    totalWeightUsed += weight;
  }
  overallScore = totalWeightUsed > 0 ? Math.round(overallScore / totalWeightUsed) : 100;

  return {
    overallScore,
    findings: allFindings,
    categoryScores,
    analyzedAt: new Date().toISOString(),
  };
}
