/**
 * Supabase pgvector store -- EPIC A
 *
 * Wraps the file_embeddings table with typed methods for
 * upsert, similarity search, deletion, and stale-file detection.
 */

import { createServiceClient } from '@/lib/supabase/admin';

// -- Types --------------------------------------------------------------------

export interface FileEmbeddingRow {
  id: string;
  project_id: string;
  file_id: string;
  chunk_index: number;
  chunk_text: string;
  file_name: string;
  content_hash: string;
  model_version: string;
  created_at: string;
  updated_at: string;
}

export interface SimilarityResult {
  fileId: string;
  fileName: string;
  chunkText: string;
  chunkIndex: number;
  similarity: number;
}

export interface EmbeddingChunk {
  chunkIndex: number;
  chunkText: string; // first 200 chars for display
  embedding: number[];
}

// -- Constants ----------------------------------------------------------------

const EMBEDDING_DIMENSIONS = 1536;
const DEFAULT_MODEL = 'text-embedding-3-small';

// -- Store --------------------------------------------------------------------

/**
 * Upsert embeddings for a file (one row per chunk).
 * Deletes existing chunks for the file first, then inserts new ones.
 */
export async function upsertEmbedding(
  projectId: string,
  fileId: string,
  fileName: string,
  contentHash: string,
  chunks: EmbeddingChunk[],
  modelVersion: string = DEFAULT_MODEL,
): Promise<void> {
  const supabase = createServiceClient();

  // Delete existing chunks for this file
  await supabase
    .from('file_embeddings')
    .delete()
    .eq('project_id', projectId)
    .eq('file_id', fileId);

  // Insert new chunks
  const rows = chunks.map((chunk) => ({
    project_id: projectId,
    file_id: fileId,
    file_name: fileName,
    chunk_index: chunk.chunkIndex,
    chunk_text: chunk.chunkText.slice(0, 200),
    content_hash: contentHash,
    embedding: `[${chunk.embedding.join(',')}]`,
    model_version: modelVersion,
  }));

  if (rows.length > 0) {
    const { error } = await supabase.from('file_embeddings').insert(rows);
    if (error) {
      console.warn('[vector-store] Failed to insert embeddings:', error.message);
    }
  }
}

/**
 * Search for similar file chunks using cosine similarity.
 * Requires pgvector extension with match_file_embeddings RPC.
 */
export async function similaritySearch(
  queryVector: number[],
  topK: number,
  projectId: string,
): Promise<SimilarityResult[]> {
  if (queryVector.length !== EMBEDDING_DIMENSIONS) {
    console.warn(`[vector-store] Query vector dimension mismatch: ${queryVector.length} !== ${EMBEDDING_DIMENSIONS}`);
    return [];
  }

  const supabase = createServiceClient();

  const { data, error } = await supabase.rpc('match_file_embeddings', {
    p_project_id: projectId,
    query_embedding: `[${queryVector.join(',')}]`,
    match_count: topK,
  });

  if (error) {
    console.warn('[vector-store] Similarity search failed:', error.message);
    return [];
  }

  return (data ?? []).map((r: Record<string, unknown>) => ({
    fileId: r.file_id as string,
    fileName: r.file_name as string,
    chunkText: (r.chunk_text as string) ?? '',
    chunkIndex: (r.chunk_index as number) ?? 0,
    similarity: r.similarity as number,
  }));
}

/**
 * Delete all embeddings for a file.
 */
export async function deleteByFile(projectId: string, fileId: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from('file_embeddings')
    .delete()
    .eq('project_id', projectId)
    .eq('file_id', fileId);
}

/**
 * Get file IDs whose embeddings are stale (content changed since last embedding).
 * Used by the warm-embeddings cron task.
 */
export async function getStaleFiles(
  projectId: string,
): Promise<Array<{ fileId: string; fileName: string }>> {
  const supabase = createServiceClient();

  // Find files where the embedding content_hash doesn't match the current file content_hash
  // This requires comparing with the files table
  const { data, error } = await supabase
    .from('project_files')
    .select('id, name, content_hash')
    .eq('project_id', projectId);

  if (error || !data) return [];

  const { data: embedded } = await supabase
    .from('file_embeddings')
    .select('file_id, content_hash')
    .eq('project_id', projectId);

  const embeddedMap = new Map<string, string>();
  for (const e of embedded ?? []) {
    embeddedMap.set(e.file_id, e.content_hash);
  }

  return data
    .filter((f) => {
      const embeddedHash = embeddedMap.get(f.id);
      return !embeddedHash || embeddedHash !== f.content_hash;
    })
    .map((f) => ({ fileId: f.id, fileName: f.name }));
}
