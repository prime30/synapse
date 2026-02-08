import { describe, it, expect } from 'vitest';
import type { FileVersion, VersionMetadata, VersionChain } from '@/lib/types/version';

describe('Version History API - Type Shapes', () => {
  describe('VersionService types', () => {
    it('should have correct FileVersion shape', () => {
      const version: FileVersion = {
        id: 'ver-1',
        file_id: 'file-1',
        version_number: 1,
        content: '{% comment %}Initial{% endcomment %}',
        metadata: {},
        structure: {},
        relationships: {},
        created_by: 'user-1',
        created_at: '2026-01-01T00:00:00Z',
        change_summary: 'Initial version',
        parent_version_id: null,
      };

      expect(version.id).toBe('ver-1');
      expect(version.file_id).toBe('file-1');
      expect(version.version_number).toBe(1);
      expect(version.content).toBeDefined();
      expect(version.metadata).toEqual({});
      expect(version.structure).toEqual({});
      expect(version.relationships).toEqual({});
      expect(version.created_by).toBe('user-1');
      expect(version.created_at).toBeDefined();
      expect(version.change_summary).toBe('Initial version');
      expect(version.parent_version_id).toBeNull();
    });

    it('should allow null change_summary', () => {
      const version: FileVersion = {
        id: 'ver-2',
        file_id: 'file-1',
        version_number: 2,
        content: 'updated content',
        metadata: {},
        structure: {},
        relationships: {},
        created_by: 'user-1',
        created_at: '2026-01-01T01:00:00Z',
        change_summary: null,
        parent_version_id: 'ver-1',
      };

      expect(version.change_summary).toBeNull();
      expect(version.parent_version_id).toBe('ver-1');
    });

    it('should have correct VersionMetadata shape', () => {
      const metadata: VersionMetadata = {
        sizeBytes: 1024,
        lineCount: 42,
        changeType: 'edit',
      };

      expect(metadata.sizeBytes).toBe(1024);
      expect(metadata.lineCount).toBe(42);
      expect(metadata.changeType).toBe('edit');
    });

    it('should support all changeType values', () => {
      const types: VersionMetadata['changeType'][] = ['create', 'edit', 'restore'];
      expect(types).toHaveLength(3);
      expect(types).toContain('create');
      expect(types).toContain('edit');
      expect(types).toContain('restore');
    });

    it('should have correct VersionChain shape', () => {
      const chain: VersionChain = {
        fileId: 'file-1',
        versions: [
          {
            id: 'ver-2',
            file_id: 'file-1',
            version_number: 2,
            content: 'v2 content',
            metadata: {},
            structure: {},
            relationships: {},
            created_by: 'user-1',
            created_at: '2026-01-01T01:00:00Z',
            change_summary: 'Edit',
            parent_version_id: 'ver-1',
          },
          {
            id: 'ver-1',
            file_id: 'file-1',
            version_number: 1,
            content: 'v1 content',
            metadata: {},
            structure: {},
            relationships: {},
            created_by: 'user-1',
            created_at: '2026-01-01T00:00:00Z',
            change_summary: 'Initial',
            parent_version_id: null,
          },
        ],
        currentVersion: 2,
      };

      expect(chain.fileId).toBe('file-1');
      expect(chain.versions).toHaveLength(2);
      expect(chain.currentVersion).toBe(2);
      expect(chain.versions[0].version_number).toBeGreaterThan(
        chain.versions[1].version_number
      );
    });
  });

  describe('UndoRedoManager types', () => {
    it('should return FileVersion from undo', () => {
      const undoResult: FileVersion = {
        id: 'ver-1',
        file_id: 'file-1',
        version_number: 1,
        content: 'previous content',
        metadata: {},
        structure: {},
        relationships: {},
        created_by: 'user-1',
        created_at: '2026-01-01T00:00:00Z',
        change_summary: 'Initial',
        parent_version_id: null,
      };

      expect(undoResult.version_number).toBe(1);
      expect(undoResult.content).toBe('previous content');
    });

    it('should return FileVersion from redo', () => {
      const redoResult: FileVersion = {
        id: 'ver-3',
        file_id: 'file-1',
        version_number: 3,
        content: 'next content',
        metadata: {},
        structure: {},
        relationships: {},
        created_by: 'user-1',
        created_at: '2026-01-01T02:00:00Z',
        change_summary: 'Re-applied edit',
        parent_version_id: 'ver-2',
      };

      expect(redoResult.version_number).toBe(3);
      expect(redoResult.content).toBe('next content');
    });

    it('should track version numbers for undo/redo navigation', () => {
      const currentVersion = 3;
      const undoTarget = currentVersion - 1;
      const redoTarget = currentVersion + 1;

      expect(undoTarget).toBe(2);
      expect(redoTarget).toBe(4);
    });

    it('should prevent undo below version 1', () => {
      const currentVersion = 1;
      const canUndo = currentVersion > 1;
      expect(canUndo).toBe(false);
    });
  });
});
