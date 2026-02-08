import { describe, it, expect } from 'vitest';
import { ProjectContextLoader } from '../loader';
import type { ProjectContext, FileContext } from '../types';

describe('ProjectContextLoader', () => {
  const loader = new ProjectContextLoader();

  describe('validateFileLimit', () => {
    it('accepts 100 files', () => {
      expect(() => loader.validateFileLimit(100)).not.toThrow();
    });

    it('accepts 1 file', () => {
      expect(() => loader.validateFileLimit(1)).not.toThrow();
    });

    it('rejects 101 files', () => {
      expect(() => loader.validateFileLimit(101)).toThrow('too many files');
    });
  });

  describe('ProjectContext structure', () => {
    it('should define correct ProjectContext interface', () => {
      const ctx: ProjectContext = {
        projectId: 'proj-1',
        files: [],
        dependencies: [],
        loadedAt: new Date(),
        totalSizeBytes: 0,
      };
      expect(ctx.projectId).toBe('proj-1');
      expect(ctx.files).toEqual([]);
      expect(ctx.dependencies).toEqual([]);
    });

    it('should define correct FileContext interface', () => {
      const file: FileContext = {
        fileId: 'file-1',
        fileName: 'product.liquid',
        fileType: 'liquid',
        content: '<h1>{{ product.title }}</h1>',
        sizeBytes: 28,
        lastModified: new Date(),
        dependencies: { imports: [], exports: [], usedBy: [] },
      };
      expect(file.fileType).toBe('liquid');
      expect(file.content).toContain('product.title');
    });
  });
});
