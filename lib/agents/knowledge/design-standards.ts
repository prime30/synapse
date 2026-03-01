/**
 * Knowledge module: Domain-agnostic design standards for Shopify themes.
 *
 * Covers accessibility, layout limits, typography limits, image treatment,
 * component patterns, and anti-patterns. All brand/aesthetic-specific
 * guidance is handled by project-specific design rules generated from
 * extracted tokens (see context-provider.ts → buildProjectDesignRules).
 */

export const DESIGN_STANDARDS = [
  '## Design Standards',
  '',
  '### Typography',
  '- Body text always >= 1rem (16px) for readability',
  '- Max 2 typefaces per page',
  '- Max 3 font-size levels per section',
  '- Heading letter-spacing: +0.02em to +0.05em',
  '- Body line-height: 1.6-1.8',
  '',
  '### Spacing and Layout',
  '- Section padding: minimum 5rem (80px); hero/feature sections 7.5-10rem',
  '- Content max-width: 75rem (1200px), centered with margin-inline: auto',
  '- Grid gaps: 1.5-2.5rem (24-40px) between cards',
  '- Max 4 product columns on desktop, 2 on mobile',
  '- Breakpoints: collapse grids at 990px (tablet) and 750px (mobile)',
  '',
  '### Image Treatment',
  '- Lazy-load all below-fold images; preload hero images',
  '- Alt text: descriptive, include product name and key visual detail',
  '- Hero images: full-bleed, aspect-ratio >= 16/9, object-fit: cover',
  '- Product images: object-fit: contain on neutral background',
  '',
  '### Interaction',
  '- Hover: subtle transitions (0.2-0.3s ease), no scale transforms',
  '- scroll-behavior: smooth, no jarring parallax',
  '- No autoplay video without prefers-reduced-motion check',
  '',
  '### Accessibility',
  '- WCAG AA contrast: 4.5:1 for text, 3:1 for large text',
  '- Visible focus indicators on all interactive elements',
  '- No heavy box-shadow (nothing darker than rgba(0,0,0,0.12))',
  '',
  '### Anti-Patterns (DO NOT)',
  '- No cluttered multi-column grids (max 4 columns)',
  '- No small dense text blocks (body always >= 1rem)',
  '- No more than 2 typefaces per page',
  '- No autoplay video heroes without prefers-reduced-motion check',
].join('\n');

export const DESIGN_STANDARDS_KEYWORDS = [
  'design', 'style', 'visual', 'aesthetic', 'beautiful', 'premium',
  'luxury', 'minimal', 'clean', 'modern', 'elegant', 'brand', 'branding',
  'hero', 'banner', 'layout', 'spacing', 'whitespace', 'typography', 'font',
  'color', 'palette', 'photography', 'image', 'product card', 'grid',
  'look and feel', 'redesign', 'refresh', 'rebrand',
];

export const DESIGN_STANDARDS_TOKENS = 600;
