/**
 * Simple web search for Shopify documentation lookup.
 */

export async function executeWebSearch(
  query: string,
  options?: { site?: string; maxResults?: number },
): Promise<{
  results: Array<{ title: string; url: string; snippet: string }>;
}> {
  const site = options?.site || 'shopify.dev';
  const maxResults = options?.maxResults || 5;
  const searchQuery = site ? `site:${site} ${query}` : query;

  // Use a simple search API (or return a formatted message instructing the agent)
  // For now, return guidance since we don't have a search API key configured
  return {
    results: [
      {
        title: 'Search suggestion',
        url: `https://shopify.dev/search?q=${encodeURIComponent(query)}`,
        snippet: `Search Shopify docs for: "${query}". Visit the URL for results. Common docs: shopify.dev/docs/themes, shopify.dev/docs/api/liquid`,
      },
    ],
  };
}
