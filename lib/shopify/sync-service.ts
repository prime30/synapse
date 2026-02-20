import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { ShopifyAdminAPIFactory } from './admin-api-factory';
import type { ShopifyAsset, ShopifyAdminAPI } from './admin-api';
import type { ThemeFile, ThemeFileSyncStatus } from '@/lib/types/shopify';
import { createHash } from 'crypto';
import { APIError } from '@/lib/errors/handler';
import { createFile, updateFile } from '@/lib/services/files';
import { detectFileTypeFromName } from '@/lib/types/files';
import { invalidateAllProjectCaches } from '@/lib/supabase/file-loader';
import {
  downloadFromStorage,
  uploadToStorage,
  shouldUseStorage,
  uploadBinaryToStorage,
  downloadBinaryFromStorage,
} from '@/lib/storage/files';

export interface SyncResult {
  pulled: number;
  pushed: number;
  conflicts: string[];
  errors: string[];
  binaryPending?: number;
}

export interface PullOptions {
  /** When true, only import text files and register binary assets as
   *  `binary_pending` placeholder rows in theme_files. The caller is
   *  responsible for invoking `pullBinaryAssets` separately. */
  textOnly?: boolean;
}

const PUSH_CONCURRENCY = 5;

export class ThemeSyncService {
  private readonly PREFETCH_CONCURRENCY = 40;
  private readonly PROCESS_CONCURRENCY = 20;

  private async adminSupabase() {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceKey) {
      return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);
    }
    return createServerClient();
  }

  /**
   * Pull theme files from Shopify and sync to local database.
   * Fetches all assets from the remote theme, compares hashes, and updates local files.
   * @param connectionId - The Shopify connection ID.
   * @param themeId - The Shopify theme ID to pull from.
   * @param projectId - The project to sync files into (explicit, not derived from connection).
   */
  async pullTheme(connectionId: string, themeId: number, projectId?: string, options?: PullOptions): Promise<SyncResult> {
    const result: SyncResult = {
      pulled: 0,
      pushed: 0,
      conflicts: [],
      errors: [],
    };

    try {
      // 1. Get API client via factory
      const api = await ShopifyAdminAPIFactory.create(connectionId);

      // 2. Resolve project_id: prefer explicit param, fall back to connection's legacy project_id
      const supabase = await this.adminSupabase();

      let resolvedProjectId: string;
      if (projectId) {
        resolvedProjectId = projectId;
      } else {
        const { data: connection, error: connError } = await supabase
          .from('shopify_connections')
          .select('project_id')
          .eq('id', connectionId)
          .single();

        if (connError || !connection?.project_id) {
          throw APIError.notFound('Shopify connection not found or no project linked');
        }
        resolvedProjectId = connection.project_id;
      }

      // Get project to access owner_id for created_by
      const { data: project, error: projError } = await supabase
        .from('projects')
        .select('owner_id')
        .eq('id', resolvedProjectId)
        .single();

      if (projError || !project) {
        throw APIError.notFound('Project not found');
      }

      // 3. List all remote assets and split by type
      const remoteAssets = await api.listAssets(themeId);
      const textAssets = remoteAssets.filter((a) => this.shouldFetchAssetValue(a.key));
      const binaryAssets = remoteAssets.filter((a) => !this.shouldFetchAssetValue(a.key));
      // 4. Load existing data EARLY so we know which insert path to use
      const { data: existingThemeFiles, error: existingThemeFilesError } =
        await supabase
          .from('theme_files')
          .select('*')
          .eq('connection_id', connectionId);
      if (existingThemeFilesError) {
        throw new APIError(
          `Failed to load theme files: ${existingThemeFilesError.message}`,
          'QUERY_ERROR',
          500
        );
      }
      const { data: existingProjectFiles, error: existingProjectFilesError } =
        await supabase
          .from('files')
          .select('id, path')
          .eq('project_id', resolvedProjectId);
      if (existingProjectFilesError) {
        throw new APIError(
          `Failed to load project files: ${existingProjectFilesError.message}`,
          'QUERY_ERROR',
          500
        );
      }

      const existingThemeCount = (existingThemeFiles ?? []).length;
      const existingProjectCount = (existingProjectFiles ?? []).length;

      // Fresh import if the project has no files. If there are orphaned
      // theme_files from a previous import attempt (same connection, different
      // or failed project), clean them up so the batch insert path works.
      const isFreshImport = existingProjectCount === 0;
      if (isFreshImport && existingThemeCount > 0) {
        await supabase
          .from('theme_files')
          .delete()
          .eq('connection_id', connectionId);
      }

      // ── Shared batch helpers ──────────────────────────────────────────
      const BATCH_SIZE = 50;
      /** Chunk size for fresh import: prefetch + insert per chunk so polling sees progress. */
      const PROGRESS_CHUNK_SIZE = 50;
      let insertedCount = 0;

      const batchInsertFiles = async (
        rows: Array<Record<string, unknown>>,
        themeRows: Array<Record<string, unknown>>
      ) => {
        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
          const batch = rows.slice(i, i + BATCH_SIZE);
          const { error: batchErr } = await supabase.from('files').insert(batch);
          if (batchErr) {
            for (const row of batch) {
              const { error: rowErr } = await supabase.from('files').insert(row);
              if (rowErr) {
                result.errors.push(`${row.path}: ${rowErr.message}`);
              } else {
                insertedCount++;
              }
            }
          } else {
            insertedCount += batch.length;
          }
        }
        for (let i = 0; i < themeRows.length; i += BATCH_SIZE) {
          const batch = themeRows.slice(i, i + BATCH_SIZE);
          const { error: batchErr } = await supabase.from('theme_files').insert(batch);
          if (batchErr) {
            for (const row of batch) {
              const { error: rowErr } = await supabase.from('theme_files').insert(row);
              if (rowErr) {
                result.errors.push(`${row.file_path}: theme_files: ${rowErr.message}`);
              }
            }
          }
        }
      };

      if (isFreshImport) {
        // ===== FRESH IMPORT: Chunked prefetch + insert so progress bar moves during import =====
        // Process text assets in chunks: prefetch chunk → build rows → insert. Polling /files/count
        // sees the count increase every PROGRESS_CHUNK_SIZE files instead of staying at 0 until the end.
        for (let chunkStart = 0; chunkStart < textAssets.length; chunkStart += PROGRESS_CHUNK_SIZE) {
          const chunk = textAssets.slice(chunkStart, chunkStart + PROGRESS_CHUNK_SIZE);
          const prefetchedChunk = await this.prefetchMissingAssetValues(
            api,
            themeId,
            chunk,
            result,
            this.PREFETCH_CONCURRENCY
          );

          const textFileRows: Array<Record<string, unknown>> = [];
          const textThemeRows: Array<Record<string, unknown>> = [];

          for (const asset of chunk) {
            const content = asset.value ?? prefetchedChunk.get(asset.key);
            if (!content) continue;

            const fileName = asset.key.split('/').pop() || asset.key;
            const fileType = detectFileTypeFromName(fileName);
            const contentHash = this.computeHash(content);
            const sizeBytes = new TextEncoder().encode(content).length;

            let storagePath: string | null = null;
            let inlineContent: string | null = content;
            if (shouldUseStorage(sizeBytes)) {
              storagePath = await uploadToStorage(resolvedProjectId, asset.key, content);
              inlineContent = null;
            }

            textFileRows.push({
              project_id: resolvedProjectId,
              name: fileName,
              path: asset.key,
              file_type: fileType,
              size_bytes: sizeBytes,
              content: inlineContent,
              storage_path: storagePath,
              created_by: project.owner_id,
            });
            textThemeRows.push({
              connection_id: connectionId,
              file_path: asset.key,
              content_hash: contentHash,
              remote_updated_at: asset.updated_at,
              sync_status: 'synced',
            });
          }

          await batchInsertFiles(textFileRows, textThemeRows);
        }

        // 6b. Handle binary assets
        if (options?.textOnly) {
          // ── TEXT-ONLY MODE: insert binary_pending placeholder rows ──
          const binaryPlaceholderRows = binaryAssets.map((asset) => ({
            connection_id: connectionId,
            file_path: asset.key,
            content_hash: null,
            remote_updated_at: asset.updated_at,
            sync_status: 'binary_pending',
          }));
          // Batch insert placeholders
          for (let i = 0; i < binaryPlaceholderRows.length; i += BATCH_SIZE) {
            const batch = binaryPlaceholderRows.slice(i, i + BATCH_SIZE);
            const { error: placeholderErr } = await supabase
              .from('theme_files')
              .insert(batch);
            if (placeholderErr) {
              // Fallback: insert one-by-one
              for (const row of batch) {
                const { error: rowErr } = await supabase
                  .from('theme_files')
                  .insert(row);
                if (rowErr) {
                  result.errors.push(
                    `${row.file_path}: theme_files placeholder: ${rowErr.message}`
                  );
                }
              }
            }
          }
          result.pulled = insertedCount;
          result.binaryPending = binaryAssets.length;
        } else {
          // ── FULL MODE: download binary assets from CDN and insert ──
          await this.processBinaryAssetsFromList(
            binaryAssets,
            api,
            themeId,
            resolvedProjectId,
            connectionId,
            project.owner_id,
            BATCH_SIZE,
            supabase,
            batchInsertFiles,
            result
          );
          result.pulled = insertedCount;
        }
      } else {
        // ===== INCREMENTAL SYNC: Per-file with conflict detection =====
        const existingThemeFileByPath = new Map(
          (existingThemeFiles ?? []).map((row) => [row.file_path, row])
        );
        const existingFileIdByPath = new Map(
          (existingProjectFiles ?? []).map((row) => [row.path, row.id])
        );

        // Prefetch missing text values for incremental path only (fresh import uses chunked prefetch).
        const prefetchedAssetValues = await this.prefetchMissingAssetValues(
          api,
          themeId,
          textAssets,
          result,
          this.PREFETCH_CONCURRENCY
        );

        // 7a. Process text assets (existing per-file logic with conflict detection)
        let textCursor = 0;
        const textWorkerCount = Math.min(this.PROCESS_CONCURRENCY, textAssets.length);
        const textWorkers = Array.from({ length: textWorkerCount }, async () => {
          while (textCursor < textAssets.length) {
            const index = textCursor++;
            const asset = textAssets[index];
            try {
              const filePath = asset.key;
              let content = asset.value;
              if (!content && prefetchedAssetValues.has(filePath)) {
                content = prefetchedAssetValues.get(filePath);
              }
              if (!content) {
                try {
                  const detailedAsset = await api.getAsset(themeId, filePath);
                  content = detailedAsset.value;
                } catch (detailError) {
                  const detailErrorMessage =
                    detailError instanceof Error ? detailError.message : 'Unknown error';
                  result.errors.push(`${filePath}: ${detailErrorMessage}`);
                  continue;
                }
              }

              if (!content) continue;

              const contentHash = this.computeHash(content);
              const now = new Date().toISOString();
              const remoteUpdatedAt = asset.updated_at;
              const existingThemeFile = existingThemeFileByPath.get(filePath) ?? null;
              const fileName = filePath.split('/').pop() || filePath;
              const fileType = detectFileTypeFromName(fileName);
              const existingFileId = existingFileIdByPath.get(filePath);

              const hasChanged =
                !existingThemeFile || existingThemeFile.content_hash !== contentHash;

              if (
                existingThemeFile &&
                existingThemeFile.local_updated_at &&
                existingThemeFile.remote_updated_at &&
                new Date(existingThemeFile.local_updated_at) >
                  new Date(existingThemeFile.remote_updated_at) &&
                existingThemeFile.content_hash !== contentHash
              ) {
                result.conflicts.push(filePath);
                await supabase
                  .from('theme_files')
                  .update({
                    content_hash: contentHash,
                    remote_updated_at: remoteUpdatedAt,
                    sync_status: 'conflict',
                    updated_at: now,
                  })
                  .eq('id', existingThemeFile.id);
                continue;
              }

              if (hasChanged) {
                const themeFileData = {
                  connection_id: connectionId,
                  file_path: filePath,
                  content_hash: contentHash,
                  remote_updated_at: remoteUpdatedAt,
                  sync_status: 'synced' as ThemeFileSyncStatus,
                  updated_at: now,
                };

                if (existingThemeFile) {
                  await supabase
                    .from('theme_files')
                    .update(themeFileData)
                    .eq('id', existingThemeFile.id);
                  existingThemeFileByPath.set(filePath, {
                    ...existingThemeFile,
                    ...themeFileData,
                  });
                } else {
                  const { data: insertedThemeFile, error: insertThemeFileError } =
                    await supabase
                      .from('theme_files')
                      .insert(themeFileData)
                      .select('*')
                      .single();
                  if (insertThemeFileError || !insertedThemeFile) {
                    throw new APIError(
                      `Failed to insert theme file: ${insertThemeFileError?.message ?? 'Unknown error'}`,
                      'QUERY_ERROR',
                      500
                    );
                  }
                  existingThemeFileByPath.set(filePath, insertedThemeFile);
                }

                if (existingFileId) {
                  await updateFile(existingFileId, {
                    content,
                    path: filePath,
                  });
                } else {
                  const createdFile = await this.createProjectFile({
                    project_id: resolvedProjectId,
                    name: fileName,
                    path: filePath,
                    file_type: fileType,
                    content,
                    created_by: project.owner_id,
                  });
                  existingFileIdByPath.set(filePath, createdFile.id);
                }

                result.pulled++;
              } else if (existingThemeFile) {
                // Recover from prior partial syncs where theme_files row exists but local file creation failed.
                if (!existingFileId) {
                  const createdFile = await this.createProjectFile({
                    project_id: resolvedProjectId,
                    name: fileName,
                    path: filePath,
                    file_type: fileType,
                    content,
                    created_by: project.owner_id,
                  });
                  existingFileIdByPath.set(filePath, createdFile.id);
                  result.pulled++;
                }

                await supabase
                  .from('theme_files')
                  .update({
                    remote_updated_at: remoteUpdatedAt,
                    updated_at: now,
                  })
                  .eq('id', existingThemeFile.id);
              }
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : 'Unknown error';
              result.errors.push(`${asset.key}: ${errorMessage}`);
            }
          }
        });
        await Promise.all(textWorkers);

        // 7b. Download and process binary assets (per-file for incremental)
        const BINARY_CONCURRENCY = 20;
        const now = new Date().toISOString();
        {
          let binaryCursor = 0;
          const binaryWorkerCount = Math.min(BINARY_CONCURRENCY, binaryAssets.length);
          const binaryWorkers = Array.from({ length: binaryWorkerCount }, async () => {
            while (binaryCursor < binaryAssets.length) {
              const idx = binaryCursor++;
              const asset = binaryAssets[idx];
              try {
                let buffer: Buffer;
                if (asset.public_url) {
                  const resp = await fetch(asset.public_url);
                  if (!resp.ok) throw new Error(`CDN fetch failed: ${resp.status}`);
                  buffer = Buffer.from(await resp.arrayBuffer());
                } else {
                  const detailed = await api.getAsset(themeId, asset.key);
                  if (!detailed.attachment) continue;
                  buffer = Buffer.from(detailed.attachment, 'base64');
                }
                const storagePath = await uploadBinaryToStorage(
                  resolvedProjectId,
                  asset.key,
                  buffer,
                  asset.content_type
                );
                const hash = this.computeHash(buffer);

                const existingThemeFile = existingThemeFileByPath.get(asset.key) ?? null;
                const existingFileId = existingFileIdByPath.get(asset.key);
                const hasChanged = !existingThemeFile || existingThemeFile.content_hash !== hash;

                if (hasChanged) {
                  const themeFileData = {
                    connection_id: connectionId,
                    file_path: asset.key,
                    content_hash: hash,
                    remote_updated_at: asset.updated_at,
                    sync_status: 'synced' as ThemeFileSyncStatus,
                    updated_at: now,
                  };

                  if (existingThemeFile) {
                    await supabase
                      .from('theme_files')
                      .update(themeFileData)
                      .eq('id', existingThemeFile.id);
                  } else {
                    await supabase.from('theme_files').insert(themeFileData);
                  }

                  const fileName = asset.key.split('/').pop() || asset.key;
                  if (existingFileId) {
                    await supabase
                      .from('files')
                      .update({
                        storage_path: storagePath,
                        size_bytes: buffer.length,
                        updated_at: now,
                      })
                      .eq('id', existingFileId);
                  } else {
                    await supabase.from('files').insert({
                      project_id: resolvedProjectId,
                      name: fileName,
                      path: asset.key,
                      file_type: 'other',
                      size_bytes: buffer.length,
                      content: null,
                      storage_path: storagePath,
                      created_by: project.owner_id,
                    });
                  }

                  result.pulled++;
                }
              } catch (error) {
                const errorMessage =
                  error instanceof Error ? error.message : 'Unknown error';
                result.errors.push(`${asset.key}: ${errorMessage}`);
              }
            }
          });
          await Promise.all(binaryWorkers);
        }
      }

      // Queue background embedding refresh if vector search is enabled
      if (process.env.ENABLE_VECTOR_SEARCH === 'true' && result.pulled > 0) {
        import('@/lib/tasks/built-in/warm-embeddings')
          .then(({ warmEmbeddingsForProject }) => warmEmbeddingsForProject(resolvedProjectId))
          .then((embResult) => {
            if (embResult.embedded > 0 || embResult.errors > 0) {
              console.log(`[sync-service] Embedding refresh: ${embResult.embedded} files, ${embResult.errors} errors`);
            }
          })
          .catch((err) => console.warn('[sync-service] Embedding refresh failed:', String(err)));
      }

      // Queue background term mapping extraction from theme files
      if (result.pulled > 0) {
        import('@/lib/ai/theme-term-extractor')
          .then(async ({ extractAndStoreTermMappings }) => {
            const { data: textFiles } = await supabase
              .from('files')
              .select('id, name, path, file_type, content')
              .eq('project_id', resolvedProjectId)
              .not('content', 'is', null);
            if (textFiles && textFiles.length > 0) {
              return extractAndStoreTermMappings(resolvedProjectId, project.owner_id, textFiles);
            }
          })
          .then((r) => {
            if (r && r.stored > 0) {
              console.log(`[sync-service] Term mapping extraction: ${r.stored} stored, ${r.skipped} skipped`);
            }
          })
          .catch((err) => console.warn('[sync-service] Term mapping extraction failed:', String(err)));
      }

      // Bulk invalidation: clear metadata + all per-file content caches
      if (result.pulled > 0) {
        const { data: projFiles } = await supabase
          .from('files')
          .select('id')
          .eq('project_id', resolvedProjectId);
        const fileIds = (projFiles ?? []).map((f: { id: string }) => f.id);
        await invalidateAllProjectCaches(resolvedProjectId, fileIds).catch(() => {});

        // Write files to local disk cache for zero-latency agent reads
        try {
          const { data: allProjFiles } = await supabase
            .from('files')
            .select('id, name, path, file_type, content')
            .eq('project_id', resolvedProjectId);

          if (allProjFiles && allProjFiles.length > 0) {
            const cacheEntries = allProjFiles
              .filter((pf: { content: string | null }) => pf.content)
              .map((pf: { id: string; name: string; path: string | null; file_type: string; content: string }) => ({
                fileId: pf.id,
                fileName: pf.name,
                path: pf.path ?? pf.name,
                fileType: pf.file_type,
                content: pf.content,
              }));
            const { cacheThemeFiles } = await import('@/lib/cache/local-file-cache');
            cacheThemeFiles(resolvedProjectId, cacheEntries);
          }
        } catch (localCacheErr) {
          console.warn('[sync-service] Local cache write failed (non-fatal):', localCacheErr);
        }
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Pull failed: ${errorMessage}`);
    }

    return result;
  }

  /**
   * Push local theme files to Shopify.
   * Pushes files with status 'pending' to Shopify via putAsset.
   * @param connectionId - The Shopify connection ID.
   * @param themeId - The Shopify theme ID to push to.
   * @param filePaths - Optional list of file paths to push (defaults to all pending).
   * @param projectId - The project to read files from (explicit, not derived from connection).
   */
  async pushTheme(
    connectionId: string,
    themeId: number,
    filePaths?: string[],
    projectId?: string
  ): Promise<SyncResult> {
    const result: SyncResult = {
      pulled: 0,
      pushed: 0,
      conflicts: [],
      errors: [],
    };

    try {
      // 1. Get API client via factory
      const api = await ShopifyAdminAPIFactory.create(connectionId);

      // 2. Resolve project_id: prefer explicit param, fall back to connection's legacy project_id
      const supabase = await this.adminSupabase();

      let resolvedProjectId: string;
      if (projectId) {
        resolvedProjectId = projectId;
      } else {
        const { data: connection, error: connError } = await supabase
          .from('shopify_connections')
          .select('project_id')
          .eq('id', connectionId)
          .single();

        if (connError || !connection?.project_id) {
          throw APIError.notFound('Shopify connection not found or no project linked');
        }
        resolvedProjectId = connection.project_id;
      }

      // 3. Query local theme_files with status 'pending'
      let query = supabase
        .from('theme_files')
        .select('*')
        .eq('connection_id', connectionId)
        .eq('sync_status', 'pending');

      if (filePaths && filePaths.length > 0) {
        query = query.in('file_path', filePaths);
      }

      const { data: pendingFiles, error: filesError } = await query;

      if (filesError) {
        throw new APIError(
          `Failed to query pending files: ${filesError.message}`,
          'QUERY_ERROR',
          500
        );
      }

      if (!pendingFiles || pendingFiles.length === 0) {
        return result;
      }

      // 4. Push files concurrently using a worker pool (5 parallel)
      let pushIndex = 0;
      const pushWorker = async () => {
        while (pushIndex < pendingFiles.length) {
          const idx = pushIndex++;
          const themeFile = pendingFiles[idx];
          try {
            // Get file content from files table
            const { data: file } = await supabase
              .from('files')
              .select('id, content, storage_path')
              .eq('project_id', resolvedProjectId)
              .eq('path', themeFile.file_path)
              .maybeSingle();

            if (!file) {
              result.errors.push(
                `${themeFile.file_path}: File not found in project`
              );
              continue;
            }

            const isBinary = !this.shouldFetchAssetValue(themeFile.file_path);

            if (isBinary && file.storage_path) {
              // Binary file: download from storage as Buffer, push as base64 attachment
              const buffer = await downloadBinaryFromStorage(file.storage_path);
              const base64 = buffer.toString('base64');
              await api.putAsset(themeId, themeFile.file_path, undefined, base64);

              const now = new Date().toISOString();
              const contentHash = this.computeHash(buffer);
              await supabase
                .from('theme_files')
                .update({
                  sync_status: 'synced',
                  content_hash: contentHash,
                  local_updated_at: now,
                  remote_updated_at: now,
                  updated_at: now,
                })
                .eq('id', themeFile.id);

              result.pushed++;
            } else {
              // Text file: get content from DB or text storage, push as value
              let content = file.content;
              if (!content && file.storage_path) {
                content = await downloadFromStorage(file.storage_path);
              }

              if (!content) {
                result.errors.push(
                  `${themeFile.file_path}: File content is empty`
                );
                continue;
              }

              await api.putAsset(themeId, themeFile.file_path, content);

              const now = new Date().toISOString();
              const contentHash = this.computeHash(content);
              await supabase
                .from('theme_files')
                .update({
                  sync_status: 'synced',
                  content_hash: contentHash,
                  local_updated_at: now,
                  remote_updated_at: now,
                  updated_at: now,
                })
                .eq('id', themeFile.id);

              result.pushed++;
            }
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : 'Unknown error';
            result.errors.push(`${themeFile.file_path}: ${errorMessage}`);

            // Mark as error status
            await supabase
              .from('theme_files')
              .update({
                sync_status: 'error',
                updated_at: new Date().toISOString(),
              })
              .eq('id', themeFile.id);
          }
        }
      };

      await Promise.all(
        Array.from({ length: Math.min(PUSH_CONCURRENCY, pendingFiles.length) }, () => pushWorker())
      );

      // Bulk invalidation: clear metadata + all per-file content caches
      if (result.pushed > 0) {
        const { data: projFiles } = await supabase
          .from('files')
          .select('id')
          .eq('project_id', resolvedProjectId);
        const fileIds = (projFiles ?? []).map((f: { id: string }) => f.id);
        await invalidateAllProjectCaches(resolvedProjectId, fileIds).catch(() => {});
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Push failed: ${errorMessage}`);
    }

    return result;
  }

  /**
   * Remove assets from a Shopify theme that don't belong to the imported file set.
   * Used after pushing imported files to a dev theme to clean up leftover files
   * (e.g. Dawn scaffold files when the dev theme was created from a ZIP fallback).
   *
   * @param connectionId - The Shopify connection ID.
   * @param themeId - The dev theme ID to clean up.
   * @param importedPaths - Set of file paths that were imported (should remain on the theme).
   * @returns Number of assets deleted.
   */
  async cleanupExtraAssets(
    connectionId: string,
    themeId: number,
    importedPaths: Set<string>
  ): Promise<{ deleted: number; errors: string[] }> {
    const deleted: string[] = [];
    const errors: string[] = [];

    try {
      const api = await ShopifyAdminAPIFactory.create(connectionId);
      const remoteAssets = await api.listAssets(themeId);

      for (const asset of remoteAssets) {
        if (!importedPaths.has(asset.key)) {
          try {
            await api.deleteAsset(themeId, asset.key);
            deleted.push(asset.key);
          } catch (err) {
            // Some assets (like layout/theme.liquid) may be protected; skip them
            const msg = err instanceof Error ? err.message : 'Unknown error';
            errors.push(`${asset.key}: ${msg}`);
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      errors.push(`Cleanup failed: ${msg}`);
    }

    return { deleted: deleted.length, errors };
  }

  /**
   * Sync a single file from Shopify to local.
   * @param connectionId - The Shopify connection ID.
   * @param themeId - The Shopify theme ID to sync from.
   * @param filePath - The theme file path to sync.
   * @param projectId - The project to sync the file into (explicit, not derived from connection).
   */
  async syncFile(
    connectionId: string,
    themeId: number,
    filePath: string,
    projectId?: string
  ): Promise<ThemeFileSyncStatus> {
    try {
      const api = await ShopifyAdminAPIFactory.create(connectionId);

      // Resolve project_id
      const supabase = await this.adminSupabase();

      let resolvedProjectId: string;
      if (projectId) {
        resolvedProjectId = projectId;
      } else {
        const { data: connection, error: connError } = await supabase
          .from('shopify_connections')
          .select('project_id')
          .eq('id', connectionId)
          .single();

        if (connError || !connection?.project_id) {
          throw APIError.notFound('Shopify connection not found or no project linked');
        }
        resolvedProjectId = connection.project_id;
      }

      // Get project
      const { data: project, error: projError } = await supabase
        .from('projects')
        .select('owner_id')
        .eq('id', resolvedProjectId)
        .single();

      if (projError || !project) {
        throw APIError.notFound('Project not found');
      }

      // Fetch asset from Shopify
      const asset = await api.getAsset(themeId, filePath);

      if (!asset.value) {
        throw new APIError(
          'Asset is not a text file',
          'INVALID_ASSET_TYPE',
          400
        );
      }

      const content = asset.value;
      const contentHash = this.computeHash(content);
      const now = new Date().toISOString();

      // Check existing theme_file
      const { data: existingThemeFile } = await supabase
        .from('theme_files')
        .select('*')
        .eq('connection_id', connectionId)
        .eq('file_path', filePath)
        .maybeSingle();

      // Check for conflicts
      if (
        existingThemeFile &&
        existingThemeFile.local_updated_at &&
        existingThemeFile.remote_updated_at &&
        new Date(existingThemeFile.local_updated_at) >
          new Date(existingThemeFile.remote_updated_at) &&
        existingThemeFile.content_hash !== contentHash
      ) {
        await supabase
          .from('theme_files')
          .update({
            content_hash: contentHash,
            remote_updated_at: asset.updated_at,
            sync_status: 'conflict',
            updated_at: now,
          })
          .eq('id', existingThemeFile.id);
        return 'conflict';
      }

      // Update theme_file record
      const themeFileData = {
        connection_id: connectionId,
        file_path: filePath,
        content_hash: contentHash,
        remote_updated_at: asset.updated_at,
        sync_status: 'synced' as ThemeFileSyncStatus,
        updated_at: now,
      };

      if (existingThemeFile) {
        await supabase
          .from('theme_files')
          .update(themeFileData)
          .eq('id', existingThemeFile.id);
      } else {
        await supabase.from('theme_files').insert(themeFileData);
      }

      // Update or create file in files table
      const fileName = filePath.split('/').pop() || filePath;
      const fileType = detectFileTypeFromName(fileName);

      const { data: existingFile } = await supabase
        .from('files')
        .select('id')
        .eq('project_id', resolvedProjectId)
        .eq('path', filePath)
        .maybeSingle();

      if (existingFile) {
        await updateFile(existingFile.id, {
          content,
          path: filePath,
        });
      } else {
        await createFile({
          project_id: resolvedProjectId,
          name: fileName,
          path: filePath,
          file_type: fileType,
          content,
          created_by: project.owner_id,
        });
      }

      return 'synced';
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new APIError(
        `Failed to sync file: ${errorMessage}`,
        'SYNC_ERROR',
        500
      );
    }
  }

  /**
   * Get sync status for all theme files for a connection.
   */
  async getFileSyncStatus(connectionId: string): Promise<ThemeFile[]> {
    const supabase = await this.adminSupabase();

    const { data, error } = await supabase
      .from('theme_files')
      .select('*')
      .eq('connection_id', connectionId)
      .order('file_path', { ascending: true });

    if (error) {
      throw new APIError(
        `Failed to get sync status: ${error.message}`,
        'QUERY_ERROR',
        500
      );
    }

    return (data || []) as ThemeFile[];
  }

  /**
   * Compute SHA-256 hash of content.
   */
  private computeHash(content: string | Buffer): string {
    if (typeof content === 'string') {
      return createHash('sha256').update(content, 'utf8').digest('hex');
    }
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Shopify theme asset list often includes binary assets without inline value.
   * Only fetch per-asset value for text-like files to avoid long imports.
   */
  /**
   * Download binary assets that were deferred during a textOnly pull.
   * Queries theme_files for binary_pending rows, re-fetches asset metadata
   * from Shopify, downloads from CDN, uploads to storage, creates files rows,
   * and updates theme_files status to synced.
   */
  async pullBinaryAssets(
    connectionId: string,
    themeId: number,
    projectId: string
  ): Promise<{ synced: number; total: number; errors: string[] }> {
    const errors: string[] = [];
    let synced = 0;

    const supabase = await this.adminSupabase();

    // 1. Find binary_pending rows for this connection
    const { data: pendingRows, error: pendingErr } = await supabase
      .from('theme_files')
      .select('id, file_path')
      .eq('connection_id', connectionId)
      .eq('sync_status', 'binary_pending');

    if (pendingErr || !pendingRows || pendingRows.length === 0) {
      return { synced: 0, total: 0, errors: pendingErr ? [pendingErr.message] : [] };
    }

    const pendingByPath = new Map(pendingRows.map((r) => [r.file_path, r.id]));
    const total = pendingRows.length;

    // 2. Re-fetch asset metadata from Shopify to get public_url
    const api = await ShopifyAdminAPIFactory.create(connectionId);
    const remoteAssets = await api.listAssets(themeId);
    const binaryAssets = remoteAssets.filter(
      (a) => !this.shouldFetchAssetValue(a.key) && pendingByPath.has(a.key)
    );

    // 3. Get project owner for created_by
    const { data: project } = await supabase
      .from('projects')
      .select('owner_id')
      .eq('id', projectId)
      .single();

    if (!project) {
      return { synced: 0, total, errors: ['Project not found'] };
    }

    // 4. Download, upload, insert — 20 concurrent workers
    const BINARY_CONCURRENCY = 20;
    const BATCH_SIZE = 50;
    const fileBuffer: Array<Record<string, unknown>> = [];
    const themeUpdates: Array<{ id: string; hash: string; updatedAt: string }> = [];

    const flushBuffer = async () => {
      if (fileBuffer.length === 0) return;
      const fileBatch = fileBuffer.splice(0, fileBuffer.length);
      for (let i = 0; i < fileBatch.length; i += BATCH_SIZE) {
        const batch = fileBatch.slice(i, i + BATCH_SIZE);
        const { error: batchErr } = await supabase.from('files').insert(batch);
        if (batchErr) {
          for (const row of batch) {
            const { error: rowErr } = await supabase.from('files').insert(row);
            if (rowErr) errors.push(`${row.path}: ${rowErr.message}`);
            else synced++;
          }
        } else {
          synced += batch.length;
        }
      }

      // Update theme_files status to synced
      const updates = themeUpdates.splice(0, themeUpdates.length);
      for (const u of updates) {
        await supabase
          .from('theme_files')
          .update({
            sync_status: 'synced',
            content_hash: u.hash,
            updated_at: u.updatedAt,
          })
          .eq('id', u.id);
      }
    };

    let cursor = 0;
    const workerCount = Math.min(BINARY_CONCURRENCY, binaryAssets.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (cursor < binaryAssets.length) {
        const idx = cursor++;
        const asset = binaryAssets[idx];
        const themeFileId = pendingByPath.get(asset.key);
        if (!themeFileId) continue;

        try {
          let buffer: Buffer;
          if (asset.public_url) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 30_000);
            try {
              const resp = await fetch(asset.public_url, { signal: controller.signal });
              clearTimeout(timeout);
              if (!resp.ok) throw new Error(`CDN fetch failed: ${resp.status}`);
              buffer = Buffer.from(await resp.arrayBuffer());
            } catch (fetchErr) {
              clearTimeout(timeout);
              throw fetchErr;
            }
          } else {
            const detailed = await api.getAsset(themeId, asset.key);
            if (!detailed.attachment) return;
            buffer = Buffer.from(detailed.attachment, 'base64');
          }

          const storagePath = await uploadBinaryToStorage(
            projectId,
            asset.key,
            buffer,
            asset.content_type
          );

          const hash = this.computeHash(buffer);
          const fileName = asset.key.split('/').pop() || asset.key;
          const now = new Date().toISOString();

          fileBuffer.push({
            project_id: projectId,
            name: fileName,
            path: asset.key,
            file_type: 'other',
            size_bytes: buffer.length,
            content: null,
            storage_path: storagePath,
            created_by: project.owner_id,
          });

          themeUpdates.push({ id: themeFileId, hash, updatedAt: now });

          if (fileBuffer.length >= BATCH_SIZE) {
            await flushBuffer();
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Unknown error';
          errors.push(`${asset.key}: ${msg}`);
        }
      }
    });

    await Promise.all(workers);
    await flushBuffer();

    return { synced, total, errors };
  }

  /**
   * Internal helper: process a list of binary assets — download, upload, insert.
   * Used by the non-textOnly pullTheme path for backwards compatibility.
   */
  private async processBinaryAssetsFromList(
    binaryAssets: ShopifyAsset[],
    api: ShopifyAdminAPI,
    themeId: number,
    projectId: string,
    connectionId: string,
    ownerId: string,
    batchSize: number,
    supabase: Awaited<ReturnType<typeof this.adminSupabase>>,
    batchInsertFiles: (
      rows: Array<Record<string, unknown>>,
      themeRows: Array<Record<string, unknown>>
    ) => Promise<void>,
    result: SyncResult
  ): Promise<void> {
    const BINARY_CONCURRENCY = 20;
    const binaryFileBuffer: Array<Record<string, unknown>> = [];
    const binaryThemeBuffer: Array<Record<string, unknown>> = [];

    const flushBinaryBuffer = async () => {
      if (binaryFileBuffer.length === 0) return;
      const fileBatch = binaryFileBuffer.splice(0, binaryFileBuffer.length);
      const themeBatch = binaryThemeBuffer.splice(0, binaryThemeBuffer.length);
      await batchInsertFiles(fileBatch, themeBatch);
    };

    let binaryCursor = 0;
    const binaryWorkerCount = Math.min(BINARY_CONCURRENCY, binaryAssets.length);
    const binaryWorkers = Array.from({ length: binaryWorkerCount }, async () => {
      while (binaryCursor < binaryAssets.length) {
        const idx = binaryCursor++;
        const asset = binaryAssets[idx];
        try {
          let buffer: Buffer;
          if (asset.public_url) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 30_000);
            try {
              const resp = await fetch(asset.public_url, { signal: controller.signal });
              clearTimeout(timeout);
              if (!resp.ok) throw new Error(`CDN fetch failed: ${resp.status}`);
              buffer = Buffer.from(await resp.arrayBuffer());
            } catch (fetchErr) {
              clearTimeout(timeout);
              throw fetchErr;
            }
          } else {
            const detailed = await api.getAsset(themeId, asset.key);
            if (!detailed.attachment) continue;
            buffer = Buffer.from(detailed.attachment, 'base64');
          }

          const storagePath = await uploadBinaryToStorage(
            projectId,
            asset.key,
            buffer,
            asset.content_type
          );

          const hash = this.computeHash(buffer);
          const fileName = asset.key.split('/').pop() || asset.key;

          binaryFileBuffer.push({
            project_id: projectId,
            name: fileName,
            path: asset.key,
            file_type: 'other',
            size_bytes: buffer.length,
            content: null,
            storage_path: storagePath,
            created_by: ownerId,
          });
          binaryThemeBuffer.push({
            connection_id: connectionId,
            file_path: asset.key,
            content_hash: hash,
            remote_updated_at: asset.updated_at,
            sync_status: 'synced',
          });

          if (binaryFileBuffer.length >= batchSize) {
            await flushBinaryBuffer();
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Unknown error';
          result.errors.push(`${asset.key}: ${msg}`);
        }
      }
    });

    await Promise.all(binaryWorkers);
    await flushBinaryBuffer();
  }

  private shouldFetchAssetValue(filePath: string): boolean {
    const lower = filePath.toLowerCase();
    const textExtensions = [
      '.liquid',
      '.json',
      '.js',
      '.css',
      '.scss',
      '.sass',
      '.less',
      '.ts',
      '.tsx',
      '.mjs',
      '.cjs',
      '.txt',
      '.md',
      '.svg',
      '.map',
    ];
    return textExtensions.some((ext) => lower.endsWith(ext));
  }

  private async createProjectFile(
    input: Parameters<typeof createFile>[0]
  ): Promise<{ id: string; usedPathAsNameFallback: boolean }> {
    try {
      const created = await createFile(input);
      return { id: created.id, usedPathAsNameFallback: false };
    } catch (error) {
      const isDuplicateNameConflict =
        error instanceof APIError &&
        error.code === 'CONFLICT' &&
        /already exists/i.test(error.message);

      if (!isDuplicateNameConflict || input.name === input.path) {
        throw error;
      }

      const created = await createFile({
        ...input,
        name: input.path,
      });
      return { id: created.id, usedPathAsNameFallback: true };
    }
  }

  /**
   * Fetch missing text-like asset values with bounded concurrency so imports
   * don't block for several minutes on fully sequential API calls.
   */
  private async prefetchMissingAssetValues(
    api: ShopifyAdminAPI,
    themeId: number,
    remoteAssets: ShopifyAsset[],
    result: SyncResult,
    concurrency = 10
  ): Promise<Map<string, string>> {
    const values = new Map<string, string>();
    const candidates = remoteAssets.filter(
      (asset) => !asset.value && this.shouldFetchAssetValue(asset.key)
    );

    if (candidates.length === 0) return values;

    let cursor = 0;
    const workerCount = Math.min(concurrency, candidates.length);
    const workers = Array.from({ length: workerCount }, async () => {
      while (cursor < candidates.length) {
        const index = cursor++;
        const asset = candidates[index];
        try {
          const detailed = await api.getAsset(themeId, asset.key);
          if (detailed.value) {
            values.set(asset.key, detailed.value);
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          result.errors.push(`${asset.key}: ${errorMessage}`);
        }
      }
    });

    await Promise.all(workers);
    return values;
  }
}



