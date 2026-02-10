import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ShopifyAdminAPI } from '../admin-api';
import type { ShopifyTheme, ShopifyAsset } from '../admin-api';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Helper type to access private methods in tests
type TestableAdminAPI = { apiUrl: (path: string) => string };

describe('ShopifyAdminAPI', () => {
  const storeDomain = 'test-store.myshopify.com';
  const accessToken = 'shpat_test_token_12345';
  let api: ShopifyAdminAPI;

  beforeEach(() => {
    api = new ShopifyAdminAPI(storeDomain, accessToken);
    mockFetch.mockClear();
  });

  // ── apiUrl ──────────────────────────────────────────────────────────────

  describe('apiUrl', () => {
    it('builds correct URL with store domain', () => {
      // Access private method via type assertion
      const url = (api as unknown as TestableAdminAPI).apiUrl('themes');
      expect(url).toBe(
        'https://test-store.myshopify.com/admin/api/2024-01/themes.json'
      );
    });

    it('removes protocol if present in store domain', () => {
      const apiWithProtocol = new ShopifyAdminAPI(
        'https://test-store.myshopify.com',
        accessToken
      );
      const url = (apiWithProtocol as unknown as TestableAdminAPI).apiUrl('themes');
      expect(url).toBe(
        'https://test-store.myshopify.com/admin/api/2024-01/themes.json'
      );
    });

    it('handles different API paths', () => {
      const themesUrl = (api as unknown as TestableAdminAPI).apiUrl('themes');
      const assetsUrl = (api as unknown as TestableAdminAPI).apiUrl('themes/123/assets');
      
      expect(themesUrl).toBe(
        'https://test-store.myshopify.com/admin/api/2024-01/themes.json'
      );
      expect(assetsUrl).toBe(
        'https://test-store.myshopify.com/admin/api/2024-01/themes/123/assets.json'
      );
    });
  });

  // ── ShopifyTheme type structure ──────────────────────────────────────────

  describe('ShopifyTheme type structure', () => {
    it('has all required fields with correct types', () => {
      const theme: ShopifyTheme = {
        id: 123,
        name: 'Dawn',
        role: 'main',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
      };

      expect(typeof theme.id).toBe('number');
      expect(typeof theme.name).toBe('string');
      expect(['main', 'unpublished', 'demo', 'development']).toContain(theme.role);
      expect(typeof theme.created_at).toBe('string');
      expect(typeof theme.updated_at).toBe('string');
    });

    it('accepts all valid role values', () => {
      const roles: ShopifyTheme['role'][] = ['main', 'unpublished', 'demo', 'development'];

      for (const role of roles) {
        const theme: ShopifyTheme = {
          id: 1,
          name: 'Test Theme',
          role,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        };
        expect(theme.role).toBe(role);
      }
    });

    it('handles theme with different properties', () => {
      const theme: ShopifyTheme = {
        id: 456,
        name: 'Custom Theme',
        role: 'unpublished',
        created_at: '2023-12-01T10:30:00Z',
        updated_at: '2024-01-15T14:20:00Z',
      };

      expect(theme.id).toBe(456);
      expect(theme.name).toBe('Custom Theme');
      expect(theme.role).toBe('unpublished');
    });
  });

  // ── ShopifyAsset type structure ──────────────────────────────────────────

  describe('ShopifyAsset type structure', () => {
    it('has all required fields with correct types', () => {
      const asset: ShopifyAsset = {
        key: 'templates/product.liquid',
        value: '<div>Product template</div>',
        content_type: 'text/x-liquid',
        size: 1024,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
      };

      expect(typeof asset.key).toBe('string');
      expect(typeof asset.value).toBe('string');
      expect(typeof asset.content_type).toBe('string');
      expect(typeof asset.size).toBe('number');
      expect(typeof asset.created_at).toBe('string');
      expect(typeof asset.updated_at).toBe('string');
    });

    it('allows optional value field', () => {
      const assetWithoutValue: ShopifyAsset = {
        key: 'assets/image.png',
        content_type: 'image/png',
        size: 2048,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      expect(assetWithoutValue.value).toBeUndefined();
      expect(assetWithoutValue.key).toBe('assets/image.png');
    });

    it('handles different asset types', () => {
      const liquidAsset: ShopifyAsset = {
        key: 'templates/index.liquid',
        value: '{% section "header" %}',
        content_type: 'text/x-liquid',
        size: 512,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const cssAsset: ShopifyAsset = {
        key: 'assets/style.css',
        value: '.header { color: red; }',
        content_type: 'text/css',
        size: 256,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      expect(liquidAsset.content_type).toBe('text/x-liquid');
      expect(cssAsset.content_type).toBe('text/css');
    });
  });

  // ── request method/path building ─────────────────────────────────────────

  describe('request method/path building', () => {
    it('sends GET request with correct headers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ themes: [] }),
      });

      await api.listThemes();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      
      expect(url).toBe(
        'https://test-store.myshopify.com/admin/api/2024-01/themes.json'
      );
      expect(options.method).toBe('GET');
      expect(options.headers['X-Shopify-Access-Token']).toBe(accessToken);
      expect(options.headers['Content-Type']).toBe('application/json');
    });

    it('sends PUT request with body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          asset: {
            key: 'templates/test.liquid',
            value: 'test content',
            content_type: 'text/x-liquid',
            size: 12,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        }),
      });

      await api.putAsset(123, 'templates/test.liquid', 'test content');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      
      expect(url).toBe(
        'https://test-store.myshopify.com/admin/api/2024-01/themes/123/assets.json'
      );
      expect(options.method).toBe('PUT');
      expect(JSON.parse(options.body)).toEqual({
        asset: {
          key: 'templates/test.liquid',
          value: 'test content',
        },
      });
    });

    it('sends DELETE request with query parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({}),
      });

      await api.deleteAsset(123, 'templates/test.liquid');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url] = mockFetch.mock.calls[0];
      
      expect(url).toContain('themes/123/assets');
      expect(url).toContain('.json');
      expect(url).toContain('asset[key]=templates%2Ftest.liquid');
    });

    it('encodes special characters in asset keys', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          asset: {
            key: 'templates/product with spaces.liquid',
            value: 'content',
            content_type: 'text/x-liquid',
            size: 7,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        }),
      });

      await api.getAsset(123, 'templates/product with spaces.liquid');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url] = mockFetch.mock.calls[0];
      
      expect(url).toContain('asset[key]=templates%2Fproduct%20with%20spaces.liquid');
    });

    it('createTheme sends POST with name, src, and role', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: new Headers(),
        json: async () => ({
          theme: {
            id: 999,
            name: 'Synapse Dev - proj-1',
            role: 'unpublished',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        }),
      });

      const theme = await api.createTheme(
        'Synapse Dev - proj-1',
        'https://example.com/dawn.zip',
        'unpublished'
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(
        'https://test-store.myshopify.com/admin/api/2024-01/themes.json'
      );
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body)).toEqual({
        theme: {
          name: 'Synapse Dev - proj-1',
          src: 'https://example.com/dawn.zip',
          role: 'unpublished',
        },
      });
      expect(theme.id).toBe(999);
      expect(theme.name).toBe('Synapse Dev - proj-1');
      expect(theme.role).toBe('unpublished');
    });

    it('createTheme defaults to unpublished role', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: new Headers(),
        json: async () => ({
          theme: {
            id: 1000,
            name: 'Dev Theme',
            role: 'unpublished',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        }),
      });

      await api.createTheme('Dev Theme', 'https://example.com/theme.zip');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.theme.role).toBe('unpublished');
    });
  });
});
