/**
 * Hybrid search with Reciprocal Rank Fusion (RRF) -- EPIC A
 *
 * Combines vector similarity search with keyword matching.
 * Falls back to keyword-only when ENABLE_VECTOR_SEARCH !== 'true'.
 */

import { generateEmbedding } from './embeddings';
import { similaritySearch } from './vector-store';

// -- Types --------------------------------------------------------------------

export interface FileSearchResult {
  fileId: string;
  fileName: string;
  score: number;
  source: 'vector' | 'keyword' | 'hybrid';
}

interface RankedItem {
  fileId: string;
  fileName: string;
  rank: number;
}

// -- Config -------------------------------------------------------------------

const RRF_K = 60;
const VECTOR_WEIGHT = 0.6;
const KEYWORD_WEIGHT = 0.4;
const VECTOR_THRESHOLD = 0.2;

// -- Keyword search -----------------------------------------------------------

export function keywordSearch(
  query: string,
  files: Array<{ fileId: string; fileName: string; content: string }>,
  limit: number,
): FileSearchResult[] {
  const queryTokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (queryTokens.length === 0) return [];

  const scored = files
    .map((file) => {
      const contentLower = file.content.toLowerCase();
      const nameLower = file.fileName.toLowerCase();
      let score = 0;
      for (const token of queryTokens) {
        if (contentLower.includes(token)) score += 2;
        if (nameLower.includes(token)) score += 5;
      }
      const normalizedScore = score / (queryTokens.length * 5);
      return { fileId: file.fileId, fileName: file.fileName, score: Math.min(1, normalizedScore), source: 'keyword' as const };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored;
}

// -- RRF Fusion ---------------------------------------------------------------

function rrfFusion(
  vectorRanked: RankedItem[],
  keywordRanked: RankedItem[],
): FileSearchResult[] {
  const fusedScores = new Map<string, { score: number; fileName: string }>();

  for (const item of vectorRanked) {
    const rrfScore = VECTOR_WEIGHT / (RRF_K + item.rank);
    const existing = fusedScores.get(item.fileId);
    if (existing) { existing.score += rrfScore; } else { fusedScores.set(item.fileId, { score: rrfScore, fileName: item.fileName }); }
  }

  for (const item of keywordRanked) {
    const rrfScore = KEYWORD_WEIGHT / (RRF_K + item.rank);
    const existing = fusedScores.get(item.fileId);
    if (existing) { existing.score += rrfScore; } else { fusedScores.set(item.fileId, { score: rrfScore, fileName: item.fileName }); }
  }

  return Array.from(fusedScores.entries())
    .map(([fileId, { score, fileName }]) => ({ fileId, fileName, score, source: 'hybrid' as const }))
    .sort((a, b) => b.score - a.score);
}

// -- Main entry point ---------------------------------------------------------

export async function hybridSearch(
  projectId: string,
  query: string,
  files: Array<{ fileId: string; fileName: string; content: string }>,
  limit = 10,
): Promise<FileSearchResult[]> {
  const useVector = process.env.ENABLE_VECTOR_SEARCH === 'true';

  const keywordResults = keywordSearch(query, files, limit * 2);
  const keywordRanked: RankedItem[] = keywordResults.map((r, i) => ({ fileId: r.fileId, fileName: r.fileName, rank: i + 1 }));

  if (useVector) {
    try {
      const queryEmbedding = await generateEmbedding(query);
      const vectorResults = await similaritySearch(queryEmbedding, limit * 2, projectId);
      const vectorRanked: RankedItem[] = vectorResults
        .filter((r) => r.similarity > VECTOR_THRESHOLD)
        .map((r, i) => ({ fileId: r.fileId, fileName: r.fileName, rank: i + 1 }));

      if (vectorRanked.length > 0) {
        return rrfFusion(vectorRanked, keywordRanked).slice(0, limit);
      }
    } catch {
      // Vector search failed -- fall through to keyword-only
    }
  }

  return keywordResults.slice(0, limit);
}