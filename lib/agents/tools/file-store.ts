import type { FileContext } from '@/lib/types/agent';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { LoadContentFn } from '@/lib/supabase/file-loader';
import { normalizeForAgent, prettifyFile } from './prettify';
import { recordHistogram } from '@/lib/observability/metrics';

export type OnFileChangedFn = (change: {
  fileId: string;
  fileName: string;
  originalContent: string;
  proposedContent: string;
  reasoning: string;
}) => void;

export type WriteActor = 'agent' | 'user';

export type OnConflictFn = (conflict: {
  fileId: string;
  fileName: string;
  overwrittenBy: WriteActor;
  overwrittenActor: WriteActor;
  filePath: string;
}) => void;

type DbFileRow = {
  id: string;
  name: string;
  path: string | null;
  file_type: string;
  content: string | null;
};

const DB_WRITE_MAX_RETRIES = 2;
const DB_WRITE_RETRY_BASE_MS = 500;
const COALESCE_WINDOW_MS = 200;
const CONFLICT_WINDOW_MS = 30_000;

/**
 * Local-first file access layer.
 *
 * Reads: in-memory (dirty wins) → loadContent waterfall → DB fallback.
 * Writes: memory + disk cache immediately → background DB write → Shopify push.
 *
 * Call flush() before session ends to ensure all background DB writes complete.
 */
export class FileStore {
  private dirtyFiles = new Set<string>();
  private writeQueue = new Map<string, {
    content: string;
    timer: ReturnType<typeof setTimeout> | null;
    resolve: () => void;
    reject: (err: Error) => void;
    promise: Promise<void>;
  }>();
  private flushPromises: Promise<void>[] = [];
  private lastWriteInfo = new Map<string, { writtenBy: WriteActor; writtenAt: number }>();

  constructor(
    private files: FileContext[],
    private loadContent?: LoadContentFn,
    private supabaseClient?: SupabaseClient,
    private projectId?: string,
    private onFileChanged?: OnFileChangedFn,
    private onConflict?: OnConflictFn,
  ) {}

  setSupabaseClient(client: SupabaseClient): void {
    this.supabaseClient = client;
  }

  /**
   * Resolve a file reference (id, name, path, or partial path) to a FileContext.
   * Falls back to database lookup if not found in memory.
   */
  resolve(ref: string): FileContext | undefined {
    if (!ref) return undefined;
    const baseRef = ref.split('/').pop() ?? ref;
    return this.files.find((f) => {
      const name = f.fileName ?? '';
      const path = f.path ?? '';
      const baseName = name.split('/').pop() ?? name;
      const basePath = path.split('/').pop() ?? path;
      return (
        f.fileId === ref ||
        name === ref ||
        path === ref ||
        name.endsWith(`/${ref}`) ||
        path.endsWith(`/${ref}`) ||
        baseName === baseRef ||
        basePath === baseRef
      );
    });
  }

  /**
   * Resolve from database when the file isn't in the in-memory array.
   */
  async resolveFromDb(ref: string): Promise<FileContext | null> {
    if (!this.supabaseClient || !this.projectId || !ref) return null;
    const t0 = Date.now();

    if (/[,().]/.test(ref) && !/^[0-9a-f-]{36}$/i.test(ref)) {
      const { data } = await this.supabaseClient
        .from('files')
        .select('id,name,path,file_type,content')
        .eq('project_id', this.projectId)
        .eq('path', ref)
        .maybeSingle<DbFileRow>();
      recordHistogram('agent.resolve_file_db_ms', Date.now() - t0).catch(() => {});
      if (data && typeof data.content === 'string') {
        const fc = toFileContext(data);
        this.files.push(fc);
        return fc;
      }
      return null;
    }

    const baseName = ref.split('/').pop() ?? ref;
    const { data } = await this.supabaseClient
      .from('files')
      .select('id,name,path,file_type,content')
      .eq('project_id', this.projectId)
      .or(`id.eq.${ref},path.eq.${ref},name.eq.${baseName}`)
      .limit(1)
      .maybeSingle<DbFileRow>();
    recordHistogram('agent.resolve_file_db_ms', Date.now() - t0).catch(() => {});
    if (!data || typeof data.content !== 'string') return null;
    const fc = toFileContext(data);
    this.files.push(fc);
    return fc;
  }

  /**
   * Read file content. For files written this session (dirty), the in-memory
   * content is authoritative. For clean files, hydrates via loadContent waterfall.
   */
  async read(fileIdOrPath: string): Promise<{ file: FileContext; content: string } | null> {
    let file = this.resolve(fileIdOrPath);
    if (!file) {
      file = (await this.resolveFromDb(fileIdOrPath)) ?? undefined;
    }
    if (!file) return null;

    let content = file.content;

    // Dirty files: in-memory is the source of truth — skip loadContent
    // which would return stale data from the disk/DB cache.
    if (!this.dirtyFiles.has(file.fileId) && this.loadContent) {
      try {
        const hydrated = await this.loadContent([file.fileId]);
        if (hydrated.length > 0 && hydrated[0].content) {
          content = hydrated[0].content;
          file.content = content;
        }
      } catch (err) {
        console.error(`[FileStore] loadContent failed for file ${file.fileId}:`, err);
      }
    }

    if (content.startsWith('[')) return null;

    content = normalizeForAgent(content);
    return { file, content };
  }

  /**
   * Local-first write. Updates memory and disk cache immediately (non-blocking
   * for the agent), then queues a background DB write with retry.
   */
  async write(
    file: FileContext,
    newContent: string,
    reasoning: string,
    actor: WriteActor = 'agent',
  ): Promise<{ error?: string }> {
    const lastWrite = this.lastWriteInfo.get(file.fileId);
    if (
      lastWrite &&
      lastWrite.writtenBy !== actor &&
      Date.now() - lastWrite.writtenAt < CONFLICT_WINDOW_MS
    ) {
      this.onConflict?.({
        fileId: file.fileId,
        fileName: file.fileName,
        overwrittenBy: actor,
        overwrittenActor: lastWrite.writtenBy,
        filePath: file.path || file.fileName,
      });
    }

    const originalContent = file.content;
    const filePath = file.fileName || file.path || '';
    const updatedContent = prettifyFile(newContent, filePath);

    file.content = updatedContent;
    this.dirtyFiles.add(file.fileId);

    this.syncDiskCache(file, updatedContent);

    try {
      const { invalidateFileContent } = await import('@/lib/supabase/file-loader');
      invalidateFileContent(file.fileId);
    } catch { /* non-blocking */ }

    this.onFileChanged?.({
      fileId: file.fileId,
      fileName: file.fileName,
      originalContent,
      proposedContent: updatedContent,
      reasoning,
    });

    const existing = this.writeQueue.get(file.fileId);
    if (existing) {
      existing.content = updatedContent;
      if (existing.timer !== null) clearTimeout(existing.timer);
      existing.timer = setTimeout(() => this.drainQueueEntry(file.fileId), COALESCE_WINDOW_MS);
    } else {
      let resolve!: () => void;
      let reject!: (err: Error) => void;
      const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
      this.writeQueue.set(file.fileId, {
        content: updatedContent,
        timer: setTimeout(() => this.drainQueueEntry(file.fileId), COALESCE_WINDOW_MS),
        resolve,
        reject,
        promise,
      });
      this.flushPromises.push(promise);
    }

    this.lastWriteInfo.set(file.fileId, { writtenBy: actor, writtenAt: Date.now() });

    return {};
  }

  /**
   * Remove a file from all cache layers. Call after a successful DB delete.
   */
  async invalidateFile(fileId: string): Promise<void> {
    this.dirtyFiles.delete(fileId);
    const idx = this.files.findIndex(f => f.fileId === fileId);
    if (idx >= 0) this.files.splice(idx, 1);

    try {
      const { invalidateFileContent } = await import('@/lib/supabase/file-loader');
      invalidateFileContent(fileId);
    } catch { /* non-blocking */ }

    if (this.projectId) {
      try {
        const { deleteCachedFile } = await import('@/lib/cache/local-file-cache');
        deleteCachedFile(this.projectId, fileId);
      } catch { /* disk cache unavailable */ }

      try {
        const { invalidateProjectFilesCache } = await import('@/lib/supabase/file-loader');
        await invalidateProjectFilesCache(this.projectId);
      } catch { /* non-blocking */ }
    }
  }

  /**
   * Update metadata caches after a file rename. Call after a successful DB rename.
   */
  async invalidateRename(fileId: string, newPath: string): Promise<void> {
    const file = this.files.find(f => f.fileId === fileId);
    if (file) {
      file.fileName = newPath;
      file.path = newPath;
    }

    try {
      const { invalidateFileContent } = await import('@/lib/supabase/file-loader');
      invalidateFileContent(fileId);
    } catch { /* non-blocking */ }

    if (this.projectId) {
      try {
        const { invalidateProjectFilesCache } = await import('@/lib/supabase/file-loader');
        await invalidateProjectFilesCache(this.projectId);
      } catch { /* non-blocking */ }
    }
  }

  /** Get IDs of all files modified during this session (for checkpoint). */
  getDirtyFileIds(): Set<string> {
    return new Set(this.dirtyFiles);
  }

  /** Add a newly created file to the store so subsequent tools can reference it. */
  addFile(file: FileContext): void {
    this.files.push(file);
    this.dirtyFiles.add(file.fileId);
  }

  /**
   * Wait for all pending background DB writes to complete.
   * Call before session ends to ensure Supabase is consistent.
   * Returns an array of file IDs that failed to save (empty = all succeeded).
   */
  async flush(): Promise<{ failedFileIds: string[] }> {
    for (const [fileId, entry] of this.writeQueue) {
      if (entry.timer !== null) clearTimeout(entry.timer);
      entry.timer = null;
      this.backgroundDbWrite(fileId, entry.content).then(entry.resolve, entry.reject);
    }
    this.writeQueue.clear();

    if (this.flushPromises.length === 0) return { failedFileIds: [] };
    const results = await Promise.allSettled(this.flushPromises);
    this.flushPromises = [];

    const failedFileIds: string[] = [];
    for (const result of results) {
      if (result.status === 'rejected') {
        const reason = result.reason;
        const fileId = typeof reason === 'object' && reason?.fileId ? String(reason.fileId) : 'unknown';
        failedFileIds.push(fileId);
        console.error(`[FileStore] Flush failed for file ${fileId}:`, reason);
      }
    }

    if (failedFileIds.length > 0) {
      console.error(`[FileStore] ${failedFileIds.length} file(s) failed to save during flush`);
    }

    return { failedFileIds };
  }

  // ── Private helpers ──────────────────────────────────────────────────

  private drainQueueEntry(fileId: string): void {
    const entry = this.writeQueue.get(fileId);
    if (!entry) return;
    this.writeQueue.delete(fileId);
    entry.timer = null;
    this.backgroundDbWrite(fileId, entry.content).then(entry.resolve, entry.reject);
  }

  private fireAndForgetEmbed(projectId: string, fileId: string, content: string): void {
    if (process.env.DISABLE_VECTOR_SEARCH === 'true' || !process.env.OPENAI_API_KEY) return;
    const file = this.files.find(f => f.fileId === fileId);
    if (!file) return;

    (async () => {
      try {
        const { createHash } = await import('crypto');
        const { generateEmbeddingsBatch } = await import('@/lib/ai/embeddings');
        const vectorStore = await import('@/lib/ai/vector-store');

        const contentHash = createHash('sha256').update(content).digest('hex').slice(0, 16);
        const MAX_CHUNK = 32_000;
        const OVERLAP = 200;
        const texts: string[] = [];
        if (content.length <= MAX_CHUNK) {
          texts.push(content);
        } else {
          let offset = 0;
          while (offset < content.length) {
            texts.push(content.slice(offset, offset + MAX_CHUNK));
            offset += MAX_CHUNK - OVERLAP;
          }
        }

        const embeddings = await generateEmbeddingsBatch(texts);
        const chunks = texts.map((t, i) => ({
          chunkIndex: i,
          chunkText: t,
          embedding: embeddings[i],
        }));

        await vectorStore.upsertEmbedding(projectId, fileId, file.fileName, contentHash, chunks);
      } catch {
        // Embedding is best-effort; never block the write path
      }
    })();
  }

  private syncDiskCache(file: FileContext, content: string): void {
    if (!this.projectId) return;
    try {
      const { updateCachedFile } = require('@/lib/cache/local-file-cache') as typeof import('@/lib/cache/local-file-cache');
      const relativePath = file.path || file.fileName;
      updateCachedFile(
        this.projectId,
        file.fileId,
        file.fileName,
        relativePath,
        file.fileType || 'other',
        content,
      );
    } catch { /* disk cache unavailable (Edge runtime, test env) */ }
  }

  private async backgroundDbWrite(fileId: string, content: string): Promise<void> {
    if (!this.supabaseClient) return;

    if (this.projectId) {
      try {
        const { persistPendingWrite } = await import('@/lib/cache/pending-writes-store');
        await persistPendingWrite(this.projectId, fileId, content);
      } catch { /* non-blocking — durable queue is best-effort */ }
    }

    for (let attempt = 0; attempt <= DB_WRITE_MAX_RETRIES; attempt++) {
      try {
        const { error } = await this.supabaseClient
          .from('files')
          .update({ content, updated_at: new Date().toISOString() })
          .eq('id', fileId);

        if (!error) {
          if (this.projectId) {
            try {
              const { clearPendingWrite } = await import('@/lib/cache/pending-writes-store');
              await clearPendingWrite(this.projectId, fileId);
            } catch { /* non-blocking */ }
            try {
              const { schedulePushForProject } = await import('@/lib/shopify/push-queue');
              schedulePushForProject(this.projectId);
            } catch { /* non-blocking */ }
            try {
              const file = this.files.find(f => f.fileId === fileId);
              if (file && this.projectId) {
                const { markFileForPush } = await import('@/lib/shopify/theme-file-sync');
                await markFileForPush(this.projectId, file.path ?? file.fileName);
              }
            } catch { /* non-blocking */ }
            this.fireAndForgetEmbed(this.projectId, fileId, content);
          }
          return;
        }

        console.warn(`[FileStore] DB write attempt ${attempt + 1} failed:`, error.message);
      } catch (err) {
        console.warn(`[FileStore] DB write attempt ${attempt + 1} error:`, err);
      }

      if (attempt < DB_WRITE_MAX_RETRIES) {
        await new Promise(r => setTimeout(r, DB_WRITE_RETRY_BASE_MS * (attempt + 1)));
      }
    }

    if (this.projectId) {
      try {
        const { incrementWriteAttempts } = await import('@/lib/cache/pending-writes-store');
        await incrementWriteAttempts(this.projectId, fileId);
      } catch { /* non-blocking */ }
    }
    const msg = `DB write failed after ${DB_WRITE_MAX_RETRIES + 1} attempts for file ${fileId}`;
    console.error(`[FileStore] ${msg}`);
    const err = new Error(msg);
    (err as Error & { fileId: string }).fileId = fileId;
    throw err;
  }
}

function toFileContext(data: DbFileRow): FileContext {
  return {
    fileId: data.id,
    fileName: data.path ?? data.name,
    path: data.path ?? data.name,
    fileType: (data.file_type as FileContext['fileType']) ?? 'other',
    content: data.content!,
  };
}
