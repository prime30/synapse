/**
 * Supabase pgvector store -- EPIC A
 */

import { createServiceClient } from '@/lib/supabase/admin';

export interface SimilarityResult {
  fileId: string;
  fileName: string;
  chunkText: string;
  chunkIndex: number;
  similarity: number;
}

export interface EmbeddingChunk {
  chunkIndex: number;
  chunkText: string;
  embedding: number[];
}

const EMBEDDING_DIMENSIONS = 1536;
const DEFAULT_MODEL = 'text-embedding-3-small';

export async function upsertEmbedding(
  projectId: string,
  fileId: string,
  fileName: string,
  contentHash: string,
  chunks: EmbeddingChunk[],
  modelVersion: string = DEFAULT_MODEL,
): Promise<void> {
  const supabase = createServiceClient();
  await supabase.from('file_embeddings').delete().eq('project_id', projectId).eq('file_id', fileId);
  const rows = chunks.map((chunk) => ({
    project_id: projectId,
    file_id: fileId,
    file_name: fileName,
    chunk_index: chunk.chunkIndex,
    chunk_text: chunk.chunkText.slice(0, 200),
    content_hash: contentHash,
    embedding: '[' + chunk.embedding.join(',') + ']',
    model_version: modelVersion,
  }));
  if (rows.length > 0) {
    const { error } = await supabase.from('file_embeddings').insert(rows);
    if (error) console.warn('[vector-store] Insert failed:', error.message);
  }
}

export async function similaritySearch(
  queryVector: number[],
  topK: number,
  projectId: string,
): Promise<SimilarityResult[]> {
  if (queryVector.length !== EMBEDDING_DIMENSIONS) return [];
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc('match_file_embeddings', {
    p_project_id: projectId,
    query_embedding: '[' + queryVector.join(',') + ']',
    match_count: topK,
  });
  if (error) { console.warn('[vector-store] Search failed:', error.message); return []; }
  return (data ?? []).map((r: Record<string, unknown>) => ({
    fileId: r.file_id as string,
    fileName: r.file_name as string,
    chunkText: (r.chunk_text as string) ?? '',
    chunkIndex: (r.chunk_index as number) ?? 0,
    similarity: r.similarity as number,
  }));
}

export async function deleteByFile(projectId: string, fileId: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase.from('file_embeddings').delete().eq('project_id', projectId).eq('file_id', fileId);
}

export async function getStaleFiles(
  projectId: string,
): Promise<Array<{ fileId: string; fileName: string }>> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('files')
    .select('id, name, content')
    .eq('project_id', projectId);
  if (error || !data) return [];
  const { data: embedded } = await supabase
    .from('file_embeddings')
    .select('file_id, content_hash')
    .eq('project_id', projectId);
  const embeddedMap = new Map<string, string>();
  for (const e of embedded ?? []) embeddedMap.set(e.file_id, e.content_hash);

  const encoder = new TextEncoder();
  return (await Promise.all(
    data.map(async (f) => {
      const hash = Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode((f.content as string) ?? ''))),
      ).map((b) => b.toString(16).padStart(2, '0')).join('');
      const embeddedHash = embeddedMap.get(f.id);
      if (!embeddedHash || embeddedHash !== hash) {
        return { fileId: f.id as string, fileName: f.name as string };
      }
      return null;
    }),
  )).filter((f): f is { fileId: string; fileName: string } => f !== null);
}