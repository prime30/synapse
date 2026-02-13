import { describe, it, expect } from 'vitest';
import { buildPreviewUrl } from '../url-generator';

describe('buildPreviewUrl', () => {
  it('builds proxy URL with project ID', () => {
    const url = buildPreviewUrl({
      projectId: 'abc-123',
    });
    expect(url).toBe('/api/projects/abc-123/preview?path=%2F');
  });

  it('defaults path to /', () => {
    const url = buildPreviewUrl({
      projectId: 'abc-123',
    });
    expect(url).toContain('path=%2F');
  });

  it('uses custom path when provided', () => {
    const url = buildPreviewUrl({
      projectId: 'abc-123',
      path: '/products/foo',
    });
    expect(url).toContain('path=%2Fproducts%2Ffoo');
  });

  it('encodes projectId', () => {
    const url = buildPreviewUrl({
      projectId: 'has spaces',
      path: '/',
    });
    expect(url).toContain('has%20spaces');
  });

  it('handles path without leading slash', () => {
    const url = buildPreviewUrl({
      projectId: 'abc-123',
      path: 'collections/all',
    });
    expect(url).toContain('path=%2Fcollections%2Fall');
  });
});
