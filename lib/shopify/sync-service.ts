import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { ShopifyAdminAPIFactory } from './admin-api-factory';
import type { ShopifyAsset } from './admin-api';
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
   */
  async pullTheme(connectionId: string, themeId: number): Promise<SyncResult> {
    const result: SyncResult = {
      pulled: 0,
      pushed: 0,
      conflicts: [],
      errors: [],
    };

    try {
      // 1. Get API client via factory
      const api = await ShopifyAdminAPIFactory.create(connectionId);

      // 2. Get connection to access project_id
      const supabase = await this.adminSupabase();
      const { data: connection, error: connError } = await supabase
        .from('shopify_connections')
        .select('project_id')
        .eq('id', connectionId)
        .single();

      // #region agent log H1
      fetch('http://127.0.0.1:7242/ingest/94ec7461-fb53-4d66-8f0b-fb3af4497904',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'import-theme-debug-run1',hypothesisId:'H1',location:'lib/shopify/sync-service.ts:43',message:'pullTheme connection lookup result',data:{connectionId,hasConnection:!!connection,connErrorCode:connError?.code??null,connErrorMessage:connError?.message??null,hasServiceRoleKey:!!process.env.SUPABASE_SERVICE_ROLE_KEY},timestamp:Date.now()})}).catch(()=>{});
      // #endregion

      if (connError || !connection) {
        throw APIError.notFound('Shopify connection not found');
      }

      // Get project to access owner_id for created_by
      const { data: project, error: projError } = await supabase
        .from('projects')
        .select('owner_id')
        .eq('id', connection.project_id)
        .single();

      if (projError || !project) {
        throw APIError.notFound('Project not found');
      }

      // 3. List all remote assets
      const remoteAssets = await api.listAssets(themeId);
      let missingValueCount = 0;
      let changedCandidateCount = 0;
      let detailFetchAttempts = 0;
      let detailFetchValueCount = 0;
      let detailFetchErrorCount = 0;
      let skippedNonTextCount = 0;
      // #region agent log H10
      fetch('http://127.0.0.1:7242/ingest/94ec7461-fb53-4d66-8f0b-fb3af4497904',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'import-theme-debug-run3',hypothesisId:'H10',location:'lib/shopify/sync-service.ts:74',message:'pullTheme remote assets listed',data:{connectionId,themeId,remoteAssetsCount:remoteAssets.length,sampleKey:remoteAssets[0]?.key??null,sampleHasValue:!!remoteAssets[0]?.value},timestamp:Date.now()})}).catch(()=>{});
      // #endregion

      // 4. For each asset: fetch content, compute hash
      for (const asset of remoteAssets) {
        try {
          const filePath = asset.key;
          let content = asset.value;
          if (!content) {
            if (!this.shouldFetchAssetValue(filePath)) {
              skippedNonTextCount++;
              continue;
            }
            detailFetchAttempts++;
            const shouldSampleDetailFetch = detailFetchAttempts <= 5;
            const detailFetchStartedAt = Date.now();
            if (shouldSampleDetailFetch) {
              // #region agent log H12
              fetch('http://127.0.0.1:7242/ingest/94ec7461-fb53-4d66-8f0b-fb3af4497904',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'import-theme-debug-run4',hypothesisId:'H12',location:'lib/shopify/sync-service.ts:89',message:'detail asset fetch start',data:{connectionId,themeId,filePath,attempt:detailFetchAttempts},timestamp:Date.now()})}).catch(()=>{});
              // #endregion
            }
            try {
              const detailedAsset = await api.getAsset(themeId, filePath);
              content = detailedAsset.value;
              if (content) {
                detailFetchValueCount++;
              }
              if (shouldSampleDetailFetch) {
                // #region agent log H12
                fetch('http://127.0.0.1:7242/ingest/94ec7461-fb53-4d66-8f0b-fb3af4497904',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'import-theme-debug-run4',hypothesisId:'H12',location:'lib/shopify/sync-service.ts:101',message:'detail asset fetch success',data:{connectionId,themeId,filePath,attempt:detailFetchAttempts,hasValue:!!content,durationMs:Date.now()-detailFetchStartedAt},timestamp:Date.now()})}).catch(()=>{});
                // #endregion
              }
            } catch (detailError) {
              detailFetchErrorCount++;
              const detailErrorMessage =
                detailError instanceof Error ? detailError.message : 'Unknown error';
              if (shouldSampleDetailFetch) {
                // #region agent log H12
                fetch('http://127.0.0.1:7242/ingest/94ec7461-fb53-4d66-8f0b-fb3af4497904',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'import-theme-debug-run4',hypothesisId:'H12',location:'lib/shopify/sync-service.ts:110',message:'detail asset fetch failed',data:{connectionId,themeId,filePath,attempt:detailFetchAttempts,durationMs:Date.now()-detailFetchStartedAt,errorMessage:detailErrorMessage},timestamp:Date.now()})}).catch(()=>{});
                // #endregion
              }
              result.errors.push(`${filePath}: ${detailErrorMessage}`);
              continue;
            }
          }

          // Skip binary assets (images, etc.) - only sync text files
          if (!content) {
            missingValueCount++;
            continue;
          }
          changedCandidateCount++;

          const contentHash = this.computeHash(content);

          // 5. Compare with local theme_files records
          const { data: existingThemeFile } = await supabase
            .from('theme_files')
            .select('*')
            .eq('connection_id', connectionId)
            .eq('file_path', filePath)
            .maybeSingle();

          const now = new Date().toISOString();
          const remoteUpdatedAt = asset.updated_at;

          // Check if file has changed
          const hasChanged =
            !existingThemeFile ||
            existingThemeFile.content_hash !== contentHash;

          // Check for conflicts (local was modified after last remote update)
          if (
            existingThemeFile &&
            existingThemeFile.local_updated_at &&
            existingThemeFile.remote_updated_at &&
            new Date(existingThemeFile.local_updated_at) >
              new Date(existingThemeFile.remote_updated_at) &&
            existingThemeFile.content_hash !== contentHash
          ) {
            result.conflicts.push(filePath);
            // Update theme_file record with conflict status
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

          // 6. If new or changed: upsert theme_file record, update local file
          if (hasChanged) {
            // Upsert theme_file record
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
            } else {
              await supabase.from('theme_files').insert(themeFileData);
            }

            // Update or create file in files table
            const fileName = filePath.split('/').pop() || filePath;
            const fileType = detectFileTypeFromName(fileName);

            // Check if file exists in files table by path
            const { data: existingFile } = await supabase
              .from('files')
              .select('id')
              .eq('project_id', connection.project_id)
              .eq('path', filePath)
              .maybeSingle();

            if (existingFile) {
              await updateFile(existingFile.id, {
                content,
                path: filePath,
              });
            } else {
              await createFile({
                project_id: connection.project_id,
                name: fileName,
                path: filePath,
                file_type: fileType,
                content,
                created_by: project.owner_id,
              });
            }

            result.pulled++;
          } else if (existingThemeFile) {
            // File hasn't changed, but update remote_updated_at if needed
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
      // #region agent log H10
      fetch('http://127.0.0.1:7242/ingest/94ec7461-fb53-4d66-8f0b-fb3af4497904',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'import-theme-debug-run3',hypothesisId:'H10',location:'lib/shopify/sync-service.ts:194',message:'pullTheme loop summary',data:{connectionId,themeId,remoteAssetsCount:remoteAssets.length,skippedNonTextCount,detailFetchAttempts,detailFetchValueCount,detailFetchErrorCount,missingValueCount,changedCandidateCount,pulled:result.pulled,errorsCount:result.errors.length,conflictsCount:result.conflicts.length},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      // #region agent log H1
      fetch('http://127.0.0.1:7242/ingest/94ec7461-fb53-4d66-8f0b-fb3af4497904',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({runId:'import-theme-debug-run1',hypothesisId:'H1',location:'lib/shopify/sync-service.ts:186',message:'pullTheme top-level failure',data:{connectionId,themeId,errorMessage},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      result.errors.push(`Pull failed: ${errorMessage}`);
    }

    return result;
  }

  /**
   * Push local theme files to Shopify.
   * Pushes files with status 'pending' to Shopify via putAsset.
   */
  async pushTheme(
    connectionId: string,
    themeId: number,
    filePaths?: string[]
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

      // 2. Get connection to access project_id
      const supabase = await this.adminSupabase();
      const { data: connection, error: connError } = await supabase
        .from('shopify_connections')
        .select('project_id')
        .eq('id', connectionId)
        .single();

      if (connError || !connection) {
        throw APIError.notFound('Shopify connection not found');
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
            .eq('project_id', connection.project_id)
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
   */
  async syncFile(
    connectionId: string,
    themeId: number,
    filePath: string
  ): Promise<ThemeFileSyncStatus> {
    try {
      const api = await ShopifyAdminAPIFactory.create(connectionId);

      // Get connection
      const supabase = await this.adminSupabase();
      const { data: connection, error: connError } = await supabase
        .from('shopify_connections')
        .select('project_id')
        .eq('id', connectionId)
        .single();

      if (connError || !connection) {
        throw APIError.notFound('Shopify connection not found');
      }

      // Get project
      const { data: project, error: projError } = await supabase
        .from('projects')
        .select('owner_id')
        .eq('id', connection.project_id)
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
        .eq('project_id', connection.project_id)
        .eq('path', filePath)
        .maybeSingle();

      if (existingFile) {
        await updateFile(existingFile.id, {
          content,
          path: filePath,
        });
      } else {
        await createFile({
          project_id: connection.project_id,
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
}
