import { describe, it, expect } from 'vitest';
import { shouldUseStorage } from '@/lib/storage/files';
import { createMockFile } from '../setup/test-helpers';
import type { CreateFileInput, FileFilter } from '@/lib/types/files';

describe('File Operations', () => {
  describe('Storage Strategy', () => {
    it('should store small files in database', () => {
      expect(shouldUseStorage(1024)).toBe(false);      // 1KB
      expect(shouldUseStorage(50 * 1024)).toBe(false);  // 50KB
      expect(shouldUseStorage(99 * 1024)).toBe(false);  // 99KB
    });

    it('should store large files in Supabase Storage', () => {
      expect(shouldUseStorage(100 * 1024)).toBe(true);  // 100KB
      expect(shouldUseStorage(500 * 1024)).toBe(true);  // 500KB
      expect(shouldUseStorage(1024 * 1024)).toBe(true);  // 1MB
    });
  });

  describe('File Types', () => {
    it('should create file input with required fields', () => {
      const input: CreateFileInput = {
        project_id: 'proj-1',
        name: 'header.liquid',
        path: 'sections/header.liquid',
        file_type: 'liquid',
        content: '{% section "header" %}',
        created_by: 'user-1',
      };
      expect(input.file_type).toBe('liquid');
      expect(input.content).toContain('section');
    });

    it('should support all file types', () => {
      const liquidFile = createMockFile({ file_type: 'liquid' });
      const jsFile = createMockFile({ file_type: 'javascript' });
      const cssFile = createMockFile({ file_type: 'css' });
      const otherFile = createMockFile({ file_type: 'other' });

      expect(liquidFile.file_type).toBe('liquid');
      expect(jsFile.file_type).toBe('javascript');
      expect(cssFile.file_type).toBe('css');
      expect(otherFile.file_type).toBe('other');
    });
  });

  describe('File Filtering', () => {
    it('should define filter interface', () => {
      const filter: FileFilter = {
        file_type: 'liquid',
        search: 'header',
      };
      expect(filter.file_type).toBe('liquid');
      expect(filter.search).toBe('header');
    });

    it('should allow partial filters', () => {
      const typeOnly: FileFilter = { file_type: 'css' };
      const searchOnly: FileFilter = { search: 'main' };
      const empty: FileFilter = {};

      expect(typeOnly.file_type).toBe('css');
      expect(searchOnly.search).toBe('main');
      expect(empty.file_type).toBeUndefined();
    });
  });

  describe('Mock File Helpers', () => {
    it('should create mock file with defaults', () => {
      const file = createMockFile();
      expect(file.id).toBe('test-file-id');
      expect(file.file_type).toBe('liquid');
      expect(file.storage_path).toBeNull();
    });

    it('should create mock file with overrides', () => {
      const file = createMockFile({
        name: 'custom.js',
        file_type: 'javascript',
        size_bytes: 150 * 1024,
        storage_path: 'proj/custom.js',
        content: null,
      });
      expect(file.name).toBe('custom.js');
      expect(file.file_type).toBe('javascript');
      expect(file.storage_path).toBe('proj/custom.js');
    });
  });
});
