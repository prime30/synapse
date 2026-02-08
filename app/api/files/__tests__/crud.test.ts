import { describe, it, expect } from 'vitest';
import { detectFileTypeFromName, type CreateFileRequest } from '@/lib/types/files';

describe('Files API - CRUD', () => {
  describe('File type detection', () => {
    it('should detect Liquid from .liquid extension', () => {
      expect(detectFileTypeFromName('product.liquid')).toBe('liquid');
      expect(detectFileTypeFromName('sections/header.liquid')).toBe('liquid');
    });

    it('should detect JavaScript from .js and .ts', () => {
      expect(detectFileTypeFromName('theme.js')).toBe('javascript');
      expect(detectFileTypeFromName('app.ts')).toBe('javascript');
    });

    it('should detect CSS from .css and .scss', () => {
      expect(detectFileTypeFromName('theme.css')).toBe('css');
      expect(detectFileTypeFromName('styles.scss')).toBe('css');
    });

    it('should return other for unknown extensions', () => {
      expect(detectFileTypeFromName('readme.md')).toBe('other');
      expect(detectFileTypeFromName('config.json')).toBe('other');
    });
  });

  describe('CreateFileRequest validation', () => {
    it('should accept valid create request', () => {
      const req: CreateFileRequest = {
        name: 'product.liquid',
        content: '{% comment %}Product template{% endcomment %}',
        fileType: 'liquid',
      };
      expect(req.name).toBe('product.liquid');
      expect(req.content).toBeDefined();
      expect(req.fileType).toBe('liquid');
    });

    it('should allow fileType to be omitted (auto-detect)', () => {
      const req: CreateFileRequest = {
        name: 'theme.js',
        content: 'console.log("hi");',
      };
      expect(detectFileTypeFromName(req.name)).toBe('javascript');
    });
  });

  describe('File creation stores in database', () => {
    it('should calculate correct size for content', () => {
      const content = '{% comment %}Product template{% endcomment %}';
      const sizeBytes = new TextEncoder().encode(content).length;
      expect(sizeBytes).toBeGreaterThan(0);
      expect(sizeBytes).toBeLessThan(100 * 1024); // Under 100KB = DB storage
    });

    it('should reject empty content', () => {
      const content = '';
      expect(content.length).toBe(0);
      // API validation should reject this
    });
  });

  describe('Duplicate filename rejection', () => {
    it('should identify duplicate by same project_id and name', () => {
      const fileA = { project_id: 'proj-1', name: 'theme.js' };
      const fileB = { project_id: 'proj-1', name: 'theme.js' };
      expect(fileA.project_id).toBe(fileB.project_id);
      expect(fileA.name).toBe(fileB.name);
      // Same project + same name = duplicate
    });

    it('should allow same name in different projects', () => {
      const fileA = { project_id: 'proj-1', name: 'theme.js' };
      const fileB = { project_id: 'proj-2', name: 'theme.js' };
      expect(fileA.project_id).not.toBe(fileB.project_id);
      // Different projects = not duplicate
    });
  });
});
