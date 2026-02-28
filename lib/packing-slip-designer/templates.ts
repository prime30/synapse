import type { SlipTemplate, SlipTemplateId } from './types';

const PRINT_CSS = `
@media print {
  body { margin: 0; padding: 0; }
  .packing-slip { page-break-after: always; }
  .no-print { display: none !important; }
}
@page {
  size: letter;
  margin: 0.5in;
}
`;

const MINIMAL_TEMPLATE = `<style>
  .packing-slip { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1a1a1a; max-width: 7.5in; margin: 0 auto; padding: 0.5in; font-size: 12px; line-height: 1.5; }
  .packing-slip h1 { font-size: 18px; font-weight: 700; margin: 0 0 4px; }
  .packing-slip .meta { color: #666; font-size: 11px; margin-bottom: 24px; }
  .packing-slip table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  .packing-slip th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #888; border-bottom: 1px solid #ddd; padding: 6px 8px; }
  .packing-slip td { padding: 8px; border-bottom: 1px solid #eee; font-size: 12px; }
  .packing-slip .address { margin-top: 16px; }
  .packing-slip .address-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #888; margin-bottom: 4px; }
  ${PRINT_CSS}
</style>

<div class="packing-slip">
  <h1>Packing Slip</h1>
  <div class="meta">
    Order {{ order.name }} &mdash; {{ order.created_at | date: "%B %d, %Y" }}
  </div>

  <table>
    <thead>
      <tr>
        <th>Item</th>
        <th>SKU</th>
        <th style="text-align:center">Qty</th>
      </tr>
    </thead>
    <tbody>
      {% for line_item in line_items %}
      <tr>
        <td>
          {{ line_item.title }}
          {% if line_item.variant_title != blank %}<br/><span style="color:#888;font-size:11px">{{ line_item.variant_title }}</span>{% endif %}
        </td>
        <td>{{ line_item.sku }}</td>
        <td style="text-align:center">{{ line_item.quantity }}</td>
      </tr>
      {% endfor %}
    </tbody>
  </table>

  <div class="address">
    <div class="address-label">Ship To</div>
    <div>
      {{ shipping_address.name }}<br/>
      {% if shipping_address.company != blank %}{{ shipping_address.company }}<br/>{% endif %}
      {{ shipping_address.address1 }}<br/>
      {% if shipping_address.address2 != blank %}{{ shipping_address.address2 }}<br/>{% endif %}
      {{ shipping_address.city }}, {{ shipping_address.province_code }} {{ shipping_address.zip }}<br/>
      {{ shipping_address.country }}
    </div>
  </div>
</div>`;

const BRANDED_TEMPLATE = `<style>
  .packing-slip { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1a1a1a; max-width: 7.5in; margin: 0 auto; padding: 0.5in; font-size: 12px; line-height: 1.5; }
  .packing-slip .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1a1a1a; padding-bottom: 16px; margin-bottom: 24px; }
  .packing-slip .logo-area { width: 140px; height: 50px; background: #f0f0f0; border: 1px dashed #ccc; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #999; }
  .packing-slip .order-info { text-align: right; font-size: 11px; color: #666; }
  .packing-slip .order-info strong { color: #1a1a1a; font-size: 14px; display: block; margin-bottom: 2px; }
  .packing-slip h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #888; margin: 24px 0 8px; }
  .packing-slip table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  .packing-slip th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #888; border-bottom: 2px solid #1a1a1a; padding: 8px; }
  .packing-slip td { padding: 10px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
  .packing-slip .item-image { width: 50px; height: 50px; object-fit: cover; border-radius: 4px; }
  .packing-slip .addresses { display: flex; gap: 40px; margin-top: 16px; }
  .packing-slip .addr-block { flex: 1; }
  .packing-slip .note-box { background: #f9f9f9; border: 1px solid #eee; border-radius: 4px; padding: 12px; margin-top: 16px; font-size: 11px; color: #555; }
  .packing-slip .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #ddd; text-align: center; font-size: 10px; color: #999; }
  ${PRINT_CSS}
</style>

<div class="packing-slip">
  <div class="header">
    <div class="logo-area">Your Logo</div>
    <div class="order-info">
      <strong>{{ order.name }}</strong>
      {{ order.created_at | date: "%B %d, %Y" }}<br/>
      {{ order.email }}
    </div>
  </div>

  <h2>Items in This Shipment</h2>
  <table>
    <thead>
      <tr>
        <th style="width:60px"></th>
        <th>Product</th>
        <th>SKU</th>
        <th style="text-align:center">Qty</th>
      </tr>
    </thead>
    <tbody>
      {% for line_item in line_items %}
      <tr>
        <td>
          {% if line_item.image %}<img class="item-image" src="{{ line_item.image }}" alt="{{ line_item.title }}" />{% endif %}
        </td>
        <td>
          <strong>{{ line_item.title }}</strong>
          {% if line_item.variant_title != blank %}<br/><span style="color:#888;font-size:11px">{{ line_item.variant_title }}</span>{% endif %}
        </td>
        <td>{{ line_item.sku }}</td>
        <td style="text-align:center">{{ line_item.quantity }}</td>
      </tr>
      {% endfor %}
    </tbody>
  </table>

  <div class="addresses">
    <div class="addr-block">
      <h2>Ship To</h2>
      {{ shipping_address.name }}<br/>
      {% if shipping_address.company != blank %}{{ shipping_address.company }}<br/>{% endif %}
      {{ shipping_address.address1 }}<br/>
      {% if shipping_address.address2 != blank %}{{ shipping_address.address2 }}<br/>{% endif %}
      {{ shipping_address.city }}, {{ shipping_address.province_code }} {{ shipping_address.zip }}<br/>
      {{ shipping_address.country }}
      {% if shipping_address.phone != blank %}<br/>{{ shipping_address.phone }}{% endif %}
    </div>
    <div class="addr-block">
      <h2>Bill To</h2>
      {{ billing_address.name }}<br/>
      {% if billing_address.company != blank %}{{ billing_address.company }}<br/>{% endif %}
      {{ billing_address.address1 }}<br/>
      {% if billing_address.address2 != blank %}{{ billing_address.address2 }}<br/>{% endif %}
      {{ billing_address.city }}, {{ billing_address.province_code }} {{ billing_address.zip }}<br/>
      {{ billing_address.country }}
    </div>
  </div>

  {% if order.note != blank %}
  <div class="note-box">
    <strong>Order Notes:</strong> {{ order.note }}
  </div>
  {% endif %}

  <div class="footer">
    {{ shop.name }} &mdash; {{ shop.email }}<br/>
    Thank you for your order!
  </div>
</div>`;

const DETAILED_TEMPLATE = `<style>
  .packing-slip { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1a1a1a; max-width: 7.5in; margin: 0 auto; padding: 0.5in; font-size: 12px; line-height: 1.5; }
  .packing-slip .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
  .packing-slip .logo-area { width: 160px; height: 56px; background: #f0f0f0; border: 1px dashed #ccc; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #999; }
  .packing-slip .store-info { text-align: right; font-size: 10px; color: #666; line-height: 1.6; }
  .packing-slip .divider { border: 0; border-top: 2px solid #1a1a1a; margin: 0 0 20px; }
  .packing-slip .order-bar { display: flex; justify-content: space-between; background: #f5f5f5; padding: 10px 14px; border-radius: 4px; margin-bottom: 20px; font-size: 11px; }
  .packing-slip .order-bar strong { font-size: 13px; }
  .packing-slip h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #666; margin: 20px 0 8px; }
  .packing-slip table { width: 100%; border-collapse: collapse; }
  .packing-slip th { text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; color: #888; border-bottom: 2px solid #ddd; padding: 6px 8px; }
  .packing-slip td { padding: 10px 8px; border-bottom: 1px solid #eee; vertical-align: top; font-size: 11px; }
  .packing-slip .item-img { width: 48px; height: 48px; object-fit: cover; border-radius: 3px; border: 1px solid #eee; }
  .packing-slip .tracking { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 4px; padding: 10px 14px; margin: 16px 0; font-size: 11px; }
  .packing-slip .tracking strong { color: #166534; }
  .packing-slip .addresses { display: flex; gap: 32px; margin-top: 16px; }
  .packing-slip .addr-block { flex: 1; font-size: 11px; }
  .packing-slip .totals { width: 220px; margin-left: auto; margin-top: 16px; font-size: 11px; }
  .packing-slip .totals td { padding: 3px 0; border: 0; }
  .packing-slip .totals .total-row td { font-weight: 700; font-size: 13px; border-top: 2px solid #1a1a1a; padding-top: 6px; }
  .packing-slip .note-box { background: #fffbeb; border: 1px solid #fde68a; border-radius: 4px; padding: 10px 14px; margin-top: 16px; font-size: 11px; }
  .packing-slip .barcode-area { margin-top: 24px; text-align: center; padding: 16px; border: 1px dashed #ccc; border-radius: 4px; color: #999; font-size: 10px; }
  .packing-slip .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #ddd; text-align: center; font-size: 10px; color: #999; }
  ${PRINT_CSS}
</style>

<div class="packing-slip">
  <div class="header">
    <div class="logo-area">Your Logo</div>
    <div class="store-info">
      {{ shop.name }}<br/>
      {{ shop_address.address1 }}<br/>
      {{ shop_address.city }}, {{ shop_address.province_code }} {{ shop_address.zip }}<br/>
      {{ shop.email }}<br/>
      {{ shop_address.phone }}
    </div>
  </div>

  <hr class="divider" />

  <div class="order-bar">
    <div><strong>{{ order.name }}</strong></div>
    <div>Date: {{ order.created_at | date: "%B %d, %Y" }}</div>
    <div>Customer: {{ customer.name }}</div>
  </div>

  <h2>Items</h2>
  <table>
    <thead>
      <tr>
        <th style="width:56px"></th>
        <th>Product</th>
        <th>SKU</th>
        <th style="text-align:right">Weight</th>
        <th style="text-align:right">Price</th>
        <th style="text-align:center">Qty</th>
        <th style="text-align:right">Total</th>
      </tr>
    </thead>
    <tbody>
      {% for line_item in line_items %}
      <tr>
        <td>{% if line_item.image %}<img class="item-img" src="{{ line_item.image }}" alt="{{ line_item.title }}" />{% endif %}</td>
        <td>
          <strong>{{ line_item.title }}</strong>
          {% if line_item.variant_title != blank %}<br/><span style="color:#888">{{ line_item.variant_title }}</span>{% endif %}
        </td>
        <td>{{ line_item.sku }}</td>
        <td style="text-align:right">{{ line_item.grams | weight_with_unit }}</td>
        <td style="text-align:right">{{ line_item.price | money }}</td>
        <td style="text-align:center">{{ line_item.quantity }}</td>
        <td style="text-align:right">{{ line_item.final_line_price | money }}</td>
      </tr>
      {% endfor %}
    </tbody>
  </table>

  <table class="totals">
    <tr><td>Subtotal</td><td style="text-align:right">{{ order.subtotal_price | money }}</td></tr>
    {% if order.total_discounts != "0.00" %}<tr><td>Discount</td><td style="text-align:right">-{{ order.total_discounts | money }}</td></tr>{% endif %}
    <tr><td>Shipping</td><td style="text-align:right">{% if order.shipping_price == "0.00" %}Free{% else %}{{ order.shipping_price | money }}{% endif %}</td></tr>
    <tr><td>Tax</td><td style="text-align:right">{{ order.total_tax | money }}</td></tr>
    <tr class="total-row"><td>Total</td><td style="text-align:right">{{ order.total_price | money }}</td></tr>
  </table>

  {% for line_item in line_items %}
    {% if line_item.fulfillment %}
    <div class="tracking">
      <strong>Tracking:</strong> {{ line_item.fulfillment.tracking_company }} &mdash; {{ line_item.fulfillment.tracking_number }}
    </div>
      {% break %}
    {% endif %}
  {% endfor %}

  <div class="addresses">
    <div class="addr-block">
      <h2>Ship To</h2>
      {{ shipping_address.name }}<br/>
      {% if shipping_address.company != blank %}{{ shipping_address.company }}<br/>{% endif %}
      {{ shipping_address.address1 }}<br/>
      {% if shipping_address.address2 != blank %}{{ shipping_address.address2 }}<br/>{% endif %}
      {{ shipping_address.city }}, {{ shipping_address.province_code }} {{ shipping_address.zip }}<br/>
      {{ shipping_address.country }}
      {% if shipping_address.phone != blank %}<br/>{{ shipping_address.phone }}{% endif %}
    </div>
    <div class="addr-block">
      <h2>Bill To</h2>
      {{ billing_address.name }}<br/>
      {% if billing_address.company != blank %}{{ billing_address.company }}<br/>{% endif %}
      {{ billing_address.address1 }}<br/>
      {% if billing_address.address2 != blank %}{{ billing_address.address2 }}<br/>{% endif %}
      {{ billing_address.city }}, {{ billing_address.province_code }} {{ billing_address.zip }}<br/>
      {{ billing_address.country }}
    </div>
  </div>

  {% if order.note != blank %}
  <div class="note-box">
    <strong>Order Notes:</strong> {{ order.note }}
  </div>
  {% endif %}

  <div class="barcode-area">
    Barcode / QR area &mdash; {{ order.name }}
  </div>

  <div class="footer">
    {{ shop.name }} &bull; {{ shop.domain }} &bull; {{ shop.email }}<br/>
    Thank you for shopping with us!
  </div>
</div>`;

const COMPACT_TEMPLATE = `<style>
  .packing-slip { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1a1a1a; max-width: 7.5in; margin: 0 auto; padding: 0.3in; font-size: 10px; line-height: 1.4; }
  .packing-slip .top { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1px solid #333; padding-bottom: 6px; margin-bottom: 10px; }
  .packing-slip .top h1 { font-size: 13px; margin: 0; }
  .packing-slip .top .meta { font-size: 9px; color: #666; }
  .packing-slip table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  .packing-slip th { text-align: left; font-size: 8px; text-transform: uppercase; letter-spacing: 0.06em; color: #666; border-bottom: 1px solid #999; padding: 3px 4px; }
  .packing-slip td { padding: 4px; border-bottom: 1px solid #eee; font-size: 10px; }
  .packing-slip .ship-to { font-size: 10px; line-height: 1.5; }
  .packing-slip .ship-to strong { font-size: 8px; text-transform: uppercase; letter-spacing: 0.06em; color: #666; display: block; margin-bottom: 2px; }
  .packing-slip .compact-footer { margin-top: 10px; font-size: 8px; color: #999; text-align: center; }
  ${PRINT_CSS}
</style>

<div class="packing-slip">
  <div class="top">
    <h1>{{ shop.name }}</h1>
    <div class="meta">{{ order.name }} &mdash; {{ order.created_at | date: "%b %d, %Y" }}</div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Item</th>
        <th>SKU</th>
        <th style="text-align:center">Qty</th>
      </tr>
    </thead>
    <tbody>
      {% for line_item in line_items %}
      <tr>
        <td>{{ line_item.title }}{% if line_item.variant_title != blank %} <span style="color:#888">({{ line_item.variant_title }})</span>{% endif %}</td>
        <td>{{ line_item.sku }}</td>
        <td style="text-align:center">{{ line_item.quantity }}</td>
      </tr>
      {% endfor %}
    </tbody>
  </table>

  <div class="ship-to">
    <strong>Ship To</strong>
    {{ shipping_address.name }}, {{ shipping_address.address1 }}{% if shipping_address.address2 != blank %}, {{ shipping_address.address2 }}{% endif %}, {{ shipping_address.city }}, {{ shipping_address.province_code }} {{ shipping_address.zip }}, {{ shipping_address.country }}
  </div>

  {% if order.note != blank %}
  <div style="margin-top:8px;font-size:9px;color:#555"><strong>Note:</strong> {{ order.note }}</div>
  {% endif %}

  <div class="compact-footer">{{ shop.name }} &bull; {{ shop.email }}</div>
</div>`;

const ALL_TEMPLATES: SlipTemplate[] = [
  { id: 'minimal', name: 'Minimal', description: 'Clean, text-only layout with order number, item table, and shipping address.', liquid: MINIMAL_TEMPLATE },
  { id: 'branded', name: 'Branded', description: 'Logo placeholder, styled header, product images, both addresses, and order notes.', liquid: BRANDED_TEMPLATE },
  { id: 'detailed', name: 'Detailed', description: 'Full details: images, SKU, weight, price, tracking, totals, and barcode area.', liquid: DETAILED_TEMPLATE },
  { id: 'compact', name: 'Compact', description: 'Space-efficient for small printers. Single-column, condensed typography.', liquid: COMPACT_TEMPLATE },
];

export function getTemplate(id: SlipTemplateId): string {
  const tpl = ALL_TEMPLATES.find((t) => t.id === id);
  return tpl?.liquid ?? '';
}

export function getAllTemplates(): SlipTemplate[] {
  return ALL_TEMPLATES;
}
