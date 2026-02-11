import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { ShopifyAdminAPIFactory } from './admin-api-factory';
import type { ShopifyAsset, ShopifyAdminAPI } from './admin-api';
import type { ThemeFile, ThemeFileSyncStatus } from '@/lib/types/shopify';
import { createHash } from 'crypto';
import { APIError } from '@/lib/errors/handler';
import { createFile, updateFile } from '@/lib/services/files';
import { detectFileTypeFromName } from '@/lib/types/files';
import { downloadFromStorage } from '@/lib/storage/files';

export interface SyncResult {
  pulled: number;
  pushed: number;
  conflicts: string[];
  errors: string[];
}

export class ThemeSyncService {
  private readonly PREFETCH_CONCURRENCY = 25;
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
  async pullTheme(connectionId: string, themeId: number, projectId?: string): Promise<SyncResult> {
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

      // 3. List all remote assets
      const remoteAssets = await api.listAssets(themeId);
      const prefetchedAssetValues = await this.prefetchMissingAssetValues(
        api,
        themeId,
        remoteAssets,
        result,
        this.PREFETCH_CONCURRENCY
      );
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
      const existingThemeFileByPath = new Map(
        (existingThemeFiles ?? []).map((row) => [row.file_path, row])
      );

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
      const existingFileIdByPath = new Map(
        (existingProjectFiles ?? []).map((row) => [row.path, row.id])
      );

      let assetCursor = 0;
      const workerCount = Math.min(this.PROCESS_CONCURRENCY, remoteAssets.length);

      const workers = Array.from({ length: workerCount }, async () => {
        while (assetCursor < remoteAssets.length) {
          const index = assetCursor++;
          const asset = remoteAssets[index];
          try {
            const filePath = asset.key;
            let content = asset.value;
            if (!content && prefetchedAssetValues.has(filePath)) {
              content = prefetchedAssetValues.get(filePath);
            }
            if (!content) {
              if (!this.shouldFetchAssetValue(filePath)) {
                continue;
              }
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

            if (!content) {
              continue;
            }

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
      await Promise.all(workers);
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

      // 4. For each: push content to Shopify via putAsset
      for (const themeFile of pendingFiles) {
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

          // Get content (from DB or storage)
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

          // Push to Shopify
          await api.putAsset(themeId, themeFile.file_path, content);

          // 5. Update theme_file status to 'synced'
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
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Push failed: ${errorMessage}`);
    }

    return result;
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
  private computeHash(content: string): string {
    return createHash('sha256').update(content, 'utf8').digest('hex');
  }

  /**
   * Shopify theme asset list often includes binary assets without inline value.
   * Only fetch per-asset value for text-like files to avoid long imports.
   */
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
