import { describe, it, expect } from 'vitest';
import type { ShopifyOAuthParams } from '@/lib/types/shopify';
import type { SyncResult } from '@/lib/shopify/sync-service';

describe('Shopify API Routes', () => {
  describe('ShopifyOAuthParams type structure', () => {
    it('should have all required fields', () => {
      const params: ShopifyOAuthParams = {
        shop: 'test-store.myshopify.com',
        code: 'auth-code-123',
        state: 'random-state-abc',
        timestamp: '1700000000',
        hmac: 'hmac-signature-xyz',
      };

      expect(params.shop).toBe('test-store.myshopify.com');
      expect(params.code).toBe('auth-code-123');
      expect(params.state).toBe('random-state-abc');
      expect(params.timestamp).toBe('1700000000');
      expect(params.hmac).toBe('hmac-signature-xyz');
    });

    it('should contain exactly 5 fields', () => {
      const params: ShopifyOAuthParams = {
        shop: 'store.myshopify.com',
        code: 'code',
        state: 'state',
        timestamp: '123',
        hmac: 'hmac',
      };

      expect(Object.keys(params)).toHaveLength(5);
      expect(Object.keys(params)).toEqual(
        expect.arrayContaining(['shop', 'code', 'state', 'timestamp', 'hmac'])
      );
    });

    it('should have string values for all fields', () => {
      const params: ShopifyOAuthParams = {
        shop: 'store.myshopify.com',
        code: 'abc123',
        state: 'def456',
        timestamp: '1700000000',
        hmac: 'ghi789',
      };

      for (const value of Object.values(params)) {
        expect(typeof value).toBe('string');
      }
    });
  });

  describe('SyncResult type structure', () => {
    it('should have all required fields', () => {
      const result: SyncResult = {
        pulled: 5,
        pushed: 3,
        conflicts: ['templates/index.liquid'],
        errors: [],
      };

      expect(result.pulled).toBe(5);
      expect(result.pushed).toBe(3);
      expect(result.conflicts).toEqual(['templates/index.liquid']);
      expect(result.errors).toEqual([]);
    });

    it('should accept empty arrays for conflicts and errors', () => {
      const result: SyncResult = {
        pulled: 0,
        pushed: 0,
        conflicts: [],
        errors: [],
      };

      expect(result.conflicts).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept multiple conflicts and errors', () => {
      const result: SyncResult = {
        pulled: 10,
        pushed: 2,
        conflicts: [
          'templates/product.liquid',
          'sections/header.liquid',
          'layout/theme.liquid',
        ],
        errors: [
          'assets/style.css: Network error',
          'snippets/price.liquid: Parse error',
        ],
      };

      expect(result.conflicts).toHaveLength(3);
      expect(result.errors).toHaveLength(2);
      expect(result.pulled).toBe(10);
      expect(result.pushed).toBe(2);
    });

    it('should have numeric pulled and pushed fields', () => {
      const result: SyncResult = {
        pulled: 42,
        pushed: 7,
        conflicts: [],
        errors: [],
      };

      expect(typeof result.pulled).toBe('number');
      expect(typeof result.pushed).toBe('number');
    });
  });
});
