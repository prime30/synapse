/**
 * Optional post-retrieval reranker using Cohere's Rerank API.
 * Graceful no-op when COHERE_API_KEY is unset.
 */

interface RerankResult {
  index: number;
  relevanceScore: number;
}

interface RerankInput {
  query: string;
  documents: Array<{ id: string; text: string }>;
  topN?: number;
}

function fallbackScores(documents: Array<{ id: string; text: string }>): Array<{ id: string; score: number }> {
  return documents.map((d, i) => ({ id: d.id, score: 1 - i / Math.max(documents.length, 1) }));
}

export async function rerankResults(input: RerankInput): Promise<Array<{ id: string; score: number }>> {
  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey || input.documents.length === 0) {
    return fallbackScores(input.documents);
  }

  try {
    const response = await fetch('https://api.cohere.com/v2/rerank', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'rerank-v3.5',
        query: input.query,
        documents: input.documents.map(d => d.text),
        top_n: input.topN ?? 10,
      }),
    });

    if (!response.ok) {
      console.warn(`[reranker] Cohere API returned ${response.status}, falling back to original order`);
      return fallbackScores(input.documents);
    }

    const data = await response.json() as { results: RerankResult[] };
    return data.results.map(r => ({
      id: input.documents[r.index].id,
      score: r.relevanceScore,
    }));
  } catch (err) {
    console.warn('[reranker] Cohere rerank failed, falling back:', err);
    return fallbackScores(input.documents);
  }
}
