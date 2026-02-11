import { describe, it, expect } from 'vitest';
import type {
  ShopifyConnection,
  ThemeFile,
  ShopifySyncStatus,
  ThemeFileSyncStatus,
  ShopifyOAuthParams,
} from '../../types/shopify';

describe('Shopify Types', () => {
  describe('ShopifyConnection', () => {
    it('should have correct fields', () => {
      const connection: ShopifyConnection = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        user_id: 'user-123',
        project_id: '123e4567-e89b-12d3-a456-426614174001',
        store_domain: 'mystore.myshopify.com',
        access_token_encrypted: 'encrypted_token_123',
        theme_id: '123456789',
        last_sync_at: '2026-02-07T00:00:00Z',
        sync_status: 'connected',
        scopes: ['read_themes', 'write_themes'],
        is_active: true,
        created_at: '2026-02-07T00:00:00Z',
        updated_at: '2026-02-07T00:00:00Z',
      };

      expect(connection.id).toBeDefined();
      expect(connection.project_id).toBeDefined();
      expect(connection.store_domain).toBeDefined();
      expect(connection.access_token_encrypted).toBeDefined();
      expect(connection.sync_status).toBeDefined();
      expect(Array.isArray(connection.scopes)).toBe(true);
      expect(connection.created_at).toBeDefined();
      expect(connection.updated_at).toBeDefined();
    });

    it('should allow null theme_id', () => {
      const connection: ShopifyConnection = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        user_id: 'user-123',
        project_id: '123e4567-e89b-12d3-a456-426614174001',
        store_domain: 'mystore.myshopify.com',
        access_token_encrypted: 'encrypted_token_123',
        theme_id: null,
        last_sync_at: null,
        sync_status: 'disconnected',
        scopes: [],
        is_active: true,
        created_at: '2026-02-07T00:00:00Z',
        updated_at: '2026-02-07T00:00:00Z',
      };

      expect(connection.theme_id).toBeNull();
    });

    it('should allow null last_sync_at', () => {
      const connection: ShopifyConnection = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        user_id: 'user-123',
        project_id: '123e4567-e89b-12d3-a456-426614174001',
        store_domain: 'mystore.myshopify.com',
        access_token_encrypted: 'encrypted_token_123',
        theme_id: '123456789',
        last_sync_at: null,
        sync_status: 'disconnected',
        scopes: [],
        is_active: true,
        created_at: '2026-02-07T00:00:00Z',
        updated_at: '2026-02-07T00:00:00Z',
      };

      expect(connection.last_sync_at).toBeNull();
    });

    it('should support empty scopes array', () => {
      const connection: ShopifyConnection = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        user_id: 'user-123',
        project_id: '123e4567-e89b-12d3-a456-426614174001',
        store_domain: 'mystore.myshopify.com',
        access_token_encrypted: 'encrypted_token_123',
        theme_id: null,
        last_sync_at: null,
        sync_status: 'disconnected',
        scopes: [],
        is_active: true,
        created_at: '2026-02-07T00:00:00Z',
        updated_at: '2026-02-07T00:00:00Z',
      };

      expect(connection.scopes).toEqual([]);
    });

    it('should support multiple scopes', () => {
      const connection: ShopifyConnection = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        user_id: 'user-123',
        project_id: '123e4567-e89b-12d3-a456-426614174001',
        store_domain: 'mystore.myshopify.com',
        access_token_encrypted: 'encrypted_token_123',
        theme_id: '123456789',
        last_sync_at: '2026-02-07T00:00:00Z',
        sync_status: 'connected',
        scopes: ['read_themes', 'write_themes', 'read_content', 'write_content'],
        is_active: true,
        created_at: '2026-02-07T00:00:00Z',
        updated_at: '2026-02-07T00:00:00Z',
      };

      expect(connection.scopes).toHaveLength(4);
      expect(connection.scopes).toEqual([
        'read_themes',
        'write_themes',
        'read_content',
        'write_content',
      ]);
    });
  });

  describe('ThemeFile', () => {
    it('should have correct fields', () => {
      const themeFile: ThemeFile = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        connection_id: '123e4567-e89b-12d3-a456-426614174001',
        file_path: 'templates/index.liquid',
        content_hash: 'abc123def456',
        remote_updated_at: '2026-02-07T00:00:00Z',
        local_updated_at: '2026-02-07T01:00:00Z',
        sync_status: 'synced',
        created_at: '2026-02-07T00:00:00Z',
        updated_at: '2026-02-07T01:00:00Z',
      };

      expect(themeFile.id).toBeDefined();
      expect(themeFile.connection_id).toBeDefined();
      expect(themeFile.file_path).toBeDefined();
      expect(themeFile.sync_status).toBeDefined();
      expect(themeFile.created_at).toBeDefined();
      expect(themeFile.updated_at).toBeDefined();
    });

    it('should allow null content_hash', () => {
      const themeFile: ThemeFile = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        connection_id: '123e4567-e89b-12d3-a456-426614174001',
        file_path: 'templates/index.liquid',
        content_hash: null,
        remote_updated_at: null,
        local_updated_at: null,
        sync_status: 'pending',
        created_at: '2026-02-07T00:00:00Z',
        updated_at: '2026-02-07T00:00:00Z',
      };

      expect(themeFile.content_hash).toBeNull();
    });

    it('should allow null remote_updated_at', () => {
      const themeFile: ThemeFile = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        connection_id: '123e4567-e89b-12d3-a456-426614174001',
        file_path: 'templates/index.liquid',
        content_hash: 'abc123def456',
        remote_updated_at: null,
        local_updated_at: '2026-02-07T01:00:00Z',
        sync_status: 'pending',
        created_at: '2026-02-07T00:00:00Z',
        updated_at: '2026-02-07T00:00:00Z',
      };

      expect(themeFile.remote_updated_at).toBeNull();
    });

    it('should allow null local_updated_at', () => {
      const themeFile: ThemeFile = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        connection_id: '123e4567-e89b-12d3-a456-426614174001',
        file_path: 'templates/index.liquid',
        content_hash: 'abc123def456',
        remote_updated_at: '2026-02-07T00:00:00Z',
        local_updated_at: null,
        sync_status: 'pending',
        created_at: '2026-02-07T00:00:00Z',
        updated_at: '2026-02-07T00:00:00Z',
      };

      expect(themeFile.local_updated_at).toBeNull();
    });
  });

  describe('ShopifySyncStatus', () => {
    it('should support connected status', () => {
      const status: ShopifySyncStatus = 'connected';
      expect(status).toBe('connected');
    });

    it('should support syncing status', () => {
      const status: ShopifySyncStatus = 'syncing';
      expect(status).toBe('syncing');
    });

    it('should support error status', () => {
      const status: ShopifySyncStatus = 'error';
      expect(status).toBe('error');
    });

    it('should support disconnected status', () => {
      const status: ShopifySyncStatus = 'disconnected';
      expect(status).toBe('disconnected');
    });

    it('should work with all status types in ShopifyConnection', () => {
      const baseConnection: Omit<ShopifyConnection, 'sync_status'> = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        user_id: 'user-123',
        project_id: '123e4567-e89b-12d3-a456-426614174001',
        store_domain: 'mystore.myshopify.com',
        access_token_encrypted: 'encrypted_token_123',
        theme_id: '123456789',
        is_active: true,
        last_sync_at: null,
        scopes: [],
        created_at: '2026-02-07T00:00:00Z',
        updated_at: '2026-02-07T00:00:00Z',
      };

      const connectedConnection: ShopifyConnection = {
        ...baseConnection,
        sync_status: 'connected',
        last_sync_at: '2026-02-07T00:00:00Z',
      };
      expect(connectedConnection.sync_status).toBe('connected');

      const syncingConnection: ShopifyConnection = {
        ...baseConnection,
        sync_status: 'syncing',
      };
      expect(syncingConnection.sync_status).toBe('syncing');

      const errorConnection: ShopifyConnection = {
        ...baseConnection,
        sync_status: 'error',
      };
      expect(errorConnection.sync_status).toBe('error');

      const disconnectedConnection: ShopifyConnection = {
        ...baseConnection,
        sync_status: 'disconnected',
      };
      expect(disconnectedConnection.sync_status).toBe('disconnected');
    });
  });

  describe('ThemeFileSyncStatus', () => {
    it('should support synced status', () => {
      const status: ThemeFileSyncStatus = 'synced';
      expect(status).toBe('synced');
    });

    it('should support pending status', () => {
      const status: ThemeFileSyncStatus = 'pending';
      expect(status).toBe('pending');
    });

    it('should support conflict status', () => {
      const status: ThemeFileSyncStatus = 'conflict';
      expect(status).toBe('conflict');
    });

    it('should support error status', () => {
      const status: ThemeFileSyncStatus = 'error';
      expect(status).toBe('error');
    });

    it('should work with all status types in ThemeFile', () => {
      const baseThemeFile: Omit<ThemeFile, 'sync_status'> = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        connection_id: '123e4567-e89b-12d3-a456-426614174001',
        file_path: 'templates/index.liquid',
        content_hash: 'abc123def456',
        remote_updated_at: null,
        local_updated_at: null,
        created_at: '2026-02-07T00:00:00Z',
        updated_at: '2026-02-07T00:00:00Z',
      };

      const syncedFile: ThemeFile = {
        ...baseThemeFile,
        sync_status: 'synced',
        remote_updated_at: '2026-02-07T00:00:00Z',
        local_updated_at: '2026-02-07T00:00:00Z',
      };
      expect(syncedFile.sync_status).toBe('synced');

      const pendingFile: ThemeFile = {
        ...baseThemeFile,
        sync_status: 'pending',
      };
      expect(pendingFile.sync_status).toBe('pending');

      const conflictFile: ThemeFile = {
        ...baseThemeFile,
        sync_status: 'conflict',
        remote_updated_at: '2026-02-07T00:00:00Z',
        local_updated_at: '2026-02-07T01:00:00Z',
      };
      expect(conflictFile.sync_status).toBe('conflict');

      const errorFile: ThemeFile = {
        ...baseThemeFile,
        sync_status: 'error',
      };
      expect(errorFile.sync_status).toBe('error');
    });
  });

  describe('ShopifyOAuthParams', () => {
    it('should have correct structure', () => {
      const oauthParams: ShopifyOAuthParams = {
        shop: 'mystore.myshopify.com',
        code: 'abc123def456',
        state: 'random_state_string',
        timestamp: '1641600000',
        hmac: 'sha256_hmac_hash',
      };

      expect(oauthParams.shop).toBeDefined();
      expect(oauthParams.code).toBeDefined();
      expect(oauthParams.state).toBeDefined();
      expect(oauthParams.timestamp).toBeDefined();
      expect(oauthParams.hmac).toBeDefined();
    });

    it('should require all fields', () => {
      const oauthParams: ShopifyOAuthParams = {
        shop: 'mystore.myshopify.com',
        code: 'abc123def456',
        state: 'random_state_string',
        timestamp: '1641600000',
        hmac: 'sha256_hmac_hash',
      };

      expect(typeof oauthParams.shop).toBe('string');
      expect(typeof oauthParams.code).toBe('string');
      expect(typeof oauthParams.state).toBe('string');
      expect(typeof oauthParams.timestamp).toBe('string');
      expect(typeof oauthParams.hmac).toBe('string');
    });
  });
});
