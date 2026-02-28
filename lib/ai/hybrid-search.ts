/**
 * Hybrid search with Reciprocal Rank Fusion (RRF).
 *
 * Three-way fusion: vector similarity + BM25 keyword + structural boost.
 * Falls back to BM25-only when DISABLE_VECTOR_SEARCH === 'true' or
 * OPENAI_API_KEY is not set.
 */

import { generateEmbedding } from './embeddings';
import { similaritySearch } from './vector-store';
import { rankByBM25 } from './bm25-ranker';

// -- Types --------------------------------------------------------------------

export interface FileSearchResult {
  fileId: string;
  fileName: string;
  score: number;
  source: 'vector' | 'bm25' | 'hybrid';
}

interface RankedItem {
  fileId: string;
  fileName: string;
  rank: number;
}

// -- Config -------------------------------------------------------------------

const RRF_K = 60;
const VECTOR_WEIGHT = 0.5;
const BM25_WEIGHT = 0.3;
const STRUCTURAL_WEIGHT = 0.2;
const VECTOR_THRESHOLD = 0.2;

// -- BM25 search (replaces simple keyword matching) ---------------------------

export function bm25Search(
  query: string,
  files: Array<{ fileId: string; fileName: string; content: string }>,
  limit: number,
): FileSearchResult[] {
  if (files.length === 0) return [];

  const docs = files.map((f) => ({
    content: `${f.fileName} ${f.content}`,
    id: f.fileId,
  }));

  const ranked = rankByBM25(query, docs);
  const fileMap = new Map(files.map((f) => [f.fileId, f]));

  return ranked
    .filter((r) => r.score > 0)
    .slice(0, limit)
    .map((r) => ({
      fileId: r.id,
      fileName: fileMap.get(r.id)?.fileName ?? '',
      score: r.score,
      source: 'bm25' as const,
    }));
}

// -- Legacy keyword search (kept for backward compatibility) ------------------

export function keywordSearch(
  query: string,
  files: Array<{ fileId: string; fileName: string; content: string }>,
  limit: number,
): FileSearchResult[] {
  return bm25Search(query, files, limit);
}

// -- RRF Fusion ---------------------------------------------------------------

function rrfFusion(
  vectorRanked: RankedItem[],
  bm25Ranked: RankedItem[],
  structuralBoostIds?: Set<string>,
): FileSearchResult[] {
  const fusedScores = new Map<string, { score: number; fileName: string }>();

  for (const item of vectorRanked) {
    const rrfScore = VECTOR_WEIGHT / (RRF_K + item.rank);
    const existing = fusedScores.get(item.fileId);
    if (existing) { existing.score += rrfScore; } else { fusedScores.set(item.fileId, { score: rrfScore, fileName: item.fileName }); }
  }

  for (const item of bm25Ranked) {
    const rrfScore = BM25_WEIGHT / (RRF_K + item.rank);
    const existing = fusedScores.get(item.fileId);
    if (existing) { existing.score += rrfScore; } else { fusedScores.set(item.fileId, { score: rrfScore, fileName: item.fileName }); }
  }

  if (structuralBoostIds && structuralBoostIds.size > 0) {
    for (const [fileId, entry] of fusedScores) {
      if (structuralBoostIds.has(fileId)) {
        entry.score += STRUCTURAL_WEIGHT;
      }
    }
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
  options?: {
    activeFileId?: string;
    activeFilePath?: string;
    chunkTypeFilter?: string;
  },
): Promise<FileSearchResult[]> {
  const useVector =
    process.env.DISABLE_VECTOR_SEARCH !== 'true' && !!process.env.OPENAI_API_KEY;

  const bm25Results = bm25Search(query, files, limit * 2);
  const bm25Ranked: RankedItem[] = bm25Results.map((r, i) => ({ fileId: r.fileId, fileName: r.fileName, rank: i + 1 }));

  const structuralBoostIds = new Set<string>();
  if (options?.activeFileId) structuralBoostIds.add(options.activeFileId);
  if (options?.activeFilePath) {
    const activeFile = files.find((f) => f.fileName === options.activeFilePath);
    if (activeFile) structuralBoostIds.add(activeFile.fileId);
  }

  if (useVector) {
    try {
      const queryEmbedding = await generateEmbedding(query);
      const vectorResults = await similaritySearch(queryEmbedding, limit * 2, projectId);
      const vectorRanked: RankedItem[] = vectorResults
        .filter((r) => r.similarity > VECTOR_THRESHOLD)
        .map((r, i) => ({ fileId: r.fileId, fileName: r.fileName, rank: i + 1 }));

      if (vectorRanked.length > 0) {
        return rrfFusion(vectorRanked, bm25Ranked, structuralBoostIds).slice(0, limit);
      }
    } catch {
      // Vector search failed -- fall through to BM25-only
    }
  }

  return bm25Results.slice(0, limit);
}