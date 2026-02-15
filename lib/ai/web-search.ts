/**
 * Web search utility powered by DuckDuckGo HTML API.
 * No API key required. Results are cached in-memory with 1-hour TTL.
 */

const DDG_URL = 'https://html.duckduckgo.com/html/';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_RESULTS = 5;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_OUTPUT_CHARS = 8_000; // ~2K tokens

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchResult {
  results: SearchResult[];
  query: string;
  cached: boolean;
  truncated: boolean;
}

// In-memory cache
const searchCache = new Map<string, { results: SearchResult[]; timestamp: number }>();

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

function getCached(query: string): SearchResult[] | null {
  const key = normalizeQuery(query);
  const entry = searchCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    searchCache.delete(key);
    return null;
  }
  return entry.results;
}

function setCache(query: string, results: SearchResult[]): void {
  const key = normalizeQuery(query);
  searchCache.set(key, { results, timestamp: Date.now() });
  // Evict old entries if cache grows too large
  if (searchCache.size > 200) {
    const oldest = [...searchCache.entries()]
      .sort((a, b) => a[1].timestamp - b[1].timestamp)
      .slice(0, 50);
    for (const [k] of oldest) searchCache.delete(k);
  }
}

/**
 * Parse DuckDuckGo HTML response into structured results.
 * DuckDuckGo returns results in <div class="result"> elements.
 */
function parseResults(html: string): SearchResult[] {
  const results: SearchResult[] = [];

  // Match result blocks: <a class="result__a" href="...">title</a> and <a class="result__snippet">snippet</a>
  const resultBlockRegex =
    /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

  let match;
  while ((match = resultBlockRegex.exec(html)) !== null && results.length < MAX_RESULTS) {
    const rawUrl = match[1];
    const title = match[2].replace(/<[^>]*>/g, '').trim();
    const snippet = match[3].replace(/<[^>]*>/g, '').trim();

    // DuckDuckGo wraps URLs in a redirect — extract the actual URL
    let url = rawUrl;
    const uddgMatch = rawUrl.match(/uddg=([^&]+)/);
    if (uddgMatch) {
      url = decodeURIComponent(uddgMatch[1]);
    }

    if (title && url) {
      results.push({ title, url, snippet });
    }
  }

  return results;
}

export async function webSearch(
  query: string,
  maxResults: number = MAX_RESULTS,
): Promise<WebSearchResult> {
  if (!query.trim()) {
    return { results: [], query, cached: false, truncated: false };
  }

  // Check cache first
  const cached = getCached(query);
  if (cached) {
    return {
      results: cached.slice(0, maxResults),
      query,
      cached: true,
      truncated: false,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const params = new URLSearchParams({ q: query });
    const response = await fetch(DDG_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (compatible; SynapseIDE/1.0)',
      },
      body: params.toString(),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`DuckDuckGo returned ${response.status}`);
    }

    const html = await response.text();
    const results = parseResults(html).slice(0, maxResults);

    // Cache results
    setCache(query, results);

    // Check output size
    const formatted = JSON.stringify(results);
    const truncated = formatted.length > MAX_OUTPUT_CHARS;

    return { results, query, cached: false, truncated };
  } finally {
    clearTimeout(timeout);
  }
}
