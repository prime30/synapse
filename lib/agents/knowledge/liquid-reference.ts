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
- \`{% include %}\` → use \`{% render %}\` instead

## Complete Filter Reference

**String**: append, prepend, capitalize, downcase, upcase, strip, lstrip, rstrip, strip_html, strip_newlines, escape, escape_once, url_encode, url_decode, url_escape, url_param_escape, base64_encode, base64_decode, newline_to_br, replace, replace_first, replace_last, remove, remove_first, remove_last, slice, split, truncate, truncatewords, handleize, camelize, pluralize, hmac_sha1, hmac_sha256, md5, sha1, sha256

**Math**: abs, at_least, at_most, ceil, floor, round, divided_by, minus, modulo, plus, times

**Array**: compact, concat, find, find_index, first, has, join, last, map, reject, reverse, size, sort, sort_natural, sum, uniq, where

**Money**: money, money_with_currency, money_without_currency, money_without_trailing_zeros

**Color**: color_to_rgb, color_to_hsl, color_to_hex, color_extract, color_brightness, color_modify, color_lighten, color_darken, color_saturate, color_desaturate, color_mix, color_contrast, color_difference, brightness_difference

**Media**: image_url, image_tag, img_tag (deprecated), external_video_tag, external_video_url, media_tag, model_viewer_tag, video_tag

**URL/Asset**: asset_url, asset_img_url, file_url, file_img_url, shopify_asset_url, global_asset_url

**HTML**: script_tag, stylesheet_tag, time_tag, highlight, link_to, placeholder_svg_tag, preload_tag, inline_asset_content

**Format**: date, json, structured_data, weight_with_unit

**Font**: font_face, font_modify, font_url

**Payment**: payment_button, payment_terms, payment_type_img_url, payment_type_svg_tag

**Customer**: customer_login_link, customer_logout_link, customer_register_link, login_button

**Collection**: link_to_type, link_to_vendor, sort_by, url_for_type, url_for_vendor, within, highlight_active_tag

**Cart**: item_count_for_variant, line_items_for

**Tag**: link_to_add_tag, link_to_remove_tag, link_to_tag

**Localization**: t (translate), format_address, currency_selector

**Default**: default, default_errors, default_pagination

**Metafield**: metafield_tag, metafield_text

## Valid Tags

**Theme**: content_for, layout, render, section, sections, javascript, stylesheet
**Variable**: assign, capture, increment, decrement
**Iteration**: for, break, continue, cycle, tablerow, paginate
**Conditional**: if, unless, case, else
**HTML**: form, style
**Syntax**: comment, echo, raw, liquid`;

export const PACKING_SLIP_REFERENCE = `## Shopify Packing Slip Template Reference

Packing slip templates are edited in Shopify Admin > Settings > Shipping and delivery > Packing slip template.
They use Liquid with a specific set of objects available in the packing slip context.

### Available Objects

- \`order\` — The order: name, order_number, email, created_at, financial_status, fulfillment_status, total_price, subtotal_price, total_tax, total_discounts, shipping_price, note, cancelled, cancel_reason
- \`line_items\` — Array of line items in the shipment: title, variant_title, sku, quantity, price, final_price, final_line_price, grams, image, requires_shipping, product (title, type, vendor), fulfillment (tracking_number, tracking_company, tracking_url)
- \`shipping_address\` — Ship-to address: name, first_name, last_name, company, address1, address2, city, province, province_code, country, country_code, zip, phone
- \`billing_address\` — Same structure as shipping_address
- \`shop\` — Store info: name, email, domain, url, currency, money_format
- \`shop_address\` — Store address: same structure as shipping_address
- \`customer\` — Customer: name, email, first_name, last_name, phone

### Common Patterns

\`\`\`liquid
{% for line_item in line_items %}
  {{ line_item.title }} — {{ line_item.variant_title }}
  SKU: {{ line_item.sku }} | Qty: {{ line_item.quantity }}
  {{ line_item.price | money }}
{% endfor %}
\`\`\`

### Design Guidelines

- Standard page size: 8.5 x 11 inches (US Letter)
- Use inline CSS or a \`<style>\` block (no external stylesheets)
- Include \`@media print\` rules for clean printing
- Include \`@page { size: letter; margin: 0.5in; }\` for print margins
- Use web-safe fonts (Helvetica, Arial, Georgia, Times New Roman)
- Keep images small (logos only) — product images are optional
- Test with partial fulfillments: some items may not have fulfillment tracking
`;

export const PACKING_SLIP_REFERENCE_KEYWORDS = [
  'packing slip', 'packing_slip', 'shipping label', 'fulfillment',
  'tracking_number', 'tracking_company', 'ship to', 'shipping_address',
  'billing_address', 'line_items', 'order.name', 'order_number',
];

export const PACKING_SLIP_REFERENCE_TOKENS = 800;

export const LIQUID_REFERENCE_KEYWORDS = [
  'liquid', 'render', 'include', 'assign', 'for', 'if',
  'filter', 'object', 'variable', 'endfor', 'endif', 'capture',
  'img_url', 'image_url', 'money', 'asset_url', 'json',
  'content_for_header', 'content_for_layout',
  'color_to_rgb', 'font_face', 'payment_button', 'metafield',
  'handleize', 'pluralize', 'truncate', 'where', 'map', 'sort',
];

export const LIQUID_REFERENCE_TOKENS = 2200;
