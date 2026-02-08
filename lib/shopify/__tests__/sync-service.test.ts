import { describe, it, expect } from 'vitest';
import { ThemeSyncService } from '../sync-service';
import type { SyncResult } from '../sync-service';
import type { ThemeFile, ThemeFileSyncStatus } from '@/lib/types/shopify';
import { createHash } from 'crypto';

describe('ThemeSyncService', () => {
  describe('computeHash', () => {
    it('should produce consistent SHA-256 hash for same input', () => {
      const service = new ThemeSyncService();
      const content = 'test content';

      // Access private method via type assertion (testing only)
      const hash1 = (service as any).computeHash(content);
      const hash2 = (service as any).computeHash(content);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/); // SHA-256 produces 64 hex chars
    });

    it('should produce different hashes for different inputs', () => {
      const service = new ThemeSyncService();
      const hash1 = (service as any).computeHash('content1');
      const hash2 = (service as any).computeHash('content2');

      expect(hash1).not.toBe(hash2);
    });

    it('should match Node.js crypto hash', () => {
      const service = new ThemeSyncService();
      const content = 'test content';
      const expectedHash = createHash('sha256')
        .update(content, 'utf8')
        .digest('hex');
      const actualHash = (service as any).computeHash(content);

      expect(actualHash).toBe(expectedHash);
    });
  });

  describe('SyncResult structure', () => {
    it('should have correct structure', () => {
      const result: SyncResult = {
        pulled: 0,
        pushed: 0,
        conflicts: [],
        errors: [],
      };

      expect(result).toHaveProperty('pulled');
      expect(result).toHaveProperty('pushed');
      expect(result).toHaveProperty('conflicts');
      expect(result).toHaveProperty('errors');
      expect(typeof result.pulled).toBe('number');
      expect(typeof result.pushed).toBe('number');
      expect(Array.isArray(result.conflicts)).toBe(true);
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it('should allow non-zero values', () => {
      const result: SyncResult = {
        pulled: 5,
        pushed: 3,
        conflicts: ['file1.liquid', 'file2.css'],
        errors: ['file3.js: Network error'],
      };

      expect(result.pulled).toBe(5);
      expect(result.pushed).toBe(3);
      expect(result.conflicts).toHaveLength(2);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('ThemeFile type structure', () => {
    it('should match ThemeFile interface', () => {
      const themeFile: ThemeFile = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        connection_id: '123e4567-e89b-12d3-a456-426614174001',
        file_path: 'templates/product.liquid',
        content_hash: 'abc123def456',
        remote_updated_at: '2024-01-01T00:00:00Z',
        local_updated_at: '2024-01-02T00:00:00Z',
        sync_status: 'synced',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
      };

      expect(themeFile).toHaveProperty('id');
      expect(themeFile).toHaveProperty('connection_id');
      expect(themeFile).toHaveProperty('file_path');
      expect(themeFile).toHaveProperty('content_hash');
      expect(themeFile).toHaveProperty('remote_updated_at');
      expect(themeFile).toHaveProperty('local_updated_at');
      expect(themeFile).toHaveProperty('sync_status');
      expect(themeFile).toHaveProperty('created_at');
      expect(themeFile).toHaveProperty('updated_at');

      expect(typeof themeFile.id).toBe('string');
      expect(typeof themeFile.connection_id).toBe('string');
      expect(typeof themeFile.file_path).toBe('string');
      expect(typeof themeFile.sync_status).toBe('string');
    });

    it('should allow null values for optional fields', () => {
      const themeFile: ThemeFile = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        connection_id: '123e4567-e89b-12d3-a456-426614174001',
        file_path: 'templates/product.liquid',
        content_hash: null,
        remote_updated_at: null,
        local_updated_at: null,
        sync_status: 'pending',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      expect(themeFile.content_hash).toBeNull();
      expect(themeFile.remote_updated_at).toBeNull();
      expect(themeFile.local_updated_at).toBeNull();
    });

    it('should accept all valid sync status values', () => {
      const statuses: ThemeFileSyncStatus[] = [
        'synced',
        'pending',
        'conflict',
        'error',
      ];

      statuses.forEach((status) => {
        const themeFile: ThemeFile = {
          id: '123e4567-e89b-12d3-a456-426614174000',
          connection_id: '123e4567-e89b-12d3-a456-426614174001',
          file_path: 'templates/product.liquid',
          content_hash: null,
          remote_updated_at: null,
          local_updated_at: null,
          sync_status: status,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        };

        expect(themeFile.sync_status).toBe(status);
      });
    });
  });
});
