/**
 * Prompt template data for the AI chat template library.
 * Templates are organized by category and can be auto-filled with IDE context.
 */

export type TemplateCategory = 'layout' | 'styling' | 'performance' | 'accessibility' | 'seo' | 'content' | 'custom';

export interface PromptTemplate {
  id: string;
  label: string;
  prompt: string;
  category: TemplateCategory;
  /** Whether this is a built-in (non-deletable) template */
  builtIn: boolean;
}

export const TEMPLATE_CATEGORIES: Record<TemplateCategory, { label: string; icon: string }> = {
  layout: { label: 'Layout', icon: 'layout' },
  styling: { label: 'Styling', icon: 'styling' },
  performance: { label: 'Performance', icon: 'performance' },
  accessibility: { label: 'Accessibility', icon: 'accessibility' },
  seo: { label: 'SEO', icon: 'seo' },
  content: { label: 'Content', icon: 'content' },
  custom: { label: 'Custom', icon: 'custom' },
};

export const BUILT_IN_TEMPLATES: PromptTemplate[] = [
  // ── Layout ──
  {
    id: 'layout-grid',
    label: 'Add responsive grid section',
    prompt: 'Add a new responsive grid section with configurable columns (2-4). Include schema settings for column count, gap size, and mobile stacking behavior.',
    category: 'layout',
    builtIn: true,
  },
  {
    id: 'layout-mobile-first',
    label: 'Convert to mobile-first',
    prompt: 'Refactor the current layout to be mobile-first. Ensure all styles start from mobile and progressively enhance for tablet and desktop breakpoints.',
    category: 'layout',
    builtIn: true,
  },
  {
    id: 'layout-sticky-header',
    label: 'Add sticky header',
    prompt: 'Make the header sticky with smooth scroll behavior. Add a shadow on scroll and ensure it works well with announcement bars and overlapping hero sections.',
    category: 'layout',
    builtIn: true,
  },
  {
    id: 'layout-mega-menu',
    label: 'Create mega menu',
    prompt: 'Add a mega menu dropdown to the main navigation. Include support for featured images, link columns, and a promotional banner area.',
    category: 'layout',
    builtIn: true,
  },
  {
    id: 'layout-hero',
    label: 'Add hero banner section',
    prompt: 'Create a hero banner section with a full-width background image, overlay text, subtitle, and a call-to-action button. Include schema settings for all content.',
    category: 'layout',
    builtIn: true,
  },
  // ── Styling ──
  {
    id: 'styling-brand-colors',
    label: 'Apply brand colors',
    prompt: 'Update the theme color scheme to use consistent brand colors. Apply them to buttons, links, headings, and accent elements throughout the theme.',
    category: 'styling',
    builtIn: true,
  },
  {
    id: 'styling-dark-mode',
    label: 'Add dark mode support',
    prompt: 'Add a dark/light mode toggle with CSS custom properties. Ensure all sections respect the mode and transitions are smooth.',
    category: 'styling',
    builtIn: true,
  },
  {
    id: 'styling-typography',
    label: 'Improve typography',
    prompt: 'Enhance the typography with better font pairing, a consistent type scale, and improved line heights and letter spacing for readability.',
    category: 'styling',
    builtIn: true,
  },
  {
    id: 'styling-animations',
    label: 'Add subtle animations',
    prompt: 'Add tasteful scroll-reveal and hover animations to sections and interactive elements. Use CSS transitions and respect prefers-reduced-motion.',
    category: 'styling',
    builtIn: true,
  },
  // ── Performance ──
  {
    id: 'perf-lazy-load',
    label: 'Lazy load images',
    prompt: 'Add native lazy loading to all images below the fold. Use loading="lazy" and add appropriate width/height attributes to prevent layout shift.',
    category: 'performance',
    builtIn: true,
  },
  {
    id: 'perf-css',
    label: 'Optimize CSS delivery',
    prompt: 'Reduce render-blocking CSS by inlining critical styles and deferring non-critical stylesheets. Audit for unused CSS rules.',
    category: 'performance',
    builtIn: true,
  },
  {
    id: 'perf-preconnect',
    label: 'Add resource hints',
    prompt: 'Add preconnect and dns-prefetch hints for third-party domains like fonts, analytics, and CDN origins to speed up resource loading.',
    category: 'performance',
    builtIn: true,
  },
  // ── Accessibility ──
  {
    id: 'a11y-aria',
    label: 'Add ARIA labels',
    prompt: 'Improve screen reader support by adding appropriate ARIA labels, roles, and live regions to interactive elements, navigation, and dynamic content.',
    category: 'accessibility',
    builtIn: true,
  },
  {
    id: 'a11y-contrast',
    label: 'Fix color contrast',
    prompt: 'Audit and fix color contrast issues to meet WCAG AA standards (4.5:1 for normal text, 3:1 for large text). Suggest alternative colors where needed.',
    category: 'accessibility',
    builtIn: true,
  },
  {
    id: 'a11y-skip-nav',
    label: 'Add skip navigation',
    prompt: 'Add a skip-to-content link for keyboard users. Make it visible on focus and ensure it bypasses the header and navigation to reach main content.',
    category: 'accessibility',
    builtIn: true,
  },
  // ── SEO ──
  {
    id: 'seo-structured-data',
    label: 'Add structured data',
    prompt: 'Add JSON-LD structured data for products, breadcrumbs, and organization. Follow Google guidelines for rich result eligibility.',
    category: 'seo',
    builtIn: true,
  },
  {
    id: 'seo-meta',
    label: 'Optimize meta tags',
    prompt: 'Improve meta title and description templates for all page types. Ensure proper Open Graph and Twitter Card tags are present.',
    category: 'seo',
    builtIn: true,
  },
  {
    id: 'seo-breadcrumbs',
    label: 'Add breadcrumb navigation',
    prompt: 'Add SEO-friendly breadcrumb navigation with structured data markup. Style them to match the theme and support all page types.',
    category: 'seo',
    builtIn: true,
  },
  // ── Content ──
  {
    id: 'content-testimonials',
    label: 'Add testimonials section',
    prompt: 'Create a customer testimonials section with a carousel/slider. Include schema settings for testimonial text, author name, rating, and optional photo.',
    category: 'content',
    builtIn: true,
  },
  {
    id: 'content-faq',
    label: 'Add FAQ section',
    prompt: 'Create an accordion FAQ section with expandable questions and answers. Include FAQ structured data for SEO and schema settings for each Q&A pair.',
    category: 'content',
    builtIn: true,
  },
];
