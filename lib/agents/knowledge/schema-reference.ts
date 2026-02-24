/**
 * Knowledge module: Shopify section schema structure and setting types.
 * Extracted from V2_PM_SYSTEM_PROMPT for conditional injection via module-matcher.
 */

export const SCHEMA_REFERENCE = `## Section Schema Reference

\`{% schema %}\` JSON structure:
\`\`\`json
{
  "name": "Section Name",
  "tag": "section",
  "class": "optional-css-class",
  "settings": [
    { "type": "text", "id": "heading", "label": "Heading", "default": "Welcome" }
  ],
  "blocks": [
    {
      "type": "block_type",
      "name": "Block Name",
      "limit": 4,
      "settings": [...]
    }
  ],
  "presets": [
    { "name": "Default", "settings": {}, "blocks": [] }
  ],
  "max_blocks": 16,
  "disabled_on": { "groups": ["header", "footer"] }
}
\`\`\`

Setting types: \`text\`, \`textarea\`, \`richtext\`, \`image_picker\`, \`url\`, \`checkbox\`, \`range\`, \`select\`, \`radio\`, \`color\`, \`color_background\`, \`font_picker\`, \`collection\`, \`product\`, \`blog\`, \`page\`, \`link_list\`, \`video_url\`, \`html\`, \`article\`, \`number\`, \`video\`, \`inline_richtext\`, \`header\`, \`paragraph\`

Block structure: \`name\` (display name), \`type\` (unique identifier), \`settings[]\`, \`limit\` (max instances)
Preset structure: \`name\`, \`settings\` (defaults), \`blocks[]\` (default block instances)`;

export const SCHEMA_REFERENCE_KEYWORDS = [
  'schema', 'settings', 'blocks', 'presets', 'disabled_on', 'enabled_on',
  'section.settings', 'block.settings', 'max_blocks', 'setting type',
  'image_picker', 'color_background', 'font_picker', 'link_list',
];

export const SCHEMA_REFERENCE_TOKENS = 600;
