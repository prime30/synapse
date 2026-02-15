import { encodingForModel } from 'js-tiktoken';

// Cache the encoding instance -- expensive to create
let _encoding: ReturnType<typeof encodingForModel> | null = null;
let _initFailed = false;

function getEncoding() {
  if (_encoding) return _encoding;
  if (_initFailed) return null;
  try {
    _encoding = encodingForModel('gpt-4o');
    return _encoding;
  } catch (err) {
    console.warn('[token-counter] Failed to initialize tiktoken, falling back to estimate:', err);
    _initFailed = false; // allow retry on next call
    return null;
  }
}

// Simple LRU cache for repeated tokenizations (keyed by content hash)
const TOKEN_CACHE = new Map<string, number>();
const CACHE_MAX = 500;

function cacheKey(text: string): string {
  // Use length + first/last 100 chars as a fast hash
  if (text.length < 250) return text;
  return `${text.length}:${text.slice(0, 100)}:${text.slice(-100)}`;
}

/**
 * Count tokens in text using tiktoken (cl100k_base encoding).
 * Falls back to chars/4 estimate if tiktoken is unavailable.
 * Results are cached for repeated calls with the same text.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  const key = cacheKey(text);
  const cached = TOKEN_CACHE.get(key);
  if (cached !== undefined) return cached;

  let count: number;
  const enc = getEncoding();
  if (enc) {
    try {
      count = enc.encode(text).length;
    } catch {
      // Fallback on encode failure
      count = Math.ceil(text.length / 4);
    }
  } else {
    count = Math.ceil(text.length / 4);
  }

  // Evict oldest entries if cache is full
  if (TOKEN_CACHE.size >= CACHE_MAX) {
    const firstKey = TOKEN_CACHE.keys().next().value;
    if (firstKey !== undefined) TOKEN_CACHE.delete(firstKey);
  }
  TOKEN_CACHE.set(key, count);

  return count;
}

/**
 * Estimate tokens for very large texts without blocking the event loop.
 * Chunks the text and yields between chunks.
 */
export async function estimateTokensAsync(text: string, chunkSize = 50_000): Promise<number> {
  if (!text) return 0;
  if (text.length <= chunkSize) return estimateTokens(text);

  let total = 0;
  for (let i = 0; i < text.length; i += chunkSize) {
    total += estimateTokens(text.slice(i, i + chunkSize));
    // Yield to event loop between chunks
    if (i + chunkSize < text.length) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  return total;
}
