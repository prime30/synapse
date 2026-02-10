import { describe, it, expect } from 'vitest';
import { detectComponents } from '../components/component-detector';

describe('detectComponents', () => {
  it('groups cart.liquid + cart.css + cart.js into a Cart component', () => {
    const files = [
      { path: 'sections/cart.liquid', name: 'cart.liquid' },
      { path: 'assets/cart.css', name: 'cart.css' },
      { path: 'assets/cart.js', name: 'cart.js' },
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
      { path: 'sections/header.liquid', name: 'header.liquid' },
      { path: 'sections/footer.liquid', name: 'footer.liquid' },
    ];
    const components = detectComponents(files);
    // Each is a standalone component (liquid file alone counts)
    expect(components.find((c) => c.name === 'Header')).toBeDefined();
    expect(components.find((c) => c.name === 'Footer')).toBeDefined();
  });

  it('strips section- prefix from asset filenames for matching', () => {
    const files = [
      { path: 'sections/hero.liquid', name: 'hero.liquid' },
      { path: 'assets/section-hero.css', name: 'section-hero.css' },
    ];
    const components = detectComponents(files);
    const hero = components.find((c) => c.name === 'Hero');
    expect(hero).toBeDefined();
    expect(hero!.files).toContain('sections/hero.liquid');
    expect(hero!.files).toContain('assets/section-hero.css');
  });

  it('groups assets with same base name even without Liquid', () => {
    const files = [
      { path: 'assets/modal.css', name: 'modal.css' },
      { path: 'assets/modal.js', name: 'modal.js' },
    ];
    const components = detectComponents(files);
    const modal = components.find((c) => c.name === 'Modal');
    expect(modal).toBeDefined();
    expect(modal!.files.length).toBe(2);
  });

  it('does not create a component for a single non-Liquid file', () => {
    const files = [
      { path: 'assets/base.css', name: 'base.css' },
    ];
    const components = detectComponents(files);
    // Single CSS file with no matching Liquid = no component
    expect(components.find((c) => c.name === 'Base')).toBeUndefined();
  });

  it('handles a full Dawn-like theme with many components', () => {
    const files = [
      { path: 'sections/header.liquid', name: 'header.liquid' },
      { path: 'sections/footer.liquid', name: 'footer.liquid' },
      { path: 'sections/cart-drawer.liquid', name: 'cart-drawer.liquid' },
      { path: 'assets/cart-drawer.css', name: 'cart-drawer.css' },
      { path: 'assets/cart-drawer.js', name: 'cart-drawer.js' },
      { path: 'snippets/product-card.liquid', name: 'product-card.liquid' },
      { path: 'assets/product-card.css', name: 'product-card.css' },
      { path: 'assets/base.css', name: 'base.css' },
      { path: 'assets/constants.js', name: 'constants.js' },
      { path: 'config/settings_schema.json', name: 'settings_schema.json' },
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
      { path: 'sections/zebra.liquid', name: 'zebra.liquid' },
      { path: 'sections/alpha.liquid', name: 'alpha.liquid' },
    ];
    const components = detectComponents(files);
    expect(components[0].name).toBe('Alpha');
    expect(components[1].name).toBe('Zebra');
  });
});
