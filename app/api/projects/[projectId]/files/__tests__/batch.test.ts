import { describe, it, expect } from 'vitest';
import { detectFileTypeFromName } from '@/lib/types/files';

describe('Batch Upload API', () => {
  describe('File validation', () => {
    it('accepts valid extensions', () => {
      expect(detectFileTypeFromName('a.liquid')).toBe('liquid');
      expect(detectFileTypeFromName('b.js')).toBe('javascript');
      expect(detectFileTypeFromName('c.css')).toBe('css');
      expect(detectFileTypeFromName('d.scss')).toBe('css');
    });

    it('validates batch file structure', () => {
      const valid = { name: 'product.liquid', content: '{% comment %}test{% endcomment %}' };
      expect(valid.name).toContain('.');
      expect(valid.content.length).toBeGreaterThan(0);
    });
  });
});
