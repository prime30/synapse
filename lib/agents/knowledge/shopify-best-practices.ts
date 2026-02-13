/**
 * Centralized Shopify knowledge modules for agent prompts.
 * Import into agent system prompts to inject domain-specific best practices.
 */

// --- Schema Best Practices ---

export const SCHEMA_BEST_PRACTICES = `## Schema Best Practices

- **Setting types**: Use the correct type for each setting: \`text\`, \`richtext\`, \`checkbox\`, \`range\`, \`select\`, \`color\`, \`image_picker\`, \`product\`, \`collection\`, \`url\`, \`html\`, \`video_url\`, \`font_picker\`, \`number\`, \`textarea\`, \`article\`, \`blog\`, \`link_list\`, \`liquid\`, \`inline_richtext\`
- **max_blocks**: Set \`max_blocks\` on block schemas to prevent unbounded growth; typical values 8–20 for flexible sections
- **Presets**: Define \`presets\` with meaningful names and default settings so merchants get a good starting point
- **shopify_attributes**: Use \`shopify_attributes\` for theme editor integration (e.g. \`data-product-id\`, \`data-section-id\`) so blocks are editable in the theme editor
- **Block organization**: Group related blocks with \`name\` and \`settings\`; order blocks logically (header → content → footer)
- **Defaults**: Always provide sensible \`default\` values for all settings
- **Locales**: Use \`locales\` for translatable strings in schema labels and placeholders`;

// --- Performance Patterns ---

export const PERFORMANCE_PATTERNS = `## Performance Patterns

- **image_url width params**: Use \`image_url: width: 600\` (or appropriate size) to avoid loading full-resolution images; prefer widths like 300, 600, 900, 1200
- **srcset**: Use \`image_url\` with \`widths\` filter or manual srcset for responsive images
- **loading="lazy"**: Add \`loading="lazy"\` to images below the fold; omit for above-the-fold hero images
- **fetchpriority="high"**: Add \`fetchpriority="high"\` to LCP images (hero, first product image)
- **{% javascript %} deferral**: Wrap non-critical scripts in \`{% javascript %}\` so they load deferred; keep critical inline minimal
- **Loop limits**: Use \`limit: N\` in \`{% for %}\` loops; avoid unbounded loops over large collections
- **{% capture %} caching**: Use \`{% capture %}\` for repeated strings or HTML fragments to avoid re-rendering`;

// --- Dawn Conventions ---

export const DAWN_CONVENTIONS = `## Dawn Conventions

- **CSS custom properties**: Use \`--color-base\`, \`--spacing-section\`, \`--font-body-family\`, \`--font-heading-family\`, \`--page-width\`, \`--color-foreground\`, \`--color-background\` for theming
- **BEM naming**: Follow Block__Element--Modifier (e.g. \`.product-card__image--rounded\`)
- **Responsive breakpoints**: Use 750px, 990px, 1200px as standard breakpoints; \`@media screen and (min-width: 750px)\`, etc.
- **.section--padding**: Apply \`.section--padding\` or similar utilities for consistent vertical spacing
- **.container**: Use \`.container\` or \`.page-width\` for max-width and horizontal padding; typically \`max-width: var(--page-width)\`
- **Typography**: Use \`font-size: calc(var(--font-heading-scale) * 1rem)\` and body scale for consistent sizing`;

// --- Accessibility Requirements ---

export const ACCESSIBILITY_REQUIREMENTS = `## Accessibility Requirements

- **WCAG AA contrast**: Text must meet 4.5:1 contrast ratio (3:1 for large text); use \`color-contrast()\` or verify with tools
- **alt on images**: Every \`<img>\` must have meaningful \`alt\` text; use empty \`alt=""\` only for purely decorative images
- **label on inputs**: Every form input must have an associated \`<label>\` or \`aria-label\` / \`aria-labelledby\`
- **Semantic HTML**: Use \`<header>\`, \`<nav>\`, \`<main>\`, \`<section>\`, \`<article>\`, \`<footer>\` appropriately
- **prefers-reduced-motion**: Wrap animations in \`@media (prefers-reduced-motion: no-preference) { ... }\`; respect user preference
- **Focus indicators**: Ensure visible focus styles (\`:focus-visible\`, \`outline\`, or \`box-shadow\`) on interactive elements
- **aria-describedby**: Use \`aria-describedby\` to associate descriptions with form fields when helpful`;

// --- Helper ---

export function getKnowledgeForAgent(agentType: string): string {
  const blocks: string[] = [];
  switch (agentType) {
    case 'project_manager':
    case 'review':
      return ALL_KNOWLEDGE;
    case 'liquid':
      blocks.push(SCHEMA_BEST_PRACTICES, PERFORMANCE_PATTERNS, ACCESSIBILITY_REQUIREMENTS);
      break;
    case 'css':
      blocks.push(DAWN_CONVENTIONS, ACCESSIBILITY_REQUIREMENTS, PERFORMANCE_PATTERNS);
      break;
    case 'javascript':
      blocks.push(PERFORMANCE_PATTERNS, ACCESSIBILITY_REQUIREMENTS);
      break;
    default:
      return '';
  }
  return blocks.join('\n\n');
}

// --- All Knowledge ---

export const ALL_KNOWLEDGE = [
  SCHEMA_BEST_PRACTICES,
  PERFORMANCE_PATTERNS,
  DAWN_CONVENTIONS,
  ACCESSIBILITY_REQUIREMENTS,
].join('\n\n');
