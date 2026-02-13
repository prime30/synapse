import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';

import { ShopifyOAuthService } from '../oauth';
import { encryptToken, decryptToken } from '../token-manager';

// Mock supabase server client so token-manager module loads without next/headers
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

describe('ShopifyOAuthService', () => {
  let service: ShopifyOAuthService;

  beforeEach(() => {
    vi.stubEnv('SHOPIFY_API_KEY', 'test-api-key');
    vi.stubEnv('SHOPIFY_API_SECRET', 'test-api-secret');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.com');
    service = new ShopifyOAuthService();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // ── getInstallUrl ────────────────────────────────────────────────────

  describe('getInstallUrl', () => {
    it('builds correct OAuth URL with all required params', () => {
      const url = service.getInstallUrl(
        'test-store.myshopify.com',
        'test-state'
      );
      const parsed = new URL(url);

      expect(parsed.origin).toBe('https://test-store.myshopify.com');
      expect(parsed.pathname).toBe('/admin/oauth/authorize');
      expect(parsed.searchParams.get('client_id')).toBe('test-api-key');
      expect(parsed.searchParams.get('scope')).toBe(
        'read_themes,write_themes,read_content,write_content,read_online_store_navigation,write_online_store_navigation,read_discounts,write_discounts,read_files,write_files,read_products,read_inventory'
      );
      expect(parsed.searchParams.get('redirect_uri')).toBe(
        'https://app.example.com/api/shopify/callback'
      );
      expect(parsed.searchParams.get('state')).toBe('test-state');
    });

    it('encodes special characters in shop domain', () => {
      const url = service.getInstallUrl('my-store.myshopify.com', 'abc123');
      expect(url).toContain('https://my-store.myshopify.com/admin/oauth/authorize');
    });
  });

  // ── generateState ────────────────────────────────────────────────────

  describe('generateState', () => {
    it('returns a 32-character hex string', () => {
      const state = service.generateState();
      expect(state).toMatch(/^[a-f0-9]{32}$/);
    });

    it('returns unique values on each call', () => {
      const state1 = service.generateState();
      const state2 = service.generateState();
      expect(state1).not.toBe(state2);
    });
  });

  // ── validateHmac ─────────────────────────────────────────────────────

  describe('validateHmac', () => {
    function computeHmac(
      params: Record<string, string>,
      secret: string
    ): string {
      const message = Object.keys(params)
        .sort()
        .map((key) => `${key}=${params[key]}`)
        .join('&');
      return crypto
        .createHmac('sha256', secret)
        .update(message)
        .digest('hex');
    }

    it('returns true for valid HMAC', () => {
      const baseParams = {
        shop: 'test-store.myshopify.com',
        code: 'test-code',
        state: 'test-state',
        timestamp: '1234567890',
      };

      const hmac = computeHmac(baseParams, 'test-api-secret');

      expect(service.validateHmac({ ...baseParams, hmac })).toBe(true);
    });

    it('returns false for invalid HMAC', () => {
      // Provide an HMAC with the correct length (64 hex chars) but wrong value
      const params = {
        shop: 'test-store.myshopify.com',
        code: 'test-code',
        state: 'test-state',
        timestamp: '1234567890',
        hmac: 'a'.repeat(64),
      };

      expect(service.validateHmac(params)).toBe(false);
    });

    it('returns false for tampered parameters', () => {
      const baseParams = {
        shop: 'test-store.myshopify.com',
        code: 'test-code',
        state: 'test-state',
        timestamp: '1234567890',
      };

      const hmac = computeHmac(baseParams, 'test-api-secret');

      // Tamper with the code parameter
      expect(
        service.validateHmac({ ...baseParams, code: 'tampered', hmac })
      ).toBe(false);
    });

    it('returns false when HMAC has different length', () => {
      const params = {
        shop: 'test-store.myshopify.com',
        code: 'test-code',
        state: 'test-state',
        timestamp: '1234567890',
        hmac: 'short',
      };

      expect(service.validateHmac(params)).toBe(false);
    });
  });

  // ── encrypt / decrypt roundtrip (via TokenManager helpers) ───────────

  describe('encrypt/decrypt roundtrip via TokenManager', () => {
    beforeEach(() => {
      // 32 bytes = 64 hex characters for AES-256
      vi.stubEnv(
        'SHOPIFY_ENCRYPTION_KEY',
        'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'
      );
    });

    it('encrypts and decrypts a token correctly', () => {
      const token = 'shpat_test_access_token_12345';
      const encrypted = encryptToken(token);
      const decrypted = decryptToken(encrypted);
      expect(decrypted).toBe(token);
    });
  });
});
