/**
 * URL-to-Markdown converter powered by markdown.new (Cloudflare).
 *
 * Converts any public URL into clean Markdown, reducing token usage by ~80%
 * compared to raw HTML. Used by AI agents when they need to fetch and
 * understand external web content (docs, references, Shopify help pages, etc.).
 *
 * Three-tier pipeline (handled server-side by markdown.new):
 *   1. Cloudflare native `Accept: text/markdown` content negotiation
 *   2. Workers AI HTML-to-Markdown fallback
 *   3. Headless browser rendering for JS-heavy pages
 *
 * @see https://markdown.new/
 */

const MARKDOWN_NEW_BASE = 'https://markdown.new';

/** Maximum content length we'll return to the agent (~60K chars ≈ ~15K tokens). */
const MAX_CONTENT_LENGTH = 60_000;

/** Request timeout in milliseconds. */
const FETCH_TIMEOUT_MS = 30_000;

export type ConversionMethod = 'auto' | 'ai' | 'browser';

export interface UrlToMarkdownOptions {
  /** Conversion method. 'auto' tries the fastest first. Default: 'auto'. */
  method?: ConversionMethod;
  /** Whether to retain images in the output. Default: false (saves tokens). */
  retainImages?: boolean;
}

export interface UrlToMarkdownResult {
  /** The clean Markdown content. */
  markdown: string;
  /** Estimated token count from the x-markdown-tokens header (-1 if unavailable). */
  estimatedTokens: number;
  /** Whether the content was truncated to fit MAX_CONTENT_LENGTH. */
  truncated: boolean;
  /** The conversion method used (from response, if available). */
  method: ConversionMethod;
  /** The source URL that was fetched. */
  sourceUrl: string;
}

/**
 * Validate that a string looks like a fetchable HTTP(S) URL.
 * Blocks private IPs, localhost, and non-HTTP schemes.
 */
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    // Block localhost / private ranges
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host.startsWith('192.168.') ||
      host.startsWith('10.') ||
      host.startsWith('172.')
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert a URL to clean Markdown via the markdown.new API.
 *
 * @param url — The public URL to convert.
 * @param options — Optional conversion settings.
 * @returns The Markdown content with metadata.
 * @throws Error if the URL is invalid or the fetch fails.
 */
export async function urlToMarkdown(
  url: string,
  options: UrlToMarkdownOptions = {},
): Promise<UrlToMarkdownResult> {
  if (!isValidUrl(url)) {
    throw new Error(`Invalid or private URL: ${url}`);
  }

  const { method = 'auto', retainImages = false } = options;

  // Build the request URL
  const params = new URLSearchParams();
  if (method !== 'auto') params.set('method', method);
  if (retainImages) params.set('retain_images', 'true');

  const encodedUrl = encodeURIComponent(url);
  const queryString = params.toString();
  const requestUrl = `${MARKDOWN_NEW_BASE}/${encodedUrl}${queryString ? `?${queryString}` : ''}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(requestUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/markdown, text/plain;q=0.9',
        'User-Agent': 'Synapse-IDE/1.0 (url-to-markdown)',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `markdown.new returned ${response.status}: ${body.slice(0, 200)}`,
      );
    }

    let markdown = await response.text();
    const estimatedTokens = parseInt(
      response.headers.get('x-markdown-tokens') ?? '-1',
      10,
    );

    let truncated = false;
    if (markdown.length > MAX_CONTENT_LENGTH) {
      markdown = markdown.slice(0, MAX_CONTENT_LENGTH) + '\n\n[...content truncated]';
      truncated = true;
    }

    return {
      markdown,
      estimatedTokens: isNaN(estimatedTokens) ? -1 : estimatedTokens,
      truncated,
      method,
      sourceUrl: url,
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`URL fetch timed out after ${FETCH_TIMEOUT_MS / 1000}s: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
