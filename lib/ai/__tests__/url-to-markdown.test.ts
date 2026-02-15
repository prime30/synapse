import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { urlToMarkdown } from '../url-to-markdown';

describe('urlToMarkdown', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it('rejects invalid URLs', async () => {
    await expect(urlToMarkdown('not-a-url')).rejects.toThrow('Invalid or private URL');
    await expect(urlToMarkdown('ftp://example.com')).rejects.toThrow('Invalid or private URL');
    await expect(urlToMarkdown('http://localhost:3000')).rejects.toThrow('Invalid or private URL');
    await expect(urlToMarkdown('http://127.0.0.1/secret')).rejects.toThrow('Invalid or private URL');
    await expect(urlToMarkdown('http://192.168.1.1')).rejects.toThrow('Invalid or private URL');
  });

  it('calls markdown.new with the URL and returns result', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '# Hello World\n\nSome content here.',
      headers: new Map([['x-markdown-tokens', '15']]),
    }) as unknown as typeof fetch;

    const result = await urlToMarkdown('https://example.com/page');

    expect(result.markdown).toBe('# Hello World\n\nSome content here.');
    expect(result.estimatedTokens).toBe(15);
    expect(result.truncated).toBe(false);
    expect(result.sourceUrl).toBe('https://example.com/page');
    expect(result.method).toBe('auto');

    // Verify it called the right URL
    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toContain('markdown.new');
    expect(fetchCall[0]).toContain(encodeURIComponent('https://example.com/page'));
  });

  it('passes method parameter when specified', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '# Content',
      headers: new Map([['x-markdown-tokens', '5']]),
    }) as unknown as typeof fetch;

    await urlToMarkdown('https://example.com', { method: 'browser' });

    const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[0]).toContain('method=browser');
  });

  it('truncates content exceeding max length', async () => {
    const longContent = 'x'.repeat(70_000);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => longContent,
      headers: new Map(),
    }) as unknown as typeof fetch;

    const result = await urlToMarkdown('https://example.com');

    expect(result.truncated).toBe(true);
    expect(result.markdown.length).toBeLessThan(70_000);
    expect(result.markdown).toContain('[...content truncated]');
    expect(result.estimatedTokens).toBe(-1); // header missing
  });

  it('throws on non-OK response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'Not Found',
    }) as unknown as typeof fetch;

    await expect(urlToMarkdown('https://example.com/missing')).rejects.toThrow('markdown.new returned 404');
  });
});
