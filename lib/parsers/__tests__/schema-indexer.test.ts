import { describe, it, expect } from 'vitest';
import { extractSchemaEntries, formatSchemaSummary } from '../schema-indexer';
import { readFileSync } from 'fs';
import { join } from 'path';

const FIXTURE = readFileSync(
  join(__dirname, '../../../tests/fixtures/theme/snippets/product-form-dynamic.liquid'),
  'utf-8',
);

describe('extractSchemaEntries', () => {
  const entries = extractSchemaEntries(FIXTURE, 'snippets/product-form-dynamic.liquid');

  it('extracts section-level settings', () => {
    const settings = entries.filter(e => e.entryType === 'setting');
    expect(settings.length).toBeGreaterThanOrEqual(7);
  });

  it('skips header/paragraph settings', () => {
    const headerEntries = entries.filter(e => e.type === 'header' || e.type === 'paragraph');
    expect(headerEntries.length).toBe(0);
  });

  it('extracts blocks', () => {
    const blocks = entries.filter(e => e.entryType === 'block');
    expect(blocks.length).toBe(2);
    expect(blocks.map(b => b.id)).toContain('size_chart');
    expect(blocks.map(b => b.id)).toContain('trust_badge');
  });

  it('extracts block settings with parentBlock', () => {
    const blockSettings = entries.filter(e => e.entryType === 'block_setting');
    expect(blockSettings.length).toBeGreaterThan(0);
    const chartTitle = blockSettings.find(s => s.id === 'chart_title');
    expect(chartTitle).toBeDefined();
    expect(chartTitle!.parentBlock).toBe('size_chart');
  });

  it('extracts presets', () => {
    const presets = entries.filter(e => e.entryType === 'preset');
    expect(presets.length).toBe(1);
    expect(presets[0].label).toBe('Product Form');
  });

  it('includes defaults', () => {
    const swatchStyle = entries.find(e => e.id === 'swatch_style');
    expect(swatchStyle).toBeDefined();
    expect(swatchStyle!.defaultValue).toBe('circle');
  });

  it('includes options for select settings', () => {
    const swatchStyle = entries.find(e => e.id === 'swatch_style');
    expect(swatchStyle!.options).toBeDefined();
    expect(swatchStyle!.options!.length).toBe(3);
  });

  it('returns empty for files without schema', () => {
    const result = extractSchemaEntries('<div>{{ product.title }}</div>', 'snippets/simple.liquid');
    expect(result.length).toBe(0);
  });
});

describe('formatSchemaSummary', () => {
  const entries = extractSchemaEntries(FIXTURE, 'snippets/product-form-dynamic.liquid');
  const summary = formatSchemaSummary(entries);

  it('produces compact readable text', () => {
    expect(summary).toContain('Settings (');
    expect(summary).toContain('Blocks (');
    expect(summary).toContain('show_quantity');
    expect(summary).toContain('size_chart');
  });

  it('is much smaller than raw schema', () => {
    const schemaMatch = FIXTURE.match(/\{%[-\s]*schema\s*[-\s]*%\}([\s\S]*?)\{%[-\s]*endschema\s*[-\s]*%\}/);
    const rawSchemaSize = schemaMatch?.[0].length ?? 0;
    expect(summary.length).toBeLessThan(rawSchemaSize);
  });

  it('returns message for empty entries', () => {
    expect(formatSchemaSummary([])).toBe('No schema settings found.');
  });
});
