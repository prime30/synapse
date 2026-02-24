/**
 * Knowledge module: Shopify theme file structure and rendering chain.
 * ALWAYS loaded as fallback — this is foundational context for every request.
 */

export const THEME_ARCHITECTURE = `## Shopify Theme Structure

\`\`\`
layout/        — Theme layouts (theme.liquid, password.liquid)
templates/     — Page templates (*.liquid or *.json)
sections/      — Reusable sections with schemas
snippets/      — Reusable partials included via {% render %}
assets/        — CSS, JS, images, fonts
config/        — settings_schema.json, settings_data.json
locales/       — Translation files (*.json)
\`\`\`

Rendering chain: layout/theme.liquid → templates/<page>.json → sections/<type>.liquid → snippets/<name>.liquid → assets/<name>.js|css

Template JSON only declares section order. Rendering code is in sections and snippets. JavaScript in assets controls visibility and behavior.`;

export const THEME_ARCHITECTURE_KEYWORDS = [
  'layout', 'template', 'section', 'snippet', 'asset', 'config', 'locale',
  'theme.liquid', 'render chain', 'file structure', 'where', 'which file',
];

export const THEME_ARCHITECTURE_TOKENS = 250;
