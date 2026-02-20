import { describe, it, expect } from 'vitest';
import {
  pathnameToTemplateType,
  pathnameToTemplatePath,
  deriveRelevantLiquidFiles,
  flattenRelevantFiles,
} from '../relevant-liquid-files';

describe('pathnameToTemplateType', () => {
  it('maps / to index', () => {
    expect(pathnameToTemplateType('/')).toBe('index');
  });
  it('maps /products/... to product', () => {
    expect(pathnameToTemplateType('/products/superweft')).toBe('product');
  });
  it('maps /collections to list-collections', () => {
    expect(pathnameToTemplateType('/collections')).toBe('list-collections');
    expect(pathnameToTemplateType('/collections/')).toBe('list-collections');
  });
  it('maps /collections/all to collection', () => {
    expect(pathnameToTemplateType('/collections/all')).toBe('collection');
  });
  it('maps /cart to cart', () => {
    expect(pathnameToTemplateType('/cart')).toBe('cart');
  });
  it('maps /pages/about to page', () => {
    expect(pathnameToTemplateType('/pages/about')).toBe('page');
  });
  it('maps /blogs/news/article-slug to article', () => {
    expect(pathnameToTemplateType('/blogs/news/my-article')).toBe('article');
  });
  it('maps /blogs/news to blog', () => {
    expect(pathnameToTemplateType('/blogs/news')).toBe('blog');
  });
  it('maps /search to search', () => {
    expect(pathnameToTemplateType('/search')).toBe('search');
  });
  it('maps /404 to 404', () => {
    expect(pathnameToTemplateType('/404')).toBe('404');
  });
  it('returns null for unknown paths', () => {
    expect(pathnameToTemplateType('/unknown/path')).toBeNull();
  });
  it('strips query params before matching', () => {
    expect(pathnameToTemplateType('/products/superweft?variant=123')).toBe('product');
  });
});

describe('pathnameToTemplatePath', () => {
  it('returns templates/product.liquid for /products/foo', () => {
    expect(pathnameToTemplatePath('/products/foo')).toBe('templates/product.liquid');
  });
  it('returns templates/index.liquid for /', () => {
    expect(pathnameToTemplatePath('/')).toBe('templates/index.liquid');
  });
  it('returns null for unknown paths', () => {
    expect(pathnameToTemplatePath('/unknown')).toBeNull();
  });
});

describe('deriveRelevantLiquidFiles', () => {
  it('returns template + section paths for a product page', () => {
    const result = deriveRelevantLiquidFiles(
      'https://mystore.myshopify.com/products/superweft',
      [
        { id: 'shopify-section-template--123__main-product', type: 'main-product' },
        { id: 'shopify-section-template--123__related-products', type: 'related-products' },
      ],
    );
    expect(result.templatePath).toBe('templates/product.liquid');
    expect(result.sectionPaths).toEqual([
      'sections/main-product.liquid',
      'sections/related-products.liquid',
    ]);
  });

  it('deduplicates section paths', () => {
    const result = deriveRelevantLiquidFiles('/', [
      { id: 'shopify-section-header', type: 'header' },
      { id: 'shopify-section-header-2', type: 'header' },
    ]);
    expect(result.sectionPaths).toEqual(['sections/header.liquid']);
  });

  it('falls back to normalized id when type is empty', () => {
    const result = deriveRelevantLiquidFiles('/', [
      { id: 'shopify-section-template--123__featured_collection', type: '' },
    ]);
    expect(result.sectionPaths).toEqual(['sections/featured_collection.liquid']);
  });

  it('handles proxy URL with path query param', () => {
    const result = deriveRelevantLiquidFiles(
      'http://localhost:3000/api/projects/abc/preview?path=%2Fproducts%2Ffoo',
      [],
    );
    expect(result.templatePath).toBe('templates/product.liquid');
  });

  it('includes related snippet paths for product template', () => {
    const result = deriveRelevantLiquidFiles('/products/foo', []);
    expect(result.snippetPaths).toContain('snippets/product-form.liquid');
    expect(result.snippetPaths).toContain('snippets/product-form-dynamic.liquid');
  });

  it('includes related snippet paths when main-product section is visible', () => {
    const result = deriveRelevantLiquidFiles('/products/bar', [
      { id: 'shopify-section-template--1__main-product', type: 'main-product' },
    ]);
    expect(result.snippetPaths).toContain('snippets/product-form.liquid');
    expect(result.snippetPaths).toContain('snippets/product-form-dynamic.liquid');
  });
});

describe('flattenRelevantFiles', () => {
  it('returns template first, then section paths in given order', () => {
    const result = flattenRelevantFiles({
      templatePath: 'templates/product.liquid',
      sectionPaths: ['sections/header.liquid', 'sections/main-product.liquid'],
      snippetPaths: [],
    });
    expect(result).toEqual([
      'templates/product.liquid',
      'sections/header.liquid',
      'sections/main-product.liquid',
    ]);
  });

  it('returns only sections when no template', () => {
    const result = flattenRelevantFiles({
      templatePath: null,
      sectionPaths: ['sections/header.liquid'],
      snippetPaths: [],
    });
    expect(result).toEqual(['sections/header.liquid']);
  });

  it('returns empty array when nothing is relevant', () => {
    const result = flattenRelevantFiles({
      templatePath: null,
      sectionPaths: [],
      snippetPaths: [],
    });
    expect(result).toEqual([]);
  });
});
