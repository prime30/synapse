/**
 * Lightweight BM25 scoring for ranking search results.
 * Applied to grep/search results before returning to the agent.
 */

const K1 = 1.2;
const B = 0.75;

interface BM25Document {
  content: string;
  id: string;
}

interface BM25Result {
  id: string;
  score: number;
}

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[\s\-_./\\{}()\[\]<>:;,'"=|!?@#$%^&*+~`]+/).filter(t => t.length > 1);
}

/**
 * Rank a list of documents by BM25 relevance to a query.
 * Returns document IDs sorted by score (highest first).
 */
export function rankByBM25(query: string, documents: BM25Document[]): BM25Result[] {
  if (documents.length === 0) return [];

  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) return documents.map(d => ({ id: d.id, score: 0 }));

  const N = documents.length;
  const docTokens = documents.map(d => tokenize(d.content));
  const avgDl = docTokens.reduce((sum, t) => sum + t.length, 0) / N;

  // Compute IDF for each query term
  const idf = new Map<string, number>();
  for (const term of queryTerms) {
    const df = docTokens.filter(tokens => tokens.includes(term)).length;
    idf.set(term, Math.log((N - df + 0.5) / (df + 0.5) + 1));
  }

  // Score each document
  const results: BM25Result[] = documents.map((doc, idx) => {
    const tokens = docTokens[idx];
    const dl = tokens.length;
    let score = 0;

    for (const term of queryTerms) {
      const tf = tokens.filter(t => t === term).length;
      const termIdf = idf.get(term) ?? 0;
      score += termIdf * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + B * (dl / avgDl))));
    }

    return { id: doc.id, score };
  });

  return results.sort((a, b) => b.score - a.score);
}

/**
 * Re-rank grep search results by BM25 relevance.
 * Takes raw grep output lines and returns them sorted by relevance.
 */
export function rerankGrepResults(
  query: string,
  results: Array<{ file: string; line: number; content: string }>,
): Array<{ file: string; line: number; content: string; score: number }> {
  if (results.length <= 1) return results.map(r => ({ ...r, score: 1 }));

  const docs = results.map((r, i) => ({
    content: `${r.file} ${r.content}`,
    id: String(i),
  }));

  const ranked = rankByBM25(query, docs);
  const scoreMap = new Map(ranked.map(r => [r.id, r.score]));

  return results
    .map((r, i) => ({ ...r, score: scoreMap.get(String(i)) ?? 0 }))
    .sort((a, b) => b.score - a.score);
}
