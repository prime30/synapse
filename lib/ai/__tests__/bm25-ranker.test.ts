import { describe, it, expect } from 'vitest';
import { rankByBM25, rerankGrepResults } from '../bm25-ranker';

describe('rankByBM25', () => {
  it('ranks documents with matching terms higher', () => {
    const results = rankByBM25('pointer events none', [
      { id: 'a', content: '.header { display: flex; }' },
      { id: 'b', content: '.cart-item { pointer-events: none; opacity: 0.5; }' },
      { id: 'c', content: '.footer { margin-top: 20px; }' },
    ]);
    expect(results[0].id).toBe('b');
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it('IDF boosts rare terms', () => {
    const results = rankByBM25('unique-class', [
      { id: 'a', content: 'common word common word common' },
      { id: 'b', content: 'common unique-class rare' },
      { id: 'c', content: 'common word again' },
    ]);
    expect(results[0].id).toBe('b');
  });

  it('returns empty for empty input', () => {
    expect(rankByBM25('test', [])).toEqual([]);
  });

  it('handles empty query', () => {
    const results = rankByBM25('', [{ id: 'a', content: 'test' }]);
    expect(results[0].score).toBe(0);
  });
});

describe('rerankGrepResults', () => {
  it('reorders results by relevance', () => {
    const results = rerankGrepResults('mini cart quantity', [
      { file: 'assets/header.css', line: 10, content: '.header { position: sticky }' },
      { file: 'assets/mini-cart.css', line: 55, content: '.t4s-mini-cart__quantity .t4s-quantity-control' },
      { file: 'assets/footer.css', line: 5, content: '.footer { padding: 20px }' },
    ]);
    expect(results[0].file).toBe('assets/mini-cart.css');
    expect(results[0].score).toBeGreaterThan(0);
  });

  it('returns single result unchanged', () => {
    const input = [{ file: 'a.css', line: 1, content: 'test' }];
    const results = rerankGrepResults('test', input);
    expect(results.length).toBe(1);
    expect(results[0].score).toBe(1);
  });
});
