import { Liquid } from 'liquidjs';

/**
 * Registers Shopify-specific Liquid filters on a liquidjs engine instance.
 * These approximate common Shopify filters for realistic packing slip preview.
 */
export function registerShopifyFilters(engine: Liquid): void {
  engine.registerFilter('money', (value: unknown) => {
    const num = parseFloat(String(value ?? '0'));
    if (isNaN(num)) return '$0.00';
    return `$${num.toFixed(2)}`;
  });

  engine.registerFilter('money_with_currency', (value: unknown) => {
    const num = parseFloat(String(value ?? '0'));
    if (isNaN(num)) return '$0.00 CAD';
    return `$${num.toFixed(2)} CAD`;
  });

  engine.registerFilter('money_without_trailing_zeros', (value: unknown) => {
    const num = parseFloat(String(value ?? '0'));
    if (isNaN(num)) return '$0';
    const formatted = num.toFixed(2);
    return `$${formatted.replace(/\.00$/, '')}`;
  });

  engine.registerFilter('weight_with_unit', (grams: unknown) => {
    const g = parseFloat(String(grams ?? '0'));
    if (isNaN(g)) return '0 g';
    if (g >= 1000) return `${(g / 1000).toFixed(2)} kg`;
    return `${g} g`;
  });

  engine.registerFilter('image_url', (src: unknown, size?: string) => {
    const url = String(src ?? '');
    if (!url) return '';
    if (size) return `${url}&size=${size}`;
    return url;
  });

  engine.registerFilter('img_tag', (src: unknown, alt?: string) => {
    const url = String(src ?? '');
    if (!url) return '';
    const altAttr = alt ? ` alt="${alt}"` : ' alt=""';
    return `<img src="${url}"${altAttr} style="max-width:80px;height:auto;" />`;
  });

  engine.registerFilter('format_address', (address: unknown) => {
    if (!address || typeof address !== 'object') return '';
    const a = address as Record<string, string>;
    const parts = [
      a.name,
      a.company,
      a.address1,
      a.address2,
      [a.city, a.province_code, a.zip].filter(Boolean).join(', '),
      a.country,
    ].filter(Boolean);
    return parts.join('<br/>');
  });

  engine.registerFilter('json', (value: unknown) => {
    try {
      return JSON.stringify(value);
    } catch {
      return '{}';
    }
  });

  engine.registerFilter('pluralize', (count: unknown, singular: string, plural: string) => {
    return Number(count) === 1 ? singular : plural;
  });

  engine.registerFilter('handleize', (value: unknown) => {
    return String(value ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  });

  engine.registerFilter('url_encode', (value: unknown) => {
    return encodeURIComponent(String(value ?? ''));
  });

  engine.registerFilter('newline_to_br', (value: unknown) => {
    return String(value ?? '').replace(/\n/g, '<br/>');
  });
}
