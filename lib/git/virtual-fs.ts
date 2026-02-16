import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { downloadFromStorage, uploadToStorage, shouldUseStorage } from '@/lib/storage/files';

/**
 * Virtual filesystem adapter for isomorphic-git that reads/writes to Supabase
 * instead of the real filesystem. This allows running Git operations (commit,
 * branch, diff, etc.) against project files stored in Supabase.
 *
 * Path mapping:
 * - /workdir/sections/header.liquid -> files table row with path = 'sections/header.liquid'
 * - /.git/* -> stored in-memory Map<string, Uint8Array> for Git internal data
 */
export class SupabaseVirtualFS {
  private supabase: SupabaseClient;
  private projectId: string;
  private gitData: Map<string, Uint8Array> = new Map();
  private createdBy: string | null = null;

  constructor(
    projectId: string,
    supabaseUrl: string,
    supabaseKey: string,
    createdBy?: string
  ) {
    this.projectId = projectId;
    this.createdBy = createdBy || null;
    this.supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });
  }

  /**
   * Implements the isomorphic-git FS interface.
   */
  readonly promises = {
    readFile: this.readFile.bind(this),
    writeFile: this.writeFile.bind(this),
    unlink: this.unlink.bind(this),
    readdir: this.readdir.bind(this),
    mkdir: this.mkdir.bind(this),
    rmdir: this.rmdir.bind(this),
    stat: this.stat.bind(this),
    lstat: this.lstat.bind(this),
    readlink: this.readlink.bind(this),
    symlink: this.symlink.bind(this),
    chmod: this.chmod.bind(this),
  };

  /**
   * Read a file from the virtual filesystem.
   * For /workdir/* paths, fetches from files table.
   * For /.git/* paths, reads from in-memory map.
   */
  private async readFile(
    filePath: string,
    options?: { encoding?: BufferEncoding }
  ): Promise<Uint8Array | string> {
    const normalizedPath = this.normalizePath(filePath);

    // Handle .git directory (in-memory)
    if (normalizedPath.startsWith('/.git/')) {
      const data = this.gitData.get(normalizedPath);
      if (data === undefined) {
        throw new Error(`ENOENT: no such file, readFile '${filePath}'`);
      }
      if (options?.encoding) {
        return new TextDecoder().decode(data);
      }
      return data;
    }

    // Handle workdir files (Supabase)
    if (normalizedPath.startsWith('/workdir/')) {
      const relativePath = normalizedPath.slice('/workdir/'.length);
      const file = await this.getFileByPath(relativePath);

      if (!file) {
        throw new Error(`ENOENT: no such file, readFile '${filePath}'`);
      }

      let content: string;
      if (file.storage_path && !file.content) {
        content = await downloadFromStorage(file.storage_path);
      } else {
        content = file.content || '';
      }

      if (options?.encoding) {
        return content;
      }
      return new TextEncoder().encode(content);
    }

    throw new Error(`ENOENT: no such file, readFile '${filePath}'`);
  }

  /**
   * Write a file to the virtual filesystem.
   * For /workdir/* paths, updates files table.
   * For /.git/* paths, writes to in-memory map.
   */
  private async writeFile(
    filePath: string,
    data: Uint8Array | string,
    options?: { encoding?: BufferEncoding }
  ): Promise<void> {
    const normalizedPath = this.normalizePath(filePath);
    const content = typeof data === 'string' ? data : new TextDecoder().decode(data);

    // Handle .git directory (in-memory)
    if (normalizedPath.startsWith('/.git/')) {
      const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
      this.gitData.set(normalizedPath, bytes);
      return;
    }

    // Handle workdir files (Supabase)
    if (normalizedPath.startsWith('/workdir/')) {
      const relativePath = normalizedPath.slice('/workdir/'.length);
      const sizeBytes = new TextEncoder().encode(content).length;
      const useStorage = shouldUseStorage(sizeBytes);

      // Check if file exists
      const existingFile = await this.getFileByPath(relativePath);

      if (existingFile) {
        // Update existing file
        const updates: Record<string, unknown> = {
          size_bytes: sizeBytes,
        };

        // Handle storage migration if needed
        if (existingFile.storage_path && !useStorage) {
          // Moving from storage to inline
          await this.supabase.storage
            .from('project-files')
            .remove([existingFile.storage_path]);
          updates.content = content;
          updates.storage_path = null;
        } else if (!existingFile.storage_path && useStorage) {
          // Moving from inline to storage
          const storagePath = await uploadToStorage(this.projectId, relativePath, content);
          updates.content = null;
          updates.storage_path = storagePath;
        } else if (useStorage) {
          // Already in storage, update it
          await uploadToStorage(this.projectId, relativePath, content);
          // storage_path stays the same
        } else {
          // Already inline, update content
          updates.content = content;
        }

        const { error } = await this.supabase
          .from('files')
          .update(updates)
          .eq('id', existingFile.id);

        if (error) throw error;
      } else {
        // Create new file
        const fileName = relativePath.split('/').pop() || relativePath;
        const fileType = this.detectFileType(relativePath);

        let storagePath: string | null = null;
        let dbContent: string | null = content;

        if (useStorage) {
          storagePath = await uploadToStorage(this.projectId, relativePath, content);
          dbContent = null;
        }

        // Get created_by: use provided value, or fetch project owner as fallback
        let createdBy = this.createdBy;
        if (!createdBy) {
          const { data: project } = await this.supabase
            .from('projects')
            .select('owner_id')
            .eq('id', this.projectId)
            .single();
          if (!project) {
            throw new Error(`Project ${this.projectId} not found`);
          }
          createdBy = project.owner_id;
        }

        const { error } = await this.supabase.from('files').insert({
          project_id: this.projectId,
          name: fileName,
          path: relativePath,
          file_type: fileType,
          size_bytes: sizeBytes,
          content: dbContent,
          storage_path: storagePath,
          created_by: createdBy,
        });

        if (error) throw error;
      }
      return;
    }

    throw new Error(`EACCES: permission denied, writeFile '${filePath}'`);
  }

  /**
   * Delete a file from the virtual filesystem.
   */
  private async unlink(filePath: string): Promise<void> {
    const normalizedPath = this.normalizePath(filePath);

    // Handle .git directory (in-memory)
    if (normalizedPath.startsWith('/.git/')) {
      const deleted = this.gitData.delete(normalizedPath);
      if (!deleted) {
        throw new Error(`ENOENT: no such file, unlink '${filePath}'`);
      }
      return;
    }

    // Handle workdir files (Supabase)
    if (normalizedPath.startsWith('/workdir/')) {
      const relativePath = normalizedPath.slice('/workdir/'.length);
      const file = await this.getFileByPath(relativePath);

      if (!file) {
        throw new Error(`ENOENT: no such file, unlink '${filePath}'`);
      }

      // Delete from storage if applicable
      if (file.storage_path) {
        await this.supabase.storage.from('project-files').remove([file.storage_path]);
      }

      const { error } = await this.supabase.from('files').delete().eq('id', file.id);
      if (error) throw error;
      return;
    }

    throw new Error(`ENOENT: no such file, unlink '${filePath}'`);
  }

  /**
   * List directory contents.
   */
  private async readdir(
    dirPath: string,
    options?: { withFileTypes?: boolean }
  ): Promise<string[] | Array<{ name: string; isFile(): boolean; isDirectory(): boolean }>> {
    const normalizedPath = this.normalizePath(dirPath);

    // Handle .git directory (in-memory)
    if (normalizedPath === '/.git' || normalizedPath.startsWith('/.git/')) {
      const prefix = normalizedPath === '/.git' ? '/.git/' : normalizedPath + '/';
      const entries = new Set<string>();

      for (const key of this.gitData.keys()) {
        if (key.startsWith(prefix)) {
          const relative = key.slice(prefix.length);
          const name = relative.split('/')[0];
          if (name) entries.add(name);
        }
      }

      const names = Array.from(entries);
      if (options?.withFileTypes) {
        return names.map((name) => ({
          name,
          isFile: () => true,
          isDirectory: () => false,
        }));
      }
      return names;
    }

    // Handle workdir (Supabase)
    if (normalizedPath === '/workdir' || normalizedPath.startsWith('/workdir/')) {
      const relativeDir = normalizedPath === '/workdir' ? '' : normalizedPath.slice('/workdir/'.length);
      const files = await this.listFilesInDirectory(relativeDir);

      if (options?.withFileTypes) {
        return files.map((file) => ({
          name: file.name,
          isFile: () => true,
          isDirectory: () => false,
        }));
      }
      return files.map((f) => f.name);
    }

    throw new Error(`ENOENT: no such file or directory, readdir '${dirPath}'`);
  }

  /**
   * Create a directory (no-op for workdir, in-memory for .git).
   */
  private async mkdir(dirPath: string, options?: { recursive?: boolean }): Promise<void> {
    const normalizedPath = this.normalizePath(dirPath);

    // Handle .git directory (in-memory) - directories are implicit
    if (normalizedPath.startsWith('/.git/')) {
      // Directories are created implicitly when files are written
      return;
    }

    // Handle workdir - flat structure, directories are implicit
    if (normalizedPath.startsWith('/workdir/')) {
      // Directories are implicit based on path structure
      return;
    }

    // Root directories
    if (normalizedPath === '/workdir' || normalizedPath === '/.git') {
      return;
    }

    throw new Error(`EACCES: permission denied, mkdir '${dirPath}'`);
  }

  /**
   * Remove a directory (no-op for workdir, in-memory for .git).
   */
  private async rmdir(dirPath: string): Promise<void> {
    const normalizedPath = this.normalizePath(dirPath);

    // Handle .git directory (in-memory)
    if (normalizedPath.startsWith('/.git/')) {
      const prefix = normalizedPath + '/';
      const keysToDelete: string[] = [];
      for (const key of this.gitData.keys()) {
        if (key.startsWith(prefix)) {
          keysToDelete.push(key);
        }
      }
      for (const key of keysToDelete) {
        this.gitData.delete(key);
      }
      return;
    }

    // Handle workdir - directories are implicit, can't remove non-empty dirs
    if (normalizedPath.startsWith('/workdir/')) {
      const relativeDir = normalizedPath.slice('/workdir/'.length);
      const files = await this.listFilesInDirectory(relativeDir);
      if (files.length > 0) {
        throw new Error(`ENOTEMPTY: directory not empty, rmdir '${dirPath}'`);
      }
      return;
    }

    throw new Error(`ENOENT: no such file or directory, rmdir '${dirPath}'`);
  }

  /**
   * Get file/directory stats.
   */
  private async stat(filePath: string): Promise<{
    isFile(): boolean;
    isDirectory(): boolean;
    isSymbolicLink(): boolean;
    size: number;
    mode: number;
  }> {
    return this.lstat(filePath);
  }

  /**
   * Get file/directory stats (same as stat for this implementation).
   */
  private async lstat(filePath: string): Promise<{
    isFile(): boolean;
    isDirectory(): boolean;
    isSymbolicLink(): boolean;
    size: number;
    mode: number;
  }> {
    const normalizedPath = this.normalizePath(filePath);

    // Handle .git directory
    if (normalizedPath.startsWith('/.git/')) {
      const exists = this.gitData.has(normalizedPath);
      if (exists) {
        return {
          isFile: () => true,
          isDirectory: () => false,
          isSymbolicLink: () => false,
          size: this.gitData.get(normalizedPath)!.length,
          mode: 0o644,
        };
      }
      // Check if it's a directory
      const prefix = normalizedPath + '/';
      for (const key of this.gitData.keys()) {
        if (key.startsWith(prefix)) {
          return {
            isFile: () => false,
            isDirectory: () => true,
            isSymbolicLink: () => false,
            size: 0,
            mode: 0o755,
          };
        }
      }
      throw new Error(`ENOENT: no such file or directory, lstat '${filePath}'`);
    }

    // Handle workdir files
    if (normalizedPath.startsWith('/workdir/')) {
      const relativePath = normalizedPath.slice('/workdir/'.length);
      const file = await this.getFileByPath(relativePath);

      if (file) {
        return {
          isFile: () => true,
          isDirectory: () => false,
          isSymbolicLink: () => false,
          size: file.size_bytes,
          mode: 0o644,
        };
      }

      // Check if it's a directory
      const files = await this.listFilesInDirectory(relativePath);
      if (files.length > 0 || relativePath === '') {
        return {
          isFile: () => false,
          isDirectory: () => true,
          isSymbolicLink: () => false,
          size: 0,
          mode: 0o755,
        };
      }

      throw new Error(`ENOENT: no such file or directory, lstat '${filePath}'`);
    }

    // Root directories
    if (normalizedPath === '/workdir' || normalizedPath === '/.git') {
      return {
        isFile: () => false,
        isDirectory: () => true,
        isSymbolicLink: () => false,
        size: 0,
        mode: 0o755,
      };
    }

    throw new Error(`ENOENT: no such file or directory, lstat '${filePath}'`);
  }

  /**
   * Read a symbolic link (not supported in this implementation).
   */
  private async readlink(filePath: string): Promise<string> {
    throw new Error(`EINVAL: invalid argument, readlink '${filePath}'`);
  }

  /**
   * Create a symbolic link (not supported in this implementation).
   */
  private async symlink(target: string, filePath: string): Promise<void> {
    throw new Error(`EOPNOTSUPP: operation not supported, symlink '${target}' -> '${filePath}'`);
  }

  /**
   * Change file mode (no-op in this implementation).
   */
  private async chmod(filePath: string, mode: number): Promise<void> {
    // Mode changes are not persisted, but we don't throw an error
    // to allow Git operations to proceed
  }

  /**
   * Persist the in-memory .git data to Supabase Storage.
   * Note: Requires 'git-state' bucket to exist in Supabase Storage.
   */
  async persistGitState(): Promise<void> {
    const bucket = 'git-state';
    const storagePath = `${this.projectId}/.git/state.json`;

    // Convert Map to a single blob (JSON format)
    const gitState: Record<string, string> = {};
    for (const [path, data] of this.gitData.entries()) {
      // Convert Uint8Array to base64 for JSON storage
      gitState[path] = Buffer.from(data).toString('base64');
    }

    const jsonContent = JSON.stringify(gitState);
    const { error } = await this.supabase.storage
      .from(bucket)
      .upload(storagePath, jsonContent, {
        contentType: 'application/json',
        upsert: true,
      });

    if (error) {
      throw new Error(
        `Failed to persist git state: ${error.message}. ` +
          `Ensure the '${bucket}' bucket exists in Supabase Storage.`
      );
    }
  }

  /**
   * Load .git data from Supabase Storage.
   * If the state file doesn't exist, starts with an empty state.
   */
  async loadGitState(): Promise<void> {
    const bucket = 'git-state';
    const storagePath = `${this.projectId}/.git/state.json`;

    const { data, error } = await this.supabase.storage
      .from(bucket)
      .download(storagePath);

    if (error) {
      // If file doesn't exist, start with empty state (this is expected for new projects)
      const errorMsg = error.message.toLowerCase();
      if (
        errorMsg.includes('not found') ||
        errorMsg.includes('does not exist') ||
        errorMsg.includes('bucket not found')
      ) {
        this.gitData.clear();
        return;
      }
      throw new Error(
        `Failed to load git state: ${error.message}. ` +
          `Ensure the '${bucket}' bucket exists in Supabase Storage.`
      );
    }

    const jsonContent = await data.text();
    const gitState: Record<string, string> = JSON.parse(jsonContent);

    this.gitData.clear();
    for (const [path, base64Data] of Object.entries(gitState)) {
      this.gitData.set(path, Buffer.from(base64Data, 'base64'));
    }
  }

  /**
   * Get all file paths and contents from the files table.
   */
  async getWorkdirFiles(): Promise<Array<{ path: string; content: string }>> {
    const { data: files, error } = await this.supabase
      .from('files')
      .select('path, content, storage_path')
      .eq('project_id', this.projectId);

    if (error) throw error;
    if (!files) return [];

    const results: Array<{ path: string; content: string }> = [];

    for (const file of files) {
      let content: string;
      if (file.storage_path && !file.content) {
        content = await downloadFromStorage(file.storage_path);
      } else {
        content = file.content || '';
      }
      results.push({ path: file.path, content });
    }

    return results;
  }

  /**
   * Normalize a path to use forward slashes and ensure it starts with /.
   */
  private normalizePath(path: string): string {
    let normalized = path.replace(/\\/g, '/');
    if (!normalized.startsWith('/')) {
      normalized = '/' + normalized;
    }
    return normalized;
  }

  /**
   * Get a file record from Supabase by path.
   */
  private async getFileByPath(relativePath: string): Promise<{
    id: string;
    path: string;
    content: string | null;
    storage_path: string | null;
    size_bytes: number;
  } | null> {
    const { data, error } = await this.supabase
      .from('files')
      .select('id, path, content, storage_path, size_bytes')
      .eq('project_id', this.projectId)
      .eq('path', relativePath)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  /**
   * List files in a directory (returns files directly in that directory).
   */
  private async listFilesInDirectory(relativeDir: string): Promise<
    Array<{ name: string; path: string }>
  > {
    const { data: files, error } = await this.supabase
      .from('files')
      .select('name, path')
      .eq('project_id', this.projectId)
      .order('path', { ascending: true });

    if (error) throw error;
    if (!files) return [];

    if (relativeDir === '') {
      // Root directory - return top-level files
      return files
        .filter((f) => !f.path.includes('/'))
        .map((f) => ({ name: f.name, path: f.path }));
    }

    // Files in subdirectory
    const dirPrefix = relativeDir + '/';
    const dirFiles = files
      .filter((f) => f.path.startsWith(dirPrefix) && !f.path.slice(dirPrefix.length).includes('/'))
      .map((f) => ({ name: f.name, path: f.path }));

    return dirFiles;
  }

  /**
   * Detect file type from path extension.
   */
  private detectFileType(path: string): 'liquid' | 'javascript' | 'css' | 'other' {
    const ext = path.split('.').pop()?.toLowerCase();
    if (ext === 'liquid') return 'liquid';
    if (ext === 'js' || ext === 'mjs' || ext === 'cjs') return 'javascript';
    if (ext === 'css' || ext === 'scss' || ext === 'sass') return 'css';
    return 'other';
  }
}
