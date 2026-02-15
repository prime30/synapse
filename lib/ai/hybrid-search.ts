/**
 * Hybrid search with Reciprocal Rank Fusion (RRF) -- EPIC A
 *
 * Combines vector similarity search (pgvector) with keyword matching
 * (fuzzy/substring) and fuses results using RRF.
 *
 * Falls back to keyword-only when:
 * - ENABLE_VECTOR_SEARCH !== 'true'
 * - Embedding API key not set
 * - pgvector not available
 */

import { generateEmbedding, semanticFileSearch } from './embeddings';
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
  source: 'vector' | 'keyword';
}

// -- Config -------------------------------------------------------------------

/** RRF constant -- higher values give more weight to lower-ranked results */
const RRF_K = 60;

/** Weight for vector similarity scores in the fusion */
const VECTOR_WEIGHT = 0.6;

/** Weight for keyword match scores in the fusion */
const KEYWORD_WEIGHT = 0.4;

/** Minimum similarity threshold for vector results */
const VECTOR_THRESHOLD = 0.2;

// -- Keyword search -----------------------------------------------------------

/**
 * Simple keyword matching: score files by substring/token overlap.
 * Returns results sorted by score descending.
 */
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
        // Exact content match (stronger signal)
        if (contentLower.includes(token)) score += 2;
        // File name match (strongest signal)
        if (nameLower.includes(token)) score += 5;
      }

      // Normalize by token count
      const normalizedScore = score / (queryTokens.length * 5);

      return {
        fileId: file.fileId,
        fileName: file.fileName,
        score: Math.min(1, normalizedScore),
        source: 'keyword' as const,
      };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored;
}

// -- RRF Fusion ---------------------------------------------------------------

/**
 * Reciprocal Rank Fusion: combine two ranked lists into one.
 * RRF score = sum(1 / (k + rank_i)) for each list where the item appears.
 */
function rrfFusion(
  vectorRanked: RankedItem[],
  keywordRanked: RankedItem[],
): FileSearchResult[] {
  const fusedScores = new Map<string, { score: number; fileName: string }>();

  // Add vector scores
  for (const item of vectorRanked) {
    const rrfScore = VECTOR_WEIGHT / (RRF_K + item.rank);
    const existing = fusedScores.get(item.fileId);
    if (existing) {
      existing.score += rrfScore;
    } else {
      fusedScores.set(item.fileId, { score: rrfScore, fileName: item.fileName });
    }
  }

  // Add keyword scores
  for (const item of keywordRanked) {
    const rrfScore = KEYWORD_WEIGHT / (RRF_K + item.rank);
    const existing = fusedScores.get(item.fileId);
    if (existing) {
      existing.score += rrfScore;
    } else {
      fusedScores.set(item.fileId, { score: rrfScore, fileName: item.fileName });
    }
  }

  // Sort by fused score descending
  return Array.from(fusedScores.entries())
    .map(([fileId, { score, fileName }]) => ({
      fileId,
      fileName,
      score,
      source: 'hybrid' as const,
    }))
    .sort((a, b) => b.score - a.score);
}

// -- Main entry point ---------------------------------------------------------

/**
 * Hybrid search: combine vector similarity + keyword matching via RRF.
 *
 * @param projectId - Project to search in
 * @param query     - User's search query
 * @param files     - Available files for keyword search
 * @param limit     - Max results to return
 */
export async function hybridSearch(
  projectId: string,
  query: string,
  files: Array<{ fileId: string; fileName: string; content: string }>,
  limit = 10,
): Promise<FileSearchResult[]> {
  const useVector = process.env.ENABLE_VECTOR_SEARCH === 'true';

  // Always run keyword search
  const keywordResults = keywordSearch(query, files, limit * 2);
  const keywordRanked: RankedItem[] = keywordResults.map((r, i) => ({
    fileId: r.fileId,
    fileName: r.fileName,
    rank: i + 1,
    source: 'keyword',
  }));

  // Attempt vector search if enabled
  if (useVector) {
    try {
      const queryEmbedding = await generateEmbedding(query);
      const vectorResults = await similaritySearch(queryEmbedding, limit * 2, projectId);

      const vectorRanked: RankedItem[] = vectorResults
        .filter((r) => r.similarity > VECTOR_THRESHOLD)
        .map((r, i) => ({
          fileId: r.fileId,
          fileName: r.fileName,
          rank: i + 1,
          source: 'vector',
        }));

      if (vectorRanked.length > 0) {
        // Fuse results
        const fused = rrfFusion(vectorRanked, keywordRanked);
        return fused.slice(0, limit);
      }
    } catch {
      // Vector search failed -- fall through to keyword-only
    }
  }

  // Keyword-only fallback
  return keywordResults.slice(0, limit);
}
