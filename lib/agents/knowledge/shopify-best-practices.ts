/**
 * Centralized Shopify knowledge modules for agent prompts.
 * Import into agent system prompts to inject domain-specific best practices.
 *
 * TODO: Wire into coordinator's system prompt assembly (Knowledge Modules plan).
 * Exports: SCHEMA_BEST_PRACTICES, PERFORMANCE_PATTERNS, DAWN_CONVENTIONS,
 * ACCESSIBILITY_REQUIREMENTS, THEME_ARCHITECTURE, DIAGNOSTIC_REASONING,
 * getKnowledgeForAgent, ALL_KNOWLEDGE.
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

// --- Theme Architecture & File Resolution ---

export const THEME_ARCHITECTURE = `## Theme Architecture & File Resolution Strategy

### Shopify Theme File Hierarchy (how pages are built)

Every page renders through this chain — trace it to find the right file:

\`\`\`
layout/theme.liquid          ← Global wrapper (head, body, scripts, CSS)
  └─ templates/<page>.json   ← Declares which sections render on the page
       └─ sections/<type>.liquid  ← Section code (HTML + Liquid + schema)
            └─ snippets/<name>.liquid  ← Reusable partials ({% render %})
                 └─ assets/<name>.js|css  ← JS behavior + styling
\`\`\`

### File Resolution Rules

When a user asks about something on a page, trace **downward** through this chain:

1. **Start at the template**: For "product page" → \`templates/product.json\` or \`templates/product.liquid\`
2. **Read the template JSON** to find section types: the \`sections\` key maps to section files
3. **Open each section**: e.g., \`sections/main-product.liquid\` — this is where the rendering logic lives
4. **Check render/include calls**: \`{% render 'product-thumbnail' %}\` → \`snippets/product-thumbnail.liquid\`
5. **Check asset references**: \`{{ 'lazysizes.min.js' | asset_url }}\` → \`assets/lazysizes.min.js\`

### Common Misconceptions

- **The template is NOT where rendering logic lives.** Template JSON files only declare section order. The actual HTML/Liquid code is in section files.
- **\`main-product.liquid\` is a section, not a template.** It lives in \`sections/\`, not \`templates/\`.
- **Snippets often contain the actual markup.** Product images are frequently in \`snippets/product-thumbnail.liquid\` or \`snippets/product-media.liquid\`, not in the section file itself.
- **JavaScript behavior is in assets.** Image loading bugs are usually in \`assets/\` JS files (e.g., lazysizes, slick, product-form, product-form-dynamic), not in Liquid files.

### Topic → File Mapping (where to look first)

| User mentions... | Check these files first |
|---|---|
| product image / thumbnail / media | snippets/product-thumbnail*.liquid, snippets/product-media*.liquid, sections/main-product*.liquid, assets/lazysizes*.js, assets/product-form*.js, assets/product-form-dynamic.js |
| product page / PDP / variant | templates/product*.json, sections/main-product*.liquid, snippets/product-form.liquid, snippets/product-form-dynamic.liquid, snippets/product-*.liquid, assets/product*.js, assets/product-form-dynamic.js |
| collection / grid / product list | templates/collection*.json, sections/main-collection*.liquid, snippets/product-card*.liquid, snippets/card-product*.liquid |
| cart / add to cart / buy button | templates/cart*.json, sections/main-cart*.liquid, snippets/cart-*.liquid, assets/cart*.js |
| header / navigation / menu | sections/header*.liquid, snippets/header-*.liquid, snippets/menu-*.liquid, assets/header*.js |
| footer | sections/footer*.liquid, snippets/footer-*.liquid |
| loading / preloader / spinner | layout/theme.liquid, assets/base*.css, assets/theme*.css, assets/lazysizes*.js |
| layout / global / body | layout/theme.liquid, config/settings_schema.json |
| CSS / style / color / font | assets/base*.css, assets/section-*.css, assets/custom*.css, config/settings_data.json |
| JavaScript / event / click | assets/global*.js, assets/theme*.js, assets/custom*.js |

### Third-Party Theme Patterns

Many Shopify themes (Turbo, Prestige, Kalles/T4S, etc.) deviate from Dawn conventions:
- **Custom lazy-loading**: Libraries like \`lazySizesT4\`, \`lozad\`, or custom observers — check \`assets/lazysizes*.js\` or inline scripts in \`layout/theme.liquid\`
- **Slider libraries**: Slick, Flickity, Swiper, Glide — check \`assets/slick*.js\`, \`assets/flickity*.js\`, \`assets/swiper*.js\`
- **jQuery dependency**: Many third-party themes load jQuery — check \`layout/theme.liquid\` for \`<script>\` tags
- **Custom namespaces**: CSS/JS class prefixes like \`t4s-\`, \`tt-\`, \`nt-\` — search for the prefix pattern in assets
- **Opacity/visibility patterns**: Themes often hide content with \`opacity:0\` or \`display:none\` and reveal via JS — if something isn't visible, check both CSS and JS for visibility toggles
`;

// --- Diagnostic Reasoning Strategy ---

export const DIAGNOSTIC_REASONING = `## Diagnostic Reasoning Strategy

When investigating issues (especially "X isn't showing" or "X looks wrong"):

### Step 1: Form multiple hypotheses
Don't fixate on one cause. Common categories:
- **Liquid rendering**: Is the content being output at all? (check Liquid logic, conditionals, variable assignment)
- **CSS visibility**: Is it rendered but hidden? (opacity:0, display:none, visibility:hidden, height:0, overflow:hidden)
- **JavaScript interference**: Is JS hiding/removing it? (DOM manipulation, lazy-load failures, slider init errors)
- **Asset loading**: Is a required JS/CSS file failing to load? (404, CORS, parse error)

### Step 2: Trace the rendering chain
For each hypothesis, trace the file chain:
1. Template JSON → which sections are declared?
2. Section liquid → what HTML is output? What snippets are rendered?
3. Snippet liquid → what \`<img>\`, \`<div>\`, etc. markup is produced?
4. Assets (JS) → what DOM manipulation happens after load?
5. Assets (CSS) → what styles affect visibility, layout, size?

### Step 3: Check cross-file dependencies
The bug is often in a file the user didn't mention:
- Image not showing? → Check the JS lazy-loader, not just the Liquid template
- Layout broken? → Check the CSS asset, not just the section HTML
- Content flickering? → Check JS that manipulates \`display\`/\`opacity\` after page load

### Step 4: Confidence assessment
Before proposing a fix, assess:
- **High confidence**: You can see the exact line causing the issue → propose the fix
- **Medium confidence**: You see a likely cause but haven't ruled out alternatives → state what you found AND what else might be involved
- **Low confidence**: You don't have enough context → request the specific additional files you need and explain why

### Step 5: If the first approach doesn't work
DO NOT repeat the same fix. Instead:
1. Re-read the affected files looking for patterns you missed
2. Check JavaScript files that run on page load (lazy-loaders, sliders, theme init scripts)
3. Check CSS files for !important rules or specificity conflicts
4. Look at layout/theme.liquid for global scripts or styles that might interfere
5. Consider third-party app scripts if the theme uses apps
6. Ask the user for browser console output or DOM inspector info if stuck
`;

// --- Helper ---

export function getKnowledgeForAgent(agentType: string): string {
  const blocks: string[] = [];
  switch (agentType) {
    case 'project_manager':
    case 'review':
      return ALL_KNOWLEDGE;
    case 'liquid':
      blocks.push(SCHEMA_BEST_PRACTICES, PERFORMANCE_PATTERNS, ACCESSIBILITY_REQUIREMENTS, THEME_ARCHITECTURE);
      break;
    case 'css':
      blocks.push(DAWN_CONVENTIONS, ACCESSIBILITY_REQUIREMENTS, PERFORMANCE_PATTERNS);
      break;
    case 'javascript':
      blocks.push(PERFORMANCE_PATTERNS, ACCESSIBILITY_REQUIREMENTS, DIAGNOSTIC_REASONING);
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
  THEME_ARCHITECTURE,
  DIAGNOSTIC_REASONING,
].join('\n\n');
