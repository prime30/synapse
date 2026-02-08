import { describe, it, expect } from 'vitest';
import { HybridStorageService } from '../hybrid-storage';

describe('HybridStorageService', () => {
  const service = new HybridStorageService();

  describe('shouldUseStorage', () => {
    it('should return false for files under 100KB', () => {
      expect(service.shouldUseStorage(1024)).toBe(false);
      expect(service.shouldUseStorage(50 * 1024)).toBe(false);
      expect(service.shouldUseStorage(102399)).toBe(false);
    });

    it('should return true for files 100KB and over', () => {
      expect(service.shouldUseStorage(102400)).toBe(true);
      expect(service.shouldUseStorage(150 * 1024)).toBe(true);
      expect(service.shouldUseStorage(1024 * 1024)).toBe(true);
    });
  });

  describe('Storage decision logic', () => {
    it('should store small file in database (50KB)', () => {
      const content50k = 'x'.repeat(50 * 1024);
      const sizeBytes = new TextEncoder().encode(content50k).length;
      expect(service.shouldUseStorage(sizeBytes)).toBe(false);
    });

    it('should store large file in Storage (150KB)', () => {
      const content150k = 'x'.repeat(150 * 1024);
      const sizeBytes = new TextEncoder().encode(content150k).length;
      expect(service.shouldUseStorage(sizeBytes)).toBe(true);
    });
  });
});
