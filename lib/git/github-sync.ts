/**
 * GitHub remote sync service for Synapse IDE
 * 
 * Handles push/pull operations between the Supabase-backed Git repo and GitHub remote repositories.
 * Uses isomorphic-git with HTTP transport for GitHub API communication.
 */

import { SupabaseVirtualFS } from './virtual-fs';

// ── Types ────────────────────────────────────────────────────────────────

export interface PushOptions {
  projectId: string;
  remoteName?: string;
  branch?: string;
  token: string;
  force?: boolean;
}

export interface PushResult {
  ok: boolean;
  refs?: Record<string, string>;
  errors?: string[];
}

export interface PullOptions {
  projectId: string;
  remoteName?: string;
  branch?: string;
  token: string;
  authorName: string;
  authorEmail: string;
}

export interface PullResult {
  ok: boolean;
  mergeCommit?: string;
  conflicts?: string[];
  fastForward?: boolean;
}

export interface FetchOptions {
  projectId: string;
  remoteName?: string;
  branch?: string;
  token: string;
}

export interface CloneOptions {
  projectId: string;
  url: string;
  branch?: string;
  token?: string;
  depth?: number;
}

// ── Helper Functions ──────────────────────────────────────────────────────

/**
 * Dynamically imports isomorphic-git
 */
async function getGit() {
  try {
    return await import('isomorphic-git');
  } catch (error) {
    throw new Error(
      `Failed to import isomorphic-git: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

/**
 * Dynamically imports isomorphic-git HTTP transport
 */
async function getHttp() {
  try {
    return await import('isomorphic-git/http/node');
  } catch (error) {
    throw new Error(
      `Failed to import isomorphic-git/http/node: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

/**
 * Creates a SupabaseVirtualFS instance for the project
 */
function createFS(projectId: string): SupabaseVirtualFS {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL environment variable is not set');
  }
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is not set');
  }

  return new SupabaseVirtualFS(projectId, supabaseUrl, serviceRoleKey);
}

/**
 * Gets the git root directory (always '.' for our use case)
 */
function getGitDir(): string {
  return '.';
}

/**
 * Syncs working directory files from virtual FS to Supabase files table
 */
async function syncWorkdirToSupabaseWithProjectId(
  fs: SupabaseVirtualFS,
  projectId: string,
): Promise<void> {
  try {
    const files = await fs.getWorkdirFiles();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase environment variables are not set');
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Import storage utilities
    const { shouldUseStorage, uploadToStorage } = await import('@/lib/storage/files');

    // Get project owner for created_by field
    const { data: project } = await supabase
      .from('projects')
      .select('owner_id')
      .eq('id', projectId)
      .single();

    if (!project) {
      throw new Error(`Project ${projectId} not found`);
    }

    // Batch insert/update files
    for (const file of files) {
      const fileName = file.path.split('/').pop() || file.path;
      const fileType = detectFileType(file.path);
      const sizeBytes = new TextEncoder().encode(file.content).length;
      const useStorage = shouldUseStorage(sizeBytes);

      // Check if file exists
      const { data: existingFile } = await supabase
        .from('files')
        .select('id, storage_path')
        .eq('project_id', projectId)
        .eq('path', file.path)
        .maybeSingle();

      if (existingFile) {
        // Update existing file
        const updates: Record<string, unknown> = {
          size_bytes: sizeBytes,
        };

        // Handle storage migration if needed
        if (existingFile.storage_path && !useStorage) {
          // Moving from storage to inline
          await supabase.storage
            .from('project-files')
            .remove([existingFile.storage_path]);
          updates.content = file.content;
          updates.storage_path = null;
        } else if (!existingFile.storage_path && useStorage) {
          // Moving from inline to storage
          const storagePath = await uploadToStorage(projectId, file.path, file.content);
          updates.content = null;
          updates.storage_path = storagePath;
        } else if (useStorage) {
          // Already in storage, update it
          await uploadToStorage(projectId, file.path, file.content);
          // storage_path stays the same
        } else {
          // Already inline, update content
          updates.content = file.content;
        }

        const { error } = await supabase
          .from('files')
          .update(updates)
          .eq('id', existingFile.id);

        if (error) throw error;
      } else {
        // Create new file
        let storagePath: string | null = null;
        let dbContent: string | null = file.content;

        if (useStorage) {
          storagePath = await uploadToStorage(projectId, file.path, file.content);
          dbContent = null;
        }

        const { error } = await supabase.from('files').insert({
          project_id: projectId,
          name: fileName,
          path: file.path,
          file_type: fileType,
          size_bytes: sizeBytes,
          content: dbContent,
          storage_path: storagePath,
          created_by: project.owner_id,
        });

        if (error) throw error;
      }
    }
  } catch (error) {
    throw new Error(
      `Failed to sync working directory to Supabase: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

/**
 * Detect file type from path extension
 */
function detectFileType(path: string): 'liquid' | 'javascript' | 'css' | 'other' {
  const ext = path.split('.').pop()?.toLowerCase();
  if (ext === 'liquid') return 'liquid';
  if (ext === 'js' || ext === 'mjs' || ext === 'cjs') return 'javascript';
  if (ext === 'css' || ext === 'scss' || ext === 'sass') return 'css';
  return 'other';
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Adds a Git remote to the repository
 * 
 * @param options - Remote options including projectId, remoteName, and url
 */
export async function addRemote(options: {
  projectId: string;
  remoteName: string;
  url: string;
}): Promise<void> {
  try {
    const { projectId, remoteName, url } = options;
    const git = await getGit();
    const fs = createFS(projectId);
    const dir = getGitDir();

    await git.addRemote({
      fs,
      dir,
      remote: remoteName,
      url,
    });
  } catch (error) {
    throw new Error(
      `Failed to add remote '${options.remoteName}': ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

/**
 * Lists all remotes in the repository
 * 
 * @param projectId - Project ID
 * @returns Array of remote objects with remote name and URL
 */
export async function listRemotes(
  projectId: string,
): Promise<Array<{ remote: string; url: string }>> {
  try {
    const git = await getGit();
    const fs = createFS(projectId);
    const dir = getGitDir();

    const remotes = await git.listRemotes({
      fs,
      dir,
    });

    return remotes;
  } catch (error) {
    throw new Error(
      `Failed to list remotes: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

/**
 * Pushes commits to a remote repository
 * 
 * @param options - Push options including projectId, remoteName, branch, token, and optional force flag
 * @returns Push result with success status, refs, and any errors
 */
export async function pushToRemote(options: PushOptions): Promise<PushResult> {
  try {
    const {
      projectId,
      remoteName = 'origin',
      branch,
      token,
      force = false,
    } = options;
    const git = await getGit();
    const http = await getHttp();
    const fs = createFS(projectId);
    const dir = getGitDir();

    // Get current branch if not specified
    let targetBranch = branch;
    if (!targetBranch) {
      const currentBranch = await git.currentBranch({
        fs,
        dir,
      });
      if (!currentBranch) {
        throw new Error('No current branch found and no branch specified');
      }
      targetBranch = currentBranch;
    }

    const result = await git.push({
      fs,
      dir,
      http,
      remote: remoteName,
      ref: targetBranch,
      force,
      onAuth: () => ({
        username: 'x-access-token',
        password: token,
      }),
    });

    return {
      ok: true,
      refs: result.refs as unknown as Record<string, string> | undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      ok: false,
      errors: [errorMessage],
    };
  }
}

/**
 * Pulls changes from a remote repository (fetch + merge)
 * 
 * @param options - Pull options including projectId, remoteName, branch, token, and author info
 * @returns Pull result with success status, merge commit, conflicts, and fast-forward flag
 */
export async function pullFromRemote(options: PullOptions): Promise<PullResult> {
  try {
    const {
      projectId,
      remoteName = 'origin',
      branch,
      token,
      authorName,
      authorEmail,
    } = options;
    const git = await getGit();
    const http = await getHttp();
    const fs = createFS(projectId);
    const dir = getGitDir();

    // Get current branch if not specified
    let targetBranch = branch;
    if (!targetBranch) {
      const currentBranch = await git.currentBranch({
        fs,
        dir,
      });
      if (!currentBranch) {
        throw new Error('No current branch found and no branch specified');
      }
      targetBranch = currentBranch;
    }

    await git.pull({
      fs,
      dir,
      http,
      remote: remoteName,
      ref: targetBranch,
      author: {
        name: authorName,
        email: authorEmail,
      },
      onAuth: () => ({
        username: 'x-access-token',
        password: token,
      }),
    });

    // git.pull returns void - check HEAD to determine merge result
    const headAfter = await git.resolveRef({ fs, dir, ref: 'HEAD' });

    return {
      ok: true,
      mergeCommit: headAfter,
      fastForward: true, // isomorphic-git pull always fast-forwards or fails
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Check if it's a merge conflict error
    if (
      errorMessage.includes('conflict') ||
      errorMessage.includes('CONFLICT') ||
      errorMessage.includes('merge conflict')
    ) {
      // Try to extract conflict file paths from the error
      const conflicts: string[] = [];
      
      // Parse error message for conflict files (isomorphic-git format may vary)
      const conflictMatch = errorMessage.match(/conflict.*?files?[:\s]+([^\n]+)/i);
      if (conflictMatch) {
        conflicts.push(...conflictMatch[1].split(',').map((f) => f.trim()));
      } else {
        // Fallback: return generic conflict indicator
        conflicts.push('merge conflict detected');
      }

      return {
        ok: false,
        conflicts,
      };
    }

    return {
      ok: false,
      conflicts: [errorMessage],
    };
  }
}

/**
 * Fetches refs from a remote repository without merging
 * 
 * @param options - Fetch options including projectId, remoteName, branch, and token
 */
export async function fetchFromRemote(options: FetchOptions): Promise<void> {
  try {
    const { projectId, remoteName = 'origin', branch, token } = options;
    const git = await getGit();
    const http = await getHttp();
    const fs = createFS(projectId);
    const dir = getGitDir();

    await git.fetch({
      fs,
      dir,
      http,
      remote: remoteName,
      ...(branch && { ref: branch }),
      onAuth: () => ({
        username: 'x-access-token',
        password: token,
      }),
    });
  } catch (error) {
    throw new Error(
      `Failed to fetch from remote '${options.remoteName}': ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

/**
 * Clones a remote repository into the virtual filesystem
 * 
 * @param options - Clone options including projectId, url, branch, token, and optional depth
 */
export async function cloneFromRemote(options: CloneOptions): Promise<void> {
  try {
    const { projectId, url, branch, token, depth } = options;
    const git = await getGit();
    const http = await getHttp();
    const fs = createFS(projectId);
    const dir = getGitDir();

    // Clone the repository
    await git.clone({
      fs,
      dir,
      http,
      url,
      ...(branch && { ref: branch }),
      ...(depth && { depth }),
      ...(token && {
        onAuth: () => ({
          username: 'x-access-token',
          password: token,
        }),
      }),
    });

    // After clone, sync the working directory files into the Supabase files table
    await syncWorkdirToSupabaseWithProjectId(fs, projectId);
  } catch (error) {
    throw new Error(
      `Failed to clone from remote '${options.url}': ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}
