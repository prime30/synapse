import { describe, it, expect } from 'vitest';
import { shouldUseStorage } from '@/lib/storage/files';

// Re-export for tests that need storage threshold
const SIZE_THRESHOLD = 100 * 1024; // 100KB

describe('File Storage Service', () => {
  describe('Storage decision (shouldUseStorage)', () => {
    it('should store small files in database', () => {
      expect(shouldUseStorage(1024)).toBe(false); // 1KB
      expect(shouldUseStorage(50 * 1024)).toBe(false); // 50KB
      expect(shouldUseStorage(99 * 1024)).toBe(false); // 99KB
    });

    it('should store large files in Supabase Storage', () => {
      expect(shouldUseStorage(100 * 1024)).toBe(true); // 100KB
      expect(shouldUseStorage(500 * 1024)).toBe(true); // 500KB
      expect(shouldUseStorage(1024 * 1024)).toBe(true); // 1MB
    });

    it('should use 100KB as exact threshold', () => {
      expect(shouldUseStorage(SIZE_THRESHOLD - 1)).toBe(false);
      expect(shouldUseStorage(SIZE_THRESHOLD)).toBe(true);
    });
  });

  describe('File size calculation', () => {
    it('should calculate bytes correctly for ASCII', () => {
      const content = 'Hello World';
      const bytes = new TextEncoder().encode(content).length;
      expect(bytes).toBe(11);
    });

    it('should calculate bytes correctly for Liquid template', () => {
      const content = '{% comment %}Product{% endcomment %}\n{{ product.title }}';
      const bytes = new TextEncoder().encode(content).length;
      expect(bytes).toBeGreaterThan(0);
      expect(bytes).toBeLessThan(1000);
    });
  });
});
