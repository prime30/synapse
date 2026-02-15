import { createClient } from '@/lib/supabase/server';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

/** Generate an embedding vector for text content using OpenAI's embedding API. */
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not set — required for embedding generation');
  }

  // Truncate to ~8000 tokens worth of text (roughly 32000 chars)
  const truncated = text.slice(0, 32_000);

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: truncated,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI embedding error (${response.status}): ${err}`);
  }

  const data = (await response.json()) as {
    data?: Array<{ embedding: number[] }>;
  };

  const embedding = data.data?.[0]?.embedding;
  if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error('Invalid embedding response from OpenAI');
  }

  return embedding;
}

/** Generate embeddings for multiple texts in a single batch call. */
export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not set');
  }

  const truncated = texts.map(t => t.slice(0, 32_000));

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: truncated,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI embedding error (${response.status}): ${err}`);
  }

  const data = (await response.json()) as {
    data?: Array<{ index: number; embedding: number[] }>;
  };

  // Sort by index to match input order
  const sorted = (data.data ?? []).sort((a, b) => a.index - b.index);
  return sorted.map(d => d.embedding);
}

/**
 * Store file embedding in Supabase (requires pgvector extension + file_embeddings table).
 * Falls back silently if the table doesn't exist.
 */
export async function storeFileEmbedding(
  projectId: string,
  fileId: string,
  fileName: string,
  contentHash: string,
  embedding: number[],
): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('file_embeddings')
    .upsert(
      {
        project_id: projectId,
        file_id: fileId,
        file_name: fileName,
        content_hash: contentHash,
        embedding: `[${embedding.join(',')}]`,
      },
      { onConflict: 'project_id,file_id' }
    );

  if (error) {
    console.warn('[embeddings] Failed to store embedding (table may not exist):', error.message);
  }
}

/**
 * Search for similar files using cosine similarity on stored embeddings.
 * Requires pgvector extension with the <=> operator.
 * Returns file IDs sorted by similarity (most similar first).
 */
export async function searchSimilarFiles(
  projectId: string,
  queryEmbedding: number[],
  limit = 10,
): Promise<Array<{ fileId: string; fileName: string; similarity: number }>> {
  const supabase = await createClient();

  // Use RPC for vector similarity search (requires pgvector)
  const { data, error } = await supabase.rpc('match_file_embeddings', {
    p_project_id: projectId,
    query_embedding: `[${queryEmbedding.join(',')}]`,
    match_count: limit,
  });

  if (error) {
    console.warn('[embeddings] Semantic search failed (pgvector may not be configured):', error.message);
    return [];
  }

  return (data ?? []).map((r: { file_id: string; file_name: string; similarity: number }) => ({
    fileId: r.file_id,
    fileName: r.file_name,
    similarity: r.similarity,
  }));
}

/**
 * High-level semantic file search: embed the query, search for similar files.
 * Falls back gracefully if OpenAI key or pgvector is not available.
 */
export async function semanticFileSearch(
  projectId: string,
  query: string,
  limit = 10,
): Promise<Array<{ fileId: string; fileName: string; similarity: number }>> {
  try {
    const queryEmbedding = await generateEmbedding(query);
    return await searchSimilarFiles(projectId, queryEmbedding, limit);
  } catch (err) {
    console.warn('[embeddings] Semantic search unavailable:', String(err));
    return [];
  }
}

/**
 * Index all files in a project by generating and storing embeddings.
 * Skips files whose content hash hasn't changed since last indexing.
 * Processes in batches to stay within API limits.
 */
export async function indexProjectFiles(
  projectId: string,
  files: Array<{ fileId: string; fileName: string; content: string; contentHash: string }>,
): Promise<{ indexed: number; skipped: number }> {
  const supabase = await createClient();
  let indexed = 0;
  let skipped = 0;

  // Check existing hashes to skip unchanged files
  const { data: existing } = await supabase
    .from('file_embeddings')
    .select('file_id, content_hash')
    .eq('project_id', projectId);

  const existingHashes = new Map<string, string>();
  for (const e of existing ?? []) {
    existingHashes.set(e.file_id, e.content_hash);
  }

  // Filter to only files that need updating
  const toIndex = files.filter(f => {
    const existingHash = existingHashes.get(f.fileId);
    if (existingHash === f.contentHash) {
      skipped++;
      return false;
    }
    return true;
  });

  // Process in batches of 20
  const BATCH_SIZE = 20;
  for (let i = 0; i < toIndex.length; i += BATCH_SIZE) {
    const batch = toIndex.slice(i, i + BATCH_SIZE);
    try {
      const embeddings = await generateEmbeddingsBatch(batch.map(f => f.content));
      for (let j = 0; j < batch.length; j++) {
        await storeFileEmbedding(
          projectId,
          batch[j].fileId,
          batch[j].fileName,
          batch[j].contentHash,
          embeddings[j],
        );
        indexed++;
      }
    } catch (err) {
      console.warn(`[embeddings] Batch ${i / BATCH_SIZE} failed:`, String(err));
    }
  }

  return { indexed, skipped };
}
