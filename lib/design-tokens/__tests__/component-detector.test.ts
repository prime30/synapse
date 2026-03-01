import { describe, it, expect } from 'vitest';
import { detectComponents } from '../components/component-detector';

describe('detectComponents', () => {
  it('groups cart.liquid + cart.css + cart.js into a Cart component', () => {
    const files = [
      { path: 'sections/cart.liquid', content: '' },
      { path: 'assets/cart.css', content: '' },
      { path: 'assets/cart.js', content: '' },
    ];
    const components = detectComponents(files);
    const cart = components.find((c) => c.name === 'Cart');
    expect(cart).toBeDefined();
    expect(cart!.files).toContain('sections/cart.liquid');
    expect(cart!.files).toContain('assets/cart.css');
    expect(cart!.files).toContain('assets/cart.js');
    expect(cart!.type).toBe('section');
    expect(cart!.primaryFile).toBe('sections/cart.liquid');
  });

  it('groups product-card.liquid + product-card.css as a snippet', () => {
    const files = [
      { path: 'snippets/product-card.liquid', name: 'product-card.liquid' },
      { path: 'assets/product-card.css', name: 'product-card.css' },
    ];
    const components = detectComponents(files);
    const card = components.find((c) => c.name === 'Product Card');
    expect(card).toBeDefined();
    expect(card!.files.length).toBe(2);
    expect(card!.type).toBe('snippet');
  });

  it('creates a component for a standalone Liquid section', () => {
    const files = [
      { path: 'sections/header.liquid', content: '' },
      { path: 'sections/footer.liquid', content: '' },
    ];
    const components = detectComponents(files);
    // Each is a standalone component (liquid file alone counts)
    expect(components.find((c) => c.name === 'Header')).toBeDefined();
    expect(components.find((c) => c.name === 'Footer')).toBeDefined();
  });

  it('strips section- prefix from asset filenames for matching', () => {
    const files = [
      { path: 'sections/hero.liquid', content: '' },
      { path: 'assets/section-hero.css', content: '' },
    ];
    const components = detectComponents(files);
    const hero = components.find((c) => c.name === 'Hero');
    expect(hero).toBeDefined();
    expect(hero!.files).toContain('sections/hero.liquid');
    expect(hero!.files).toContain('assets/section-hero.css');
  });

  it('groups assets with same base name even without Liquid', () => {
    const files = [
      { path: 'assets/modal.css', content: '' },
      { path: 'assets/modal.js', content: '' },
    ];
    const components = detectComponents(files);
    const modal = components.find((c) => c.name === 'Modal');
    expect(modal).toBeDefined();
    expect(modal!.files.length).toBe(2);
  });

  it('does not create a component for a single non-Liquid file', () => {
    const files = [
      { path: 'assets/base.css', content: '' },
    ];
    const components = detectComponents(files);
    // Single CSS file with no matching Liquid = no component
    expect(components.find((c) => c.name === 'Base')).toBeUndefined();
  });

  it('handles a full Dawn-like theme with many components', () => {
    const files = [
      { path: 'sections/header.liquid', content: '' },
      { path: 'sections/footer.liquid', content: '' },
      { path: 'sections/cart-drawer.liquid', content: '' },
      { path: 'assets/cart-drawer.css', content: '' },
      { path: 'assets/cart-drawer.js', content: '' },
      { path: 'snippets/product-card.liquid', content: '' },
      { path: 'assets/product-card.css', content: '' },
      { path: 'assets/base.css', content: '' },
      { path: 'assets/constants.js', content: '' },
      { path: 'config/settings_schema.json', content: '' },
    ];
    const components = detectComponents(files);

    // Should find: Header, Footer, Cart Drawer, Product Card
    expect(components.length).toBeGreaterThanOrEqual(4);
    expect(components.find((c) => c.name === 'Cart Drawer')).toBeDefined();
    expect(components.find((c) => c.name === 'Product Card')).toBeDefined();

    // Cart Drawer should have 3 files
    const cartDrawer = components.find((c) => c.name === 'Cart Drawer')!;
    expect(cartDrawer.files.length).toBe(3);
  });

  it('returns empty array for empty file list', () => {
    expect(detectComponents([])).toEqual([]);
  });

  it('sorts components alphabetically', () => {
    const files = [
      { path: 'sections/zebra.liquid', content: '' },
      { path: 'sections/alpha.liquid', content: '' },
    ];
    const components = detectComponents(files);
    expect(components[0].name).toBe('Alpha');
    expect(components[1].name).toBe('Zebra');
  });

  it('detects button components and extracts variants from CSS', () => {
    const files = [
      { path: 'snippets/button.liquid', content: '<button class="btn btn--primary">' },
      {
        path: 'assets/button.css',
        content: `
          .btn { padding: 0.75rem 1.5rem; border-radius: 4px; }
          .btn--primary { background: #333; color: #fff; }
          .btn--secondary { background: transparent; border-color: #333; }
        `,
      },
    ];
    const components = detectComponents(files);
    const btn = components.find((c) => c.name === 'Button');
    expect(btn).toBeDefined();
    expect(btn!.variants).toContain('default');
    expect(btn!.variants).toContain('primary');
    expect(btn!.variants).toContain('secondary');
    expect(btn!.buttonTokenSet?.default?.padding).toBe('0.75rem 1.5rem');
    expect(btn!.buttonTokenSet?.primary?.background).toBe('#333');
    expect(btn!.buttonTokenSet?.primary?.color).toBe('#fff');
  });
});
