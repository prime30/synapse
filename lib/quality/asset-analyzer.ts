// ---------------------------------------------------------------------------
// Asset Analyzer – theme asset weight analysis
// ---------------------------------------------------------------------------

/** Classification of a theme asset. */
export type AssetType = 'css' | 'js' | 'font' | 'image' | 'other';

/** Information about a single asset file. */
export interface AssetInfo {
  path: string;
  size: number;
  type: AssetType;
  /** Whether the file appears to be minified (JS/CSS only). */
  isMinified?: boolean;
  /** Estimated gzip size in bytes (~30% of original for text assets). */
  gzipEstimate?: number;
}

/** Aggregated breakdown entry for a single asset type. */
export interface AssetBreakdown {
  count: number;
  totalSize: number;
}

/** Full asset analysis report. */
export interface AssetReport {
  assets: AssetInfo[];
  totalSize: number;
  breakdown: Record<string, AssetBreakdown>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EXTENSION_MAP: Record<string, AssetType> = {
  '.css': 'css',
  '.scss': 'css',
  '.less': 'css',
  '.js': 'js',
  '.mjs': 'js',
  '.ts': 'js',
  '.jsx': 'js',
  '.tsx': 'js',
  '.woff': 'font',
  '.woff2': 'font',
  '.ttf': 'font',
  '.otf': 'font',
  '.eot': 'font',
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.gif': 'image',
  '.svg': 'image',
  '.webp': 'image',
  '.avif': 'image',
  '.ico': 'image',
};

function getExtension(path: string): string {
  const dot = path.lastIndexOf('.');
  return dot === -1 ? '' : path.slice(dot).toLowerCase();
}

function detectAssetType(path: string): AssetType {
  return EXTENSION_MAP[getExtension(path)] ?? 'other';
}

/**
 * Heuristic: a JS/CSS file is "minified" when its average line length
 * exceeds 200 characters.
 */
function isMinified(content: string): boolean {
  const lines = content.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) return false;
  const avgLength = lines.reduce((sum, l) => sum + l.length, 0) / lines.length;
  return avgLength > 200;
}

/** Text-based assets compress roughly to 30 % of their original size. */
function estimateGzip(size: number, type: AssetType): number | undefined {
  if (type === 'css' || type === 'js') {
    return Math.round(size * 0.3);
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyse a set of theme files and produce an asset weight report.
 */
export function analyzeAssets(
  files: { path: string; content: string; size: number }[],
): AssetReport {
  const assets: AssetInfo[] = [];
  const breakdown: Record<string, AssetBreakdown> = {};

  for (const file of files) {
    const type = detectAssetType(file.path);
    const info: AssetInfo = {
      path: file.path,
      size: file.size,
      type,
      isMinified: type === 'css' || type === 'js' ? isMinified(file.content) : undefined,
      gzipEstimate: estimateGzip(file.size, type),
    };
    assets.push(info);

    if (!breakdown[type]) {
      breakdown[type] = { count: 0, totalSize: 0 };
    }
    breakdown[type].count += 1;
    breakdown[type].totalSize += file.size;
  }

  const totalSize = assets.reduce((sum, a) => sum + a.size, 0);

  return { assets, totalSize, breakdown };
}
