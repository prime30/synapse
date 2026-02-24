/**
 * Real-bug evaluation scenarios for Synapse agent.
 *
 * 10 bug scenarios with fixtures to measure whether the agent can fix
 * Shopify theme bugs across CSS, Liquid, schema, JavaScript, settings, and cross-file issues.
 */

export interface BugScenario {
  id: string;
  description: string;
  userPrompt: string;
  bugType: 'css' | 'liquid' | 'schema' | 'javascript' | 'settings' | 'cross-file';
  expectedFixFiles: string[];
  expectedFixPattern: RegExp;
  regressionCheckFiles: string[];
}

export const BUG_SCENARIOS: BugScenario[] = [
  {
    id: 'css-display-none',
    description: 'Product card hidden by CSS display:none',
    userPrompt:
      'Products are not showing on the collection page. They were visible before but now the product cards seem to be hidden.',
    bugType: 'css',
    expectedFixFiles: ['assets/theme.css'],
    expectedFixPattern: /\.product-card\s*\{[^}]*display\s*:\s*(?:grid|flex|block)/,
    regressionCheckFiles: ['sections/collection-template.liquid'],
  },
  {
    id: 'css-opacity-zero',
    description: 'Cart drawer invisible due to opacity:0 without JS toggle',
    userPrompt:
      'The cart drawer is not appearing when I click the cart icon. I think it might be a CSS issue.',
    bugType: 'css',
    expectedFixFiles: ['assets/theme.css'],
    expectedFixPattern: /\.cart-drawer\s*\{[^}]*opacity\s*:\s*1|\.cart-drawer\.is-open/,
    regressionCheckFiles: ['sections/cart-drawer.liquid'],
  },
  {
    id: 'liquid-wrong-variable',
    description: 'Product price shows $0 due to wrong variable name',
    userPrompt: 'All product prices are showing as $0.00 on the product page.',
    bugType: 'liquid',
    expectedFixFiles: ['sections/main-product.liquid'],
    expectedFixPattern: /product\.price|product\.selected_or_first_available_variant\.price/,
    regressionCheckFiles: ['snippets/product-card.liquid'],
  },
  {
    id: 'liquid-wrong-iterator',
    description: 'Collection shows no products - wrong forloop object',
    userPrompt: 'The collection page is completely empty, no products are showing at all.',
    bugType: 'liquid',
    expectedFixFiles: ['sections/collection-template.liquid'],
    expectedFixPattern: /for\s+product\s+in\s+collection\.products/,
    regressionCheckFiles: ['snippets/product-card.liquid'],
  },
  {
    id: 'schema-missing-setting',
    description: 'Section setting referenced in Liquid but missing from schema',
    userPrompt: 'The hero section title is not showing even though I set it in the customizer.',
    bugType: 'schema',
    expectedFixFiles: ['sections/hero-banner.liquid'],
    expectedFixPattern: /"id"\s*:\s*"show_title"/,
    regressionCheckFiles: [],
  },
  {
    id: 'schema-missing-block',
    description: 'Block type in template JSON but section has no matching block definition',
    userPrompt: 'I added a testimonial block in the customizer but it shows an error.',
    bugType: 'schema',
    expectedFixFiles: ['sections/testimonials.liquid'],
    expectedFixPattern: /"type"\s*:\s*"testimonial"/,
    regressionCheckFiles: [],
  },
  {
    id: 'js-defer-timing',
    description: 'Cart quantity buttons broken - script defer before DOM ready',
    userPrompt: 'The cart quantity buttons are not working. Clicking plus or minus does nothing.',
    bugType: 'javascript',
    expectedFixFiles: ['assets/cart.js'],
    expectedFixPattern: /DOMContentLoaded|addEventListener\s*\(\s*['"]load/,
    regressionCheckFiles: ['sections/cart-drawer.liquid'],
  },
  {
    id: 'settings-feature-disabled',
    description: 'Hero banner hidden because settings_data.json has show_hero: false',
    userPrompt: 'The hero banner is missing from the homepage. It was there before.',
    bugType: 'settings',
    expectedFixFiles: ['config/settings_data.json'],
    expectedFixPattern: /"show_hero"\s*:\s*true/,
    regressionCheckFiles: [],
  },
  {
    id: 'settings-color-contrast',
    description: 'White text on white background from settings color values',
    userPrompt:
      'I cannot see any text on the hero section. The background is white and the text seems to be invisible.',
    bugType: 'settings',
    expectedFixFiles: ['config/settings_data.json'],
    expectedFixPattern: /"color_text"\s*:\s*"#(?!fff|FFF|ffffff|FFFFFF)/,
    regressionCheckFiles: [],
  },
  {
    id: 'crossfile-render-variable',
    description: 'Snippet gets wrong variable from render tag',
    userPrompt:
      'Product images are not showing in the collection grid. Each card just shows a broken image icon.',
    bugType: 'cross-file',
    expectedFixFiles: ['sections/collection-template.liquid'],
    expectedFixPattern: /render\s+['"]product-card['"]\s*,?\s*product\s*:/,
    regressionCheckFiles: ['snippets/product-card.liquid'],
  },
];
