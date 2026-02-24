/**
 * Knowledge module: Shopify Liquid objects, filters, tags, and deprecated patterns.
 * Extracted from V2_PM_SYSTEM_PROMPT for conditional injection via module-matcher.
 */

export const LIQUID_REFERENCE = `## Shopify Liquid Objects Reference

Key global objects:
- \`product\` — Current product (title, description, variants, images, price, compare_at_price, tags, vendor, type, metafields)
- \`collection\` — Current collection (title, products, description, image, sort_by, filters)
- \`cart\` — Shopping cart (items, item_count, total_price, requires_shipping, note)
- \`customer\` — Logged-in customer (name, email, orders, addresses, tags)
- \`shop\` — Store info (name, url, currency, money_format, locale, metafields)
- \`page\` — Current page (title, content, handle, url, template_suffix)
- \`blog\` / \`article\` — Blog content (title, articles, tags, comments)
- \`request\` — Current request (host, path, page_type, locale, design_mode)
- \`settings\` — Theme settings from settings_data.json
- \`section\` — Current section (id, settings, blocks)
- \`block\` — Current block inside a section (id, type, settings, shopify_attributes)
- \`routes\` — Standard Shopify routes (root_url, cart_url, account_url, etc.)
- \`content_for_header\` — Required in layout <head> for Shopify scripts
- \`content_for_layout\` — Required in layout <body> for template rendering

Key filters:
- \`| image_url: width: N\` — Generate responsive image URL (preferred over deprecated \`| img_url\`)
- \`| money\` / \`| money_with_currency\` — Format prices
- \`| json\` — Serialize to JSON (for JS data injection)
- \`| asset_url\` — URL for theme assets
- \`| stylesheet_tag\` / \`| script_tag\` — Generate link/script HTML tags
- \`| t\` — Translation lookup from locale files
- \`| default:\` — Provide fallback value
- \`| url\` — Object URL (product.url, collection.url)
- \`| date:\` — Format date strings

**Deprecated — do NOT use:**
- \`| img_url\` → use \`| image_url\` instead
- \`| img_tag\` → use \`<img>\` HTML with \`| image_url\`
- \`{% include %}\` → use \`{% render %}\` instead`;

export const LIQUID_REFERENCE_KEYWORDS = [
  'liquid', 'render', 'include', 'assign', 'for', 'if',
  'filter', 'object', 'variable', 'endfor', 'endif', 'capture',
  'img_url', 'image_url', 'money', 'asset_url', 'json',
  'content_for_header', 'content_for_layout',
];

export const LIQUID_REFERENCE_TOKENS = 800;
