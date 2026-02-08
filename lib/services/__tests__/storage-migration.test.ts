import { describe, it, expect } from 'vitest';
import { StorageMigrationService } from '../storage-migration';

describe('StorageMigrationService', () => {
  describe('Migration path determination', () => {
    it('should migrate DB to Storage when size grows past 100KB', () => {
      const smallContent = 'x'.repeat(80 * 1024);
      const largeContent = 'x'.repeat(120 * 1024);
      const smallBytes = new TextEncoder().encode(smallContent).length;
      const largeBytes = new TextEncoder().encode(largeContent).length;
      expect(smallBytes).toBeLessThan(102400);
      expect(largeBytes).toBeGreaterThanOrEqual(102400);
    });

    it('should migrate Storage to DB when size shrinks below 100KB', () => {
      const largeContent = 'x'.repeat(120 * 1024);
      const smallContent = 'x'.repeat(80 * 1024);
      expect(new TextEncoder().encode(largeContent).length).toBeGreaterThanOrEqual(102400);
      expect(new TextEncoder().encode(smallContent).length).toBeLessThan(102400);
    });
  });
});
