/**
 * Built-in task: warm-embeddings
 *
 * Re-embeds files with stale or missing embeddings using the chunked
 * pgvector schema (migration 041). Runs periodically or after file sync.
 */

import { getTaskRunner, type TaskResult } from '../task-runner';
import { createServiceClient } from '@/lib/supabase/admin';
import { getStaleFiles, upsertEmbedding, type EmbeddingChunk } from '@/lib/ai/vector-store';
import { generateEmbeddingsBatch } from '@/lib/ai/embeddings';
import { createHash } from 'crypto';

const BATCH_SIZE = 20;
const MAX_CHUNK_CHARS = 32_000; // ~8000 tokens
const CHUNK_OVERLAP = 200;

/** Chunk text into overlapping windows for embedding. */
function chunkText(text: string): string[] {
  if (text.length <= MAX_CHUNK_CHARS) return [text];
  const chunks: string[] = [];
  let offset = 0;
  while (offset < text.length) {
    chunks.push(text.slice(offset, offset + MAX_CHUNK_CHARS));
    offset += MAX_CHUNK_CHARS - CHUNK_OVERLAP;
  }
  return chunks;
}

/** Simple content hash. */
function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/** Sleep helper for backoff. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Warm embeddings for a specific project.
 * Exported so it can be called after file sync.
 */
export async function warmEmbeddingsForProject(projectId: string): Promise<{ embedded: number; errors: number }> {
  if (process.env.ENABLE_VECTOR_SEARCH !== 'true') {
    return { embedded: 0, errors: 0 };
  }

  const supabase = createServiceClient();
  const staleFiles = await getStaleFiles(projectId);
  if (staleFiles.length === 0) return { embedded: 0, errors: 0 };

  let embedded = 0;
  let errors = 0;
  let backoffMs = 1000;

  for (let i = 0; i < staleFiles.length; i += BATCH_SIZE) {
    const batch = staleFiles.slice(i, i + BATCH_SIZE);

    // Load file content
    const fileIds = batch.map((f) => f.fileId);
    const { data: fileRows } = await supabase
      .from('files')
      .select('id, name, content')
      .in('id', fileIds);

    if (!fileRows || fileRows.length === 0) continue;

    for (const file of fileRows) {
      if (!file.content) continue;

      try {
        const chunks = chunkText(file.content);
        const contentHash = hashContent(file.content);

        // Embed chunks in batches
        const allChunks: EmbeddingChunk[] = [];
        for (let ci = 0; ci < chunks.length; ci += BATCH_SIZE) {
          const chunkBatch = chunks.slice(ci, ci + BATCH_SIZE);

          let embeddings: number[][];
          try {
            embeddings = await generateEmbeddingsBatch(chunkBatch);
            backoffMs = 1000; // Reset on success
          } catch (err) {
            // Rate limit — exponential backoff
            if (String(err).includes('429') || String(err).includes('rate')) {
              console.warn(`[warm-embeddings] Rate limited, backing off ${backoffMs}ms`);
              await sleep(backoffMs);
              backoffMs = Math.min(backoffMs * 2, 30_000);
              // Retry once
              try {
                embeddings = await generateEmbeddingsBatch(chunkBatch);
              } catch {
                errors++;
                continue;
              }
            } else {
              errors++;
              continue;
            }
          }

          for (let j = 0; j < chunkBatch.length; j++) {
            allChunks.push({
              chunkIndex: ci + j,
              chunkText: chunkBatch[j],
              embedding: embeddings[j],
            });
          }
        }

        await upsertEmbedding(projectId, file.id, file.name, contentHash, allChunks);
        embedded++;
      } catch (err) {
        console.error(`[warm-embeddings] Failed for ${file.name}:`, String(err));
        errors++;
      }
    }
  }

  return { embedded, errors };
}

async function warmEmbeddings(): Promise<TaskResult> {
  if (process.env.ENABLE_VECTOR_SEARCH !== 'true') {
    return { success: true, message: 'Vector search disabled (ENABLE_VECTOR_SEARCH != true)' };
  }

  const supabase = createServiceClient();
  const { data: projects } = await supabase
    .from('projects')
    .select('id')
    .limit(50);

  if (!projects || projects.length === 0) {
    return { success: true, message: 'No projects to process' };
  }

  let totalEmbedded = 0;
  let totalErrors = 0;

  for (const project of projects) {
    const result = await warmEmbeddingsForProject(project.id);
    totalEmbedded += result.embedded;
    totalErrors += result.errors;
  }

  return {
    success: totalErrors === 0,
    message: `Embedded ${totalEmbedded} files, ${totalErrors} errors across ${projects.length} projects`,
  };
}

// Self-register
getTaskRunner().register({
  name: 'warm-embeddings',
  handler: warmEmbeddings,
  intervalMinutes: 30,
  maxRetries: 3,
});
