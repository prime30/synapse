import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import type { ShopifyConnection } from '@/lib/types/shopify';
import { encryptToken, decryptToken } from '../token-manager';

// Mock supabase server client so the module loads without next/headers
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

describe('ShopifyTokenManager', () => {
  const TEST_KEY =
    'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';

  beforeEach(() => {
    vi.stubEnv('SHOPIFY_ENCRYPTION_KEY', TEST_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // ── encrypt / decrypt ────────────────────────────────────────────────

  describe('encrypt/decrypt', () => {
    it('are inverse operations', () => {
      const original = 'shpat_test_token_12345';
      const encrypted = encryptToken(original);
      const decrypted = decryptToken(encrypted);
      expect(decrypted).toBe(original);
    });

    it('handles various token formats', () => {
      const tokens = [
        'shpat_abc123',
        'a-very-long-token-with-special-chars!@#$%^&*()',
        'short',
        '1234567890'.repeat(10),
      ];

      for (const token of tokens) {
        const encrypted = encryptToken(token);
        const decrypted = decryptToken(encrypted);
        expect(decrypted).toBe(token);
      }
    });

    it('produces different ciphertext for same input due to random IV', () => {
      const token = 'shpat_test_token_12345';
      const encrypted1 = encryptToken(token);
      const encrypted2 = encryptToken(token);
      expect(encrypted1).not.toBe(encrypted2);
    });

    it('encrypted format is iv_hex:ciphertext_hex', () => {
      const encrypted = encryptToken('test-token');
      expect(encrypted).toMatch(/^[a-f0-9]{32}:[a-f0-9]+$/);
    });

    it('throws on invalid encrypted format', () => {
      expect(() => decryptToken('no-colon-here')).toThrow(
        'Invalid encrypted token format'
      );
    });

    it('throws when encryption key is not set', () => {
      vi.stubEnv('SHOPIFY_ENCRYPTION_KEY', '');
      expect(() => encryptToken('test')).toThrow();
    });
  });

  // ── ShopifyConnection type shape ─────────────────────────────────────

  describe('ShopifyConnection type shape', () => {
    it('has all required fields with correct types', () => {
      const connection: ShopifyConnection = {
        id: 'conn-1',
        project_id: 'proj-1',
        store_domain: 'test.myshopify.com',
        access_token_encrypted: 'iv:encrypted',
        theme_id: null,
        last_sync_at: null,
        sync_status: 'connected',
        scopes: ['read_themes', 'write_themes'],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      expect(connection.id).toBe('conn-1');
      expect(connection.project_id).toBe('proj-1');
      expect(connection.store_domain).toBe('test.myshopify.com');
      expect(connection.access_token_encrypted).toBe('iv:encrypted');
      expect(connection.theme_id).toBeNull();
      expect(connection.last_sync_at).toBeNull();
      expect(connection.sync_status).toBe('connected');
      expect(connection.scopes).toEqual(['read_themes', 'write_themes']);
      expect(connection.created_at).toBeDefined();
      expect(connection.updated_at).toBeDefined();
    });

    it('accepts all valid sync statuses', () => {
      const statuses: ShopifyConnection['sync_status'][] = [
        'connected',
        'syncing',
        'error',
        'disconnected',
      ];

      for (const status of statuses) {
        const conn: ShopifyConnection = {
          id: 'conn-1',
          project_id: 'proj-1',
          store_domain: 'test.myshopify.com',
          access_token_encrypted: 'encrypted',
          theme_id: 'theme-1',
          last_sync_at: new Date().toISOString(),
          sync_status: status,
          scopes: ['read_themes'],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        expect(conn.sync_status).toBe(status);
      }
    });

    it('allows nullable fields', () => {
      const connection: ShopifyConnection = {
        id: 'conn-2',
        project_id: 'proj-2',
        store_domain: 'shop.myshopify.com',
        access_token_encrypted: 'encrypted',
        theme_id: null,
        last_sync_at: null,
        sync_status: 'disconnected',
        scopes: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      expect(connection.theme_id).toBeNull();
      expect(connection.last_sync_at).toBeNull();
    });
  });
});
