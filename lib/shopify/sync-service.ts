import { createClient } from '@/lib/supabase/server';
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
      const supabase = await createClient();
      const { data: connection, error: connError } = await supabase
        .from('shopify_connections')
        .select('project_id')
        .eq('id', connectionId)
        .single();

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

      // 4. For each asset: fetch content, compute hash
      for (const asset of remoteAssets) {
        try {
          // Skip binary assets (images, etc.) - only sync text files
          if (!asset.value) {
            continue;
          }

          const content = asset.value;
          const contentHash = this.computeHash(content);
          const filePath = asset.key;

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
      const supabase = await createClient();
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
      const supabase = await createClient();
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
    const supabase = await createClient();

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
}
