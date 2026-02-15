/**
 * Visual regression detection for the preview panel.
 * Compares before/after screenshots using canvas-based pixel diffing.
 * Runs entirely client-side -- no external services needed.
 */

export interface RegressionResult {
  /** Percentage of pixels that differ (0-100). */
  diffPercentage: number;
  /** Whether the diff exceeds the regression threshold. */
  hasRegression: boolean;
  /** Data URL of the diff image (red = changed pixels). */
  diffImageUrl: string | null;
  /** Regions with significant changes. */
  changedRegions: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
}

/** Default threshold: >2% pixel change flags a regression. */
const DEFAULT_THRESHOLD = 2;

/**
 * Compare two screenshot data URLs and detect visual regressions.
 * Uses canvas pixel-by-pixel comparison with a tolerance for anti-aliasing.
 */
export async function compareScreenshots(
  beforeDataUrl: string,
  afterDataUrl: string,
  threshold = DEFAULT_THRESHOLD,
): Promise<RegressionResult> {
  // Load both images
  const [beforeImg, afterImg] = await Promise.all([
    loadImage(beforeDataUrl),
    loadImage(afterDataUrl),
  ]);

  // Use the dimensions of the before image as reference
  const width = beforeImg.width;
  const height = beforeImg.height;

  // Create canvases
  const beforeCanvas = createCanvas(width, height);
  const afterCanvas = createCanvas(width, height);
  const diffCanvas = createCanvas(width, height);

  const beforeCtx = beforeCanvas.getContext('2d')!;
  const afterCtx = afterCanvas.getContext('2d')!;
  const diffCtx = diffCanvas.getContext('2d')!;

  beforeCtx.drawImage(beforeImg, 0, 0, width, height);
  afterCtx.drawImage(afterImg, 0, 0, width, height);

  const beforeData = beforeCtx.getImageData(0, 0, width, height);
  const afterData = afterCtx.getImageData(0, 0, width, height);
  const diffData = diffCtx.createImageData(width, height);

  let changedPixels = 0;
  const totalPixels = width * height;
  const PIXEL_TOLERANCE = 10; // Tolerance per channel for anti-aliasing

  // Track changed regions (grid-based)
  const GRID_SIZE = 32;
  const gridCols = Math.ceil(width / GRID_SIZE);
  const gridRows = Math.ceil(height / GRID_SIZE);
  const gridHits = new Uint8Array(gridCols * gridRows);

  for (let i = 0; i < beforeData.data.length; i += 4) {
    const rDiff = Math.abs(beforeData.data[i] - afterData.data[i]);
    const gDiff = Math.abs(beforeData.data[i + 1] - afterData.data[i + 1]);
    const bDiff = Math.abs(beforeData.data[i + 2] - afterData.data[i + 2]);

    if (rDiff > PIXEL_TOLERANCE || gDiff > PIXEL_TOLERANCE || bDiff > PIXEL_TOLERANCE) {
      changedPixels++;
      // Mark diff pixel as red
      diffData.data[i] = 255;     // R
      diffData.data[i + 1] = 0;   // G
      diffData.data[i + 2] = 0;   // B
      diffData.data[i + 3] = 180; // A

      // Track grid cell
      const pixelIdx = i / 4;
      const x = pixelIdx % width;
      const y = Math.floor(pixelIdx / width);
      const gridCol = Math.floor(x / GRID_SIZE);
      const gridRow = Math.floor(y / GRID_SIZE);
      gridHits[gridRow * gridCols + gridCol] = 1;
    } else {
      // Transparent (show-through)
      diffData.data[i] = afterData.data[i];
      diffData.data[i + 1] = afterData.data[i + 1];
      diffData.data[i + 2] = afterData.data[i + 2];
      diffData.data[i + 3] = 60; // dim
    }
  }

  diffCtx.putImageData(diffData, 0, 0);

  const diffPercentage = totalPixels > 0 ? (changedPixels / totalPixels) * 100 : 0;

  // Extract changed regions from grid
  const changedRegions: RegressionResult['changedRegions'] = [];
  for (let r = 0; r < gridRows; r++) {
    for (let c = 0; c < gridCols; c++) {
      if (gridHits[r * gridCols + c]) {
        changedRegions.push({
          x: c * GRID_SIZE,
          y: r * GRID_SIZE,
          width: GRID_SIZE,
          height: GRID_SIZE,
        });
      }
    }
  }

  return {
    diffPercentage: Math.round(diffPercentage * 100) / 100,
    hasRegression: diffPercentage > threshold,
    diffImageUrl: diffPercentage > 0 ? diffCanvas.toDataURL('image/png') : null,
    changedRegions,
  };
}

/** Capture a screenshot from an HTMLIFrameElement as a data URL. */
export async function capturePreviewScreenshot(
  iframe: HTMLIFrameElement,
): Promise<string | null> {
  try {
    // Use html2canvas approach via the iframe's content
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc?.body) return null;

    // Create a canvas from the iframe dimensions
    const canvas = document.createElement('canvas');
    const rect = iframe.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    // Note: Due to cross-origin restrictions with Shopify preview,
    // we use the drawWindow API if available (Firefox) or fall back
    // to asking the bridge for a screenshot.
    // For now, return null -- the bridge integration will be added later.
    console.warn('[visual-regression] Screenshot capture requires bridge integration for cross-origin iframes');
    return null;
  } catch (err) {
    console.warn('[visual-regression] Failed to capture screenshot:', err);
    return null;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}
