import { describe, it, expect } from 'vitest';

function generateCopyName(
  original: string,
  existingNames: Set<string>
): string {
  const ext = original.includes('.') ? original.split('.').pop() : '';
  const base = ext ? original.slice(0, -(ext.length + 1)) : original;
  let candidate = `${base}-copy${ext ? '.' + ext : ''}`;
  let n = 1;
  while (existingNames.has(candidate)) {
    n++;
    candidate = `${base}-copy-${n}${ext ? '.' + ext : ''}`;
  }
  return candidate;
}

describe('Duplicate API', () => {
  it('generates copy name when no duplicates', () => {
    const name = generateCopyName('theme.js', new Set());
    expect(name).toBe('theme-copy.js');
  });

  it('generates copy-2 when copy exists', () => {
    const name = generateCopyName('theme.js', new Set(['theme.js', 'theme-copy.js']));
    expect(name).toBe('theme-copy-2.js');
  });
});
