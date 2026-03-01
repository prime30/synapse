/**
 * Knowledge module: Liquid code patterns and few-shot examples for Shopify themes.
 * Extracted from V2 Liquid specialist — covers safe output, section blocks,
 * cart patterns, and Liquid authoring best practices not already in liquid-core
 * or liquid-filters modules.
 */

export const LIQUID_EDITING_PATTERNS = [
  '## Liquid Code Patterns (Few-Shot Examples)',
  '',
  '### Safe Output with Image and Render',
  '  {%- if product.featured_image -%}',
  '    <img src="{{ product.featured_image | image_url: width: 600 }}"',
  '         alt="{{ product.featured_image.alt | escape }}" loading="lazy">',
  '  {%- endif -%}',
  '  {% render "product-card", product: product %}',
  '',
  '### Section with Schema Block Loop',
  '  {% for block in section.blocks %}',
  '    <div {{ block.shopify_attributes }}>',
  '      {% case block.type %}',
  '        {% when "heading" %}',
  '          <h2>{{ block.settings.title }}</h2>',
  '        {% when "text" %}',
  '          <div>{{ block.settings.content }}</div>',
  '      {% endcase %}',
  '    </div>',
  '  {% endfor %}',
  '',
  '### Cart Line Item with Money Format',
  '  {% for item in cart.items %}',
  '    <div class="line-item">',
  '      <span>{{ item.product.title | escape }}</span>',
  '      <span>{{ item.final_line_price | money }}</span>',
  '    </div>',
  '  {% endfor %}',
  '',
  '### Liquid Authoring Best Practices',
  '- Use {% liquid %} tag for multi-statement logic blocks (cleaner than multiple {% %} tags)',
  '- Max 3 levels of nesting — refactor deeper logic into snippets via {% render %}',
  '- Validate objects before accessing: {% if product.featured_image %} before using .alt',
  '- Escape user-facing output: {{ title | escape }} for XSS safety',
  '- Use {% render %} for snippets, not {% include %} (deprecated, breaks scope isolation)',
].join('\n');

export const LIQUID_EDITING_PATTERNS_KEYWORDS = [
  'liquid', 'template', 'section', 'snippet', 'render', 'block',
  'for', 'if', 'assign', 'capture', 'case', 'when',
  'shopify_attributes', 'block.settings', 'section.settings',
  'cart', 'line_item', 'product', 'image_url', 'escape',
  'money', 'featured_image', '.liquid',
];

export const LIQUID_EDITING_PATTERNS_TOKENS = 550;
