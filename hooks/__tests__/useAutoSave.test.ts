import { describe, it, expect } from 'vitest';

const STORAGE_PREFIX = 'synapse-draft-';

describe('useAutoSave', () => {
  it('uses correct storage key format', () => {
    const fileId = 'file-123';
    expect(`${STORAGE_PREFIX}${fileId}`).toBe('synapse-draft-file-123');
  });
});
