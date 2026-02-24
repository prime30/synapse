/**
 * Theme fixture generator for real-bug evaluation.
 *
 * Creates a minimal but realistic Shopify theme (~20 files) with one injected
 * bug per scenario for measuring agent fix capability.
 */

import type { BugScenario } from './bug-scenarios';

export interface ThemeFixture {
  files: Array<{ path: string; content: string }>;
  bugLocation: { file: string; line: number; description: string };
}

// ── Base theme content (correct state) ────────────────────────────────────────

const BASE_FILES: Record<string, string> = {
  'layout/theme.liquid': `<!doctype html>
<html>
<head>
  {{ content_for_header }}
  {{ 'theme.css' | asset_url | stylesheet_tag }}
</head>
<body>
  {% section 'header' %}
  {{ content_for_layout }}
  {% section 'cart-drawer' %}
  {{ 'cart.js' | asset_url | script_tag }}
</body>
</html>`,
  'templates/index.json': `{
  "sections": {
    "hero": {
      "type": "hero-banner",
      "settings": { "show_title": true }
    },
    "collection": {
      "type": "collection-template",
      "settings": {}
    }
  },
  "order": ["hero", "collection"]
}`,
  'templates/product.json': `{
  "sections": {
    "main": {
      "type": "main-product",
      "settings": {}
    }
  },
  "order": ["main"]
}`,
  'templates/collection.json': `{
  "sections": {
    "main": {
      "type": "collection-template",
      "settings": {}
    }
  },
  "order": ["main"]
}`,
  'sections/header.liquid': `<header class="site-header">
  <a href="/cart" class="cart-icon">Cart</a>
</header>
{% schema %}
{"name":"Header","settings":[]}
{% endschema %}`,
  'sections/hero-banner.liquid': `<section class="hero-banner">
  {% if section.settings.show_title %}
    <h1>{{ section.settings.title | default: 'Welcome' }}</h1>
  {% endif %}
</section>
{% schema %}
{
  "name": "Hero Banner",
  "settings": [
    { "type": "text", "id": "title", "label": "Title" },
    { "type": "checkbox", "id": "show_title", "label": "Show title", "default": true }
  ]
}
{% endschema %}`,
  'sections/main-product.liquid': `<section class="main-product">
  {% render 'product-card', product: product %}
  <p class="product-price">{{ product.selected_or_first_available_variant.price | money }}</p>
</section>
{% schema %}
{"name":"Main Product","settings":[]}
{% endschema %}`,
  'sections/collection-template.liquid': `<section class="collection-template">
  <div class="product-grid">
    {% for product in collection.products %}
      {% render 'product-card', product: product %}
    {% endfor %}
  </div>
</section>
{% schema %}
{"name":"Collection","settings":[]}
{% endschema %}`,
  'sections/cart-drawer.liquid': `<div class="cart-drawer" id="cart-drawer">
  <div class="cart-items">
    {% for item in cart.items %}
      <div class="cart-item">
        <button class="qty-minus" data-line="{{ forloop.index }}">−</button>
        <span class="qty">{{ item.quantity }}</span>
        <button class="qty-plus" data-line="{{ forloop.index }}">+</button>
      </div>
    {% endfor %}
  </div>
</div>
{% schema %}
{"name":"Cart Drawer","settings":[]}
{% endschema %}`,
  'sections/testimonials.liquid': `<section class="testimonials">
  {% for block in section.blocks %}
    {% if block.type == 'testimonial' %}
      <blockquote>{{ block.settings.quote }}</blockquote>
    {% endif %}
  {% endfor %}
</section>
{% schema %}
{
  "name": "Testimonials",
  "blocks": [
    { "type": "testimonial", "name": "Testimonial", "settings": [{ "type": "textarea", "id": "quote", "label": "Quote" }] }
  ]
}
{% endschema %}`,
  'snippets/product-card.liquid': `<article class="product-card">
  {% render 'product-thumbnail', product: product %}
  <h2>{{ product.title | escape }}</h2>
  <p>{{ product.price | money }}</p>
</article>`,
  'snippets/product-thumbnail.liquid': `{% if product.featured_image %}
  <img src="{{ product.featured_image | image_url: width: 300 }}" alt="{{ product.title | escape }}">
{% endif %}`,
  'assets/theme.css': `.product-card {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  padding: 16px;
  border: 1px solid #ddd;
}
.product-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 24px;
}
.cart-drawer {
  position: fixed;
  top: 0;
  right: 0;
  width: 360px;
  opacity: 1;
  background: #fff;
  box-shadow: -2px 0 8px rgba(0,0,0,0.1);
}
.cart-drawer:not(.is-open) {
  transform: translateX(100%);
}
.cart-drawer.is-open {
  transform: translateX(0);
}`,
  'assets/cart.js': `document.addEventListener('DOMContentLoaded', function() {
  const drawer = document.getElementById('cart-drawer');
  document.querySelectorAll('.qty-plus, .qty-minus').forEach(function(btn) {
    btn.addEventListener('click', function() {
      const line = this.dataset.line;
      console.log('Quantity change for line', line);
    });
  });
});`,
  'config/settings_schema.json': `[
  {
    "name": "Theme",
    "settings": [
      { "type": "checkbox", "id": "show_hero", "label": "Show hero", "default": true },
      { "type": "color", "id": "color_text", "label": "Text color", "default": "#333333" },
      { "type": "color", "id": "color_background", "label": "Background", "default": "#ffffff" }
    ]
  }
]`,
  'config/settings_data.json': `{
  "current": {
    "show_hero": true,
    "color_text": "#333333",
    "color_background": "#ffffff"
  }
}`,
};

// Hero banner WITHOUT show_title in schema (for schema-missing-setting bug)
const HERO_BANNER_MISSING_SETTING = `<section class="hero-banner">
  {% if section.settings.show_title %}
    <h1>{{ section.settings.title | default: 'Welcome' }}</h1>
  {% endif %}
</section>
{% schema %}
{
  "name": "Hero Banner",
  "settings": [
    { "type": "text", "id": "title", "label": "Title" }
  ]
}
{% endschema %}`;

// Testimonials WITHOUT testimonial block (for schema-missing-block bug)
const TESTIMONIALS_MISSING_BLOCK = `<section class="testimonials">
  {% for block in section.blocks %}
    {% if block.type == 'quote' %}
      <blockquote>{{ block.settings.quote }}</blockquote>
    {% endif %}
  {% endfor %}
</section>
{% schema %}
{
  "name": "Testimonials",
  "blocks": [
    { "type": "quote", "name": "Quote", "settings": [{ "type": "textarea", "id": "quote", "label": "Quote" }] }
  ]
}
{% endschema %}`;

// ── Bug injection maps ────────────────────────────────────────────────────────

type BugInjector = (files: Record<string, string>) => { file: string; line: number; description: string };

const BUG_INJECTORS: Record<string, BugInjector> = {
  'css-display-none': (files) => {
    files['assets/theme.css'] = `.product-card {
  display: none;
  grid-template-columns: 1fr;
  gap: 12px;
  padding: 16px;
  border: 1px solid #ddd;
}
.product-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 24px;
}
.cart-drawer {
  position: fixed;
  top: 0;
  right: 0;
  width: 360px;
  opacity: 1;
  background: #fff;
  box-shadow: -2px 0 8px rgba(0,0,0,0.1);
}
.cart-drawer:not(.is-open) {
  transform: translateX(100%);
}
.cart-drawer.is-open {
  transform: translateX(0);
}`;
    return { file: 'assets/theme.css', line: 2, description: 'display: none hides product cards' };
  },
  'css-opacity-zero': (files) => {
    files['assets/theme.css'] = `.product-card {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  padding: 16px;
  border: 1px solid #ddd;
}
.product-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 24px;
}
.cart-drawer {
  position: fixed;
  top: 0;
  right: 0;
  width: 360px;
  opacity: 0;
  background: #fff;
  box-shadow: -2px 0 8px rgba(0,0,0,0.1);
}
.cart-drawer:not(.is-open) {
  transform: translateX(100%);
}
.cart-drawer.is-open {
  transform: translateX(0);
}`;
    return { file: 'assets/theme.css', line: 18, description: 'opacity: 0 makes cart drawer invisible' };
  },
  'liquid-wrong-variable': (files) => {
    files['sections/main-product.liquid'] = `<section class="main-product">
  {% render 'product-card', product: product %}
  <p class="product-price">{{ price | money }}</p>
</section>
{% schema %}
{"name":"Main Product","settings":[]}
{% endschema %}`;
    return { file: 'sections/main-product.liquid', line: 3, description: 'price instead of product.price' };
  },
  'liquid-wrong-iterator': (files) => {
    files['sections/collection-template.liquid'] = `<section class="collection-template">
  <div class="product-grid">
    {% for product in collection %}
      {% render 'product-card', product: product %}
    {% endfor %}
  </div>
</section>
{% schema %}
{"name":"Collection","settings":[]}
{% endschema %}`;
    return { file: 'sections/collection-template.liquid', line: 4, description: 'collection instead of collection.products' };
  },
  'schema-missing-setting': (files) => {
    files['sections/hero-banner.liquid'] = HERO_BANNER_MISSING_SETTING;
    return { file: 'sections/hero-banner.liquid', line: 8, description: 'show_title setting missing from schema' };
  },
  'schema-missing-block': (files) => {
    files['sections/testimonials.liquid'] = TESTIMONIALS_MISSING_BLOCK;
    files['templates/index.json'] = `{
  "sections": {
    "hero": {
      "type": "hero-banner",
      "settings": { "show_title": true }
    },
    "testimonials": {
      "type": "testimonials",
      "blocks": {
        "t1": { "type": "testimonial", "settings": { "quote": "Great product!" } }
      },
      "block_order": ["t1"],
      "settings": {}
    }
  },
  "order": ["hero", "testimonials"]
}`;
    return { file: 'sections/testimonials.liquid', line: 8, description: 'testimonial block type missing from schema' };
  },
  'js-defer-timing': (files) => {
    files['assets/cart.js'] = `const drawer = document.getElementById('cart-drawer');
document.querySelectorAll('.qty-plus, .qty-minus').forEach(function(btn) {
  btn.addEventListener('click', function() {
    const line = this.dataset.line;
    console.log('Quantity change for line', line);
  });
});`;
    return { file: 'assets/cart.js', line: 1, description: 'script runs before DOM ready' };
  },
  'settings-feature-disabled': (files) => {
    files['config/settings_data.json'] = `{
  "current": {
    "show_hero": false,
    "color_text": "#333333",
    "color_background": "#ffffff"
  }
}`;
    return { file: 'config/settings_data.json', line: 3, description: 'show_hero: false hides hero' };
  },
  'settings-color-contrast': (files) => {
    files['config/settings_data.json'] = `{
  "current": {
    "show_hero": true,
    "color_text": "#ffffff",
    "color_background": "#ffffff"
  }
}`;
    return { file: 'config/settings_data.json', line: 4, description: 'white text on white background' };
  },
  'crossfile-render-variable': (files) => {
    files['sections/collection-template.liquid'] = `<section class="collection-template">
  <div class="product-grid">
    {% for product in collection.products %}
      {% render 'product-card', item: product %}
    {% endfor %}
  </div>
</section>
{% schema %}
{"name":"Collection","settings":[]}
{% endschema %}`;
    return { file: 'sections/collection-template.liquid', line: 5, description: 'item: instead of product: in render' };
  },
};

// ── Generator ─────────────────────────────────────────────────────────────────

export function generateThemeFixture(scenario: BugScenario): ThemeFixture {
  const files = { ...BASE_FILES };
  const injector = BUG_INJECTORS[scenario.id];
  if (!injector) {
    throw new Error(`Unknown scenario: ${scenario.id}`);
  }
  const bugLocation = injector(files);

  const fileList = Object.entries(files).map(([path, content]) => ({ path, content }));

  return {
    files: fileList,
    bugLocation,
  };
}
