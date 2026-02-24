/**
 * Knowledge module: Performance optimization patterns for Shopify themes.
 * Injected when the user mentions speed, performance, lazy loading, or image optimization.
 */

export const PERFORMANCE_PATTERNS = `## Shopify Theme Performance

### Images
- Use \`| image_url: width: N\` with appropriate sizes (300, 600, 900, 1200) — never load full-resolution
- Add \`loading="lazy"\` to below-the-fold images; omit for above-the-fold hero images
- Add \`fetchpriority="high"\` to LCP images (hero, first product image)
- Use srcset with multiple widths for responsive images
- Prefer WebP format via \`| image_url\` (Shopify serves WebP automatically when supported)

### Scripts
- Wrap non-critical JS in \`{% javascript %}\` for deferred loading
- Use \`defer\` or \`async\` on script tags that don't need synchronous execution
- Move inline \`<script>\` blocks to external files where possible
- Avoid render-blocking scripts in \`<head>\` — place before \`</body>\` or defer

### CSS
- Inline critical CSS for above-the-fold content in layout/theme.liquid
- Use \`{% stylesheet %}\` for section-scoped CSS (loaded only when section is present)
- Avoid @import in CSS files — use \`| stylesheet_tag\` in Liquid instead
- Remove unused CSS selectors from large stylesheets

### Liquid
- Use \`limit: N\` in \`{% for %}\` loops — avoid unbounded iteration over large collections
- Use \`{% capture %}\` for repeated HTML fragments to avoid re-rendering
- Minimize Liquid logic in loops — pre-compute values before the loop
- Avoid nested \`{% for %}\` loops when possible (O(n²) rendering)

### General
- Enable browser caching via CDN headers (Shopify handles this automatically for assets)
- Minimize DOM size — keep section HTML under 1500 nodes where possible
- Lazy-load sections below the fold using Intersection Observer patterns`;

export const PERFORMANCE_PATTERNS_KEYWORDS = [
  'performance', 'speed', 'lazy', 'defer', 'async', 'image', 'optimize',
  'slow', 'load time', 'lcp', 'cls', 'core web vitals', 'pagespeed',
  'render-blocking', 'critical css', 'srcset', 'webp',
];

export const PERFORMANCE_PATTERNS_TOKENS = 550;
