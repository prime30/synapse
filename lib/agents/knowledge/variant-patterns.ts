/**
 * Knowledge module: High-variant product patterns for Shopify themes.
 * Covers Liquid, JavaScript, CSS, and JSON template patterns needed
 * when products have 100+ variants (up to 2000 as of Shopify 2024+).
 */

export const VARIANT_PATTERNS = `## High-Variant Product Patterns

Shopify supports up to **2000 variants per product** (increased from 100 in 2024). Products with 100+ variants (e.g. 10 colors × 5 sizes × 3 lengths = 150) need special handling across Liquid, JavaScript, and CSS.

### Variant Data Access

- **Liquid \`product.variants\`** is NOT paginated — all variants load at once in the template
- **REST API** caps at 100 variants per product — use GraphQL \`productVariants\` with cursor pagination for 100+
- **\`{{ product.variants | json }}\`** can produce 100KB+ of JSON for 2000 variants — inject via \`<script type="application/json">\`, never inline
- **GraphQL \`totalVariants\`** field: use to detect high-variant products before rendering
- **Combined Listings** (Shopify 2024+): virtual products that group related products as "variants" — treated as a single product in theme but backed by multiple product records

### Liquid Patterns

\`\`\`liquid
{% comment %} GOOD: Use product.options_with_values for option UI — O(options) not O(variants) {% endcomment %}
{% for option in product.options_with_values %}
  <fieldset data-option-position="{{ option.position }}">
    <legend>{{ option.name }}</legend>
    {% for value in option.values %}
      <input type="radio" name="{{ option.name }}" value="{{ value }}"
        {% if option.selected_value == value %}checked{% endif %}>
      <label>{{ value }}</label>
    {% endfor %}
  </fieldset>
{% endfor %}

{% comment %} GOOD: Precompute availability matrix as JSON for JavaScript {% endcomment %}
<script type="application/json" id="product-variants-json">
  {{ product.variants | json }}
</script>

{% comment %} BAD: Never iterate all variants for rendering UI elements {% endcomment %}
{% comment %} This creates 2000 DOM elements for a max-variant product {% endcomment %}
{% for variant in product.variants %}
  <option value="{{ variant.id }}">{{ variant.title }}</option>
{% endfor %}

{% comment %} GOOD: Use selected_or_first_available_variant for initial state {% endcomment %}
{% assign current_variant = product.selected_or_first_available_variant %}

{% comment %} GOOD: Check variant count to conditionally render different UIs {% endcomment %}
{% if product.variants.size > 100 %}
  {% render 'product-form-cascading', product: product %}
{% else %}
  {% render 'product-form-standard', product: product %}
{% endif %}
\`\`\`

### JavaScript Patterns

\`\`\`javascript
// GOOD: Build option→variant lookup map once, O(1) per selection change
function buildVariantMap(variants) {
  const map = new Map();
  for (const variant of variants) {
    const key = variant.options.join(' / ');
    map.set(key, variant);
  }
  return map;
}

// GOOD: Precompute availability matrix for option cascading
function buildAvailabilityMatrix(variants, options) {
  const matrix = {};
  for (const opt of options) {
    matrix[opt.name] = {};
    for (const val of opt.values) {
      matrix[opt.name][val] = variants.some(v =>
        v.options[opt.position - 1] === val && v.available
      );
    }
  }
  return matrix;
}

// GOOD: Cascade option filtering — selecting Color filters available Sizes
function getAvailableValues(variants, selectedOptions, targetOptionIndex) {
  return [...new Set(
    variants
      .filter(v => selectedOptions.every((sel, i) =>
        i === targetOptionIndex || !sel || v.options[i] === sel
      ))
      .filter(v => v.available)
      .map(v => v.options[targetOptionIndex])
  )];
}

// GOOD: Parse variant JSON once from script tag, not from inline
const variantData = JSON.parse(
  document.getElementById('product-variants-json').textContent
);
const variantMap = buildVariantMap(variantData);

// GOOD: Batch DOM updates with requestAnimationFrame
function updateVariantUI(variant) {
  requestAnimationFrame(() => {
    priceEl.textContent = variant.price;
    imageEl.src = variant.featured_image?.src || '';
    addToCartBtn.disabled = !variant.available;
  });
}
\`\`\`

### CSS Patterns

\`\`\`css
/* Swatch grid: wraps gracefully for 20+ color options */
.option-swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  max-height: 12rem; /* Collapse with scroll for 30+ swatches */
  overflow-y: auto;
}

/* Unavailable option: strikethrough, reduced opacity */
.option-value[data-available="false"] {
  opacity: 0.4;
  text-decoration: line-through;
  pointer-events: none;
}

/* Size grid: responsive for many size options */
.option-sizes {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(3rem, 1fr));
  gap: 0.25rem;
}
\`\`\`

### JSON Template Patterns

Product template JSON (\`templates/product.json\`) for high-variant products should include:
- A main-product section with variant-aware blocks (option selectors, price display, availability)
- Variant media association (variant images linked to option values)
- Structured data block for JSON-LD with variant offers

### Performance Thresholds

| Variant Count | Strategy |
|---|---|
| 1–20 | Standard: iterate variants, simple select dropdown |
| 21–100 | Enhanced: option-based selectors, swatch rendering |
| 101–500 | Cascading: option filtering, lazy availability check, JSON data injection |
| 501–2000 | Advanced: virtual option rendering, paginated variant fetch, deferred availability |

### Common Pitfalls

- **\`{% for variant in product.variants %}\`** in the DOM creates O(n) elements — at 2000 variants this is 2000 \`<option>\` tags
- **Inline \`{{ product | json }}\`** in a \`<script>\` attribute bloats HTML — use a separate \`<script type="application/json">\` tag
- **No availability matrix** means the JS must iterate all variants on every option change — O(n) per interaction
- **Missing option cascading** shows Size options that don't exist for the selected Color
- **Image gallery ignoring variant images** — each variant can have its own image; the gallery should filter by selected option
`;

export const VARIANT_PATTERNS_KEYWORDS = [
  'variant', 'variants', 'option', 'options', 'swatch', 'swatches',
  'product form', 'product-form', 'color', 'size', 'availability',
  'add to cart', 'add-to-cart', 'variant picker', 'option selector',
  'product page', 'pdp', 'product template', 'high variant',
  'variant count', 'cascading', 'option filtering', 'variant image',
  'selected_or_first_available', 'product.variants', 'options_with_values',
  'combined listing', 'variant json', 'availability matrix',
];

export const VARIANT_PATTERNS_TOKENS = 1200;
