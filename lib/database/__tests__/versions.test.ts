import { describe, it, expect } from 'vitest';
import type {
  FileVersion,
  VersionMetadata,
  VersionChain,
} from '../../types/version';

describe('Version Types', () => {
  describe('FileVersion', () => {
    it('should have correct fields', () => {
      const version: FileVersion = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        file_id: '123e4567-e89b-12d3-a456-426614174001',
        version_number: 1,
        content: 'const x = 1;',
        metadata: { sizeBytes: 12, lineCount: 1 },
        structure: {},
        relationships: {},
        created_by: '123e4567-e89b-12d3-a456-426614174002',
        created_at: '2026-02-07T00:00:00Z',
        change_summary: 'Initial version',
        parent_version_id: null,
      };

      expect(version.id).toBeDefined();
      expect(version.file_id).toBeDefined();
      expect(version.version_number).toBeDefined();
      expect(version.content).toBeDefined();
      expect(version.metadata).toBeDefined();
      expect(version.structure).toBeDefined();
      expect(version.relationships).toBeDefined();
      expect(version.created_by).toBeDefined();
      expect(version.created_at).toBeDefined();
      expect(version.change_summary).toBeDefined();
      expect(version.parent_version_id).toBeDefined();
    });

    it('should allow null change_summary and parent_version_id', () => {
      const version: FileVersion = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        file_id: '123e4567-e89b-12d3-a456-426614174001',
        version_number: 1,
        content: 'const x = 1;',
        metadata: {},
        structure: {},
        relationships: {},
        created_by: '123e4567-e89b-12d3-a456-426614174002',
        created_at: '2026-02-07T00:00:00Z',
        change_summary: null,
        parent_version_id: null,
      };

      expect(version.change_summary).toBeNull();
      expect(version.parent_version_id).toBeNull();
    });
  });

  describe('VersionMetadata', () => {
    it('should have required fields', () => {
      const metadata: VersionMetadata = {
        sizeBytes: 1024,
        lineCount: 50,
        changeType: 'edit',
      };

      expect(metadata.sizeBytes).toBeDefined();
      expect(metadata.lineCount).toBeDefined();
      expect(metadata.changeType).toBeDefined();
    });

    it('should support all change types', () => {
      const createMetadata: VersionMetadata = {
        sizeBytes: 100,
        lineCount: 5,
        changeType: 'create',
      };
      expect(createMetadata.changeType).toBe('create');

      const editMetadata: VersionMetadata = {
        sizeBytes: 200,
        lineCount: 10,
        changeType: 'edit',
      };
      expect(editMetadata.changeType).toBe('edit');

      const restoreMetadata: VersionMetadata = {
        sizeBytes: 150,
        lineCount: 7,
        changeType: 'restore',
      };
      expect(restoreMetadata.changeType).toBe('restore');
    });
  });

  describe('VersionChain', () => {
    it('should have correct structure', () => {
      const chain: VersionChain = {
        fileId: '123e4567-e89b-12d3-a456-426614174001',
        versions: [
          {
            id: '123e4567-e89b-12d3-a456-426614174000',
            file_id: '123e4567-e89b-12d3-a456-426614174001',
            version_number: 1,
            content: 'const x = 1;',
            metadata: {},
            structure: {},
            relationships: {},
            created_by: '123e4567-e89b-12d3-a456-426614174002',
            created_at: '2026-02-07T00:00:00Z',
            change_summary: null,
            parent_version_id: null,
          },
        ],
        currentVersion: 1,
      };

      expect(chain.fileId).toBeDefined();
      expect(chain.versions).toBeDefined();
      expect(Array.isArray(chain.versions)).toBe(true);
      expect(chain.currentVersion).toBeDefined();
    });

    it('should allow empty versions array', () => {
      const chain: VersionChain = {
        fileId: '123e4567-e89b-12d3-a456-426614174001',
        versions: [],
        currentVersion: 0,
      };

      expect(chain.versions).toEqual([]);
      expect(chain.currentVersion).toBe(0);
    });
  });

  describe('Version number', () => {
    it('should start at 1', () => {
      const version: FileVersion = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        file_id: '123e4567-e89b-12d3-a456-426614174001',
        version_number: 1,
        content: 'const x = 1;',
        metadata: {},
        structure: {},
        relationships: {},
        created_by: '123e4567-e89b-12d3-a456-426614174002',
        created_at: '2026-02-07T00:00:00Z',
        change_summary: null,
        parent_version_id: null,
      };

      expect(version.version_number).toBe(1);
    });
  });
});
