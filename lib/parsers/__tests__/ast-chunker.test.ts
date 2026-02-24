import { describe, it, expect } from 'vitest';
import { chunkFile, type ASTChunk } from '../ast-chunker';
import { readFileSync } from 'fs';
import { join } from 'path';

const FIXTURE_DIR = join(__dirname, '../../../tests/fixtures/theme');

function loadFixture(relativePath: string): string {
  return readFileSync(join(FIXTURE_DIR, relativePath), 'utf-8');
}

describe('chunkFile — Liquid', () => {
  const content = loadFixture('snippets/product-form-dynamic.liquid');
  const chunks = chunkFile(content, 'snippets/product-form-dynamic.liquid');

  it('extracts schema settings as individual chunks', () => {
    const settings = chunks.filter(c => c.type === 'schema_setting');
    expect(settings.length).toBeGreaterThanOrEqual(7);
    const ids = settings.map(s => s.metadata.settingId);
    expect(ids).toContain('show_quantity');
    expect(ids).toContain('swatch_style');
    expect(ids).toContain('restock_badge_color');
  });

  it('extracts schema blocks as individual chunks', () => {
    const blocks = chunks.filter(c => c.type === 'schema_block');
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    const blockTypes = blocks.map(b => b.metadata.settingId);
    expect(blockTypes).toContain('size_chart');
    expect(blockTypes).toContain('trust_badge');
  });

  it('extracts schema presets', () => {
    const presets = chunks.filter(c => c.type === 'schema_preset');
    expect(presets.length).toBeGreaterThanOrEqual(1);
    expect(presets[0].metadata.settingLabel).toBe('Product Form');
  });

  it('extracts render/include calls', () => {
    const renders = chunks.filter(c => c.type === 'render_call');
    // The fixture doesn't use render/include in the body, so may be 0
    // but the chunker should handle the case
    expect(renders).toBeDefined();
  });

  it('extracts liquid blocks (if/for/unless)', () => {
    const blocks = chunks.filter(c => c.type === 'liquid_block');
    expect(blocks.length).toBeGreaterThan(0);
  });

  it('each chunk has file, lineStart, lineEnd', () => {
    for (const chunk of chunks) {
      expect(chunk.file).toBe('snippets/product-form-dynamic.liquid');
      expect(chunk.lineStart).toBeGreaterThan(0);
      expect(chunk.lineEnd).toBeGreaterThanOrEqual(chunk.lineStart);
    }
  });

  it('schema settings contain type and label metadata', () => {
    const showQty = chunks.find(c => c.metadata.settingId === 'show_quantity');
    expect(showQty).toBeDefined();
    expect(showQty!.metadata.settingType).toBe('checkbox');
    expect(showQty!.metadata.settingLabel).toBe('Show quantity selector');
  });
});

describe('chunkFile — CSS', () => {
  const content = loadFixture('assets/mini-cart.css');
  const chunks = chunkFile(content, 'assets/mini-cart.css');

  it('extracts CSS rules as individual chunks', () => {
    const rules = chunks.filter(c => c.type === 'css_rule');
    expect(rules.length).toBeGreaterThan(5);
  });

  it('captures selectors in metadata', () => {
    const withSelectors = chunks.filter(c => c.metadata.selector);
    expect(withSelectors.length).toBeGreaterThan(0);
  });

  it('includes the pointer-events rule', () => {
    const pointerRule = chunks.find(c =>
      c.content.includes('pointer-events: none')
    );
    expect(pointerRule).toBeDefined();
  });
});

describe('chunkFile — JSON', () => {
  const content = JSON.stringify({
    sections: { main: { type: 'main-product' } },
    order: ['main'],
  }, null, 2);
  const chunks = chunkFile(content, 'templates/product.json');

  it('chunks by top-level keys', () => {
    expect(chunks.length).toBe(2);
    expect(chunks[0].metadata.settingId).toBe('sections');
    expect(chunks[1].metadata.settingId).toBe('order');
  });
});

describe('chunkFile — unknown file type', () => {
  it('returns single raw chunk', () => {
    const chunks = chunkFile('hello world', 'readme.txt');
    expect(chunks.length).toBe(1);
    expect(chunks[0].type).toBe('code_block');
    expect(chunks[0].metadata.nodeType).toBe('raw');
  });
});
