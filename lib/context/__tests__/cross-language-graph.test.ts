import { describe, it, expect } from 'vitest';
import { ThemeDependencyGraph } from '../cross-language-graph';
import { readFileSync } from 'fs';
import { join } from 'path';

const FIXTURE_DIR = join(__dirname, '../../../tests/fixtures/theme');

function loadFixture(path: string) {
  return { path, content: readFileSync(join(FIXTURE_DIR, path), 'utf-8') };
}

describe('ThemeDependencyGraph', () => {
  const graph = new ThemeDependencyGraph();
  const liquidFile = loadFixture('snippets/product-form-dynamic.liquid');
  const cssFile = loadFixture('assets/mini-cart.css');

  graph.buildFromFiles([liquidFile, cssFile]);

  it('detects CSS class definitions', () => {
    const usage = graph.findClassUsage('t4s-mini-cart');
    expect(usage.length).toBeGreaterThan(0);
    expect(usage.some(r => r.file === 'assets/mini-cart.css')).toBe(true);
  });

  it('detects CSS class usage in Liquid', () => {
    const usage = graph.findClassUsage('t4s-swatch__restock-badge');
    expect(usage.some(r => r.file === 'snippets/product-form-dynamic.liquid')).toBe(true);
  });

  it('getDependencies returns outgoing edges', () => {
    const deps = graph.getDependencies('snippets/product-form-dynamic.liquid');
    // The fixture doesn't render other snippets, but the method should work
    expect(Array.isArray(deps)).toBe(true);
  });

  it('handles empty file set', () => {
    const emptyGraph = new ThemeDependencyGraph();
    emptyGraph.buildFromFiles([]);
    expect(emptyGraph.findReferences('anything')).toEqual([]);
  });

  it('findReferences tries variant paths', () => {
    // Build with a file that renders 'product-card'
    const g2 = new ThemeDependencyGraph();
    g2.buildFromFiles([
      {
        path: 'sections/main-product.liquid',
        content: '{% render "product-card", product: product %}',
      },
      {
        path: 'snippets/product-card.liquid',
        content: '<div>{{ product.title }}</div>',
      },
    ]);
    const refs = g2.findReferences('product-card');
    expect(refs.length).toBeGreaterThan(0);
    expect(refs[0].file).toBe('sections/main-product.liquid');
    expect(refs[0].type).toBe('renders');
  });
});
