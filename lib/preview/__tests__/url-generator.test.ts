import { describe, it, expect } from 'vitest';
import { buildPreviewUrl } from '../url-generator';

describe('buildPreviewUrl', () => {
  it('builds URL with store domain and theme ID', () => {
    const url = buildPreviewUrl({
      storeDomain: 'mystore.myshopify.com',
      themeId: 12345,
    });
    expect(url).toContain('https://mystore.myshopify.com');
    expect(url).toContain('preview_theme_id=12345');
    expect(url).toMatch(/\?preview_theme_id=12345$/);
  });

  it('accepts themeId as string', () => {
    const url = buildPreviewUrl({
      storeDomain: 'mystore.myshopify.com',
      themeId: '999',
    });
    expect(url).toContain('preview_theme_id=999');
  });

  it('defaults path to /', () => {
    const url = buildPreviewUrl({
      storeDomain: 'mystore.myshopify.com',
      themeId: 1,
    });
    expect(url).toBe('https://mystore.myshopify.com/?preview_theme_id=1');
  });

  it('uses custom path when provided', () => {
    const url = buildPreviewUrl({
      storeDomain: 'mystore.myshopify.com',
      themeId: 1,
      path: '/products/foo',
    });
    expect(url).toContain('/products/foo');
    expect(url).toContain('preview_theme_id=1');
  });

  it('strips protocol from store domain', () => {
    const url = buildPreviewUrl({
      storeDomain: 'https://mystore.myshopify.com',
      themeId: 1,
    });
    expect(url).toMatch(/^https:\/\/mystore\.myshopify\.com\//);
  });
});
