/**
 * Git operations service for Synapse IDE
 * 
 * Uses isomorphic-git to perform Git operations (init, commit, branch, status, diff, log)
 * against project files stored in Supabase via SupabaseVirtualFS.
 */

import type { ReadCommitResult } from 'isomorphic-git';
import { SupabaseVirtualFS } from './virtual-fs';

// ── Types ────────────────────────────────────────────────────────────────

export interface CommitOptions {
  projectId: string;
  message: string;
  authorName: string;
  authorEmail: string;
  files?: string[];
}

export interface FileStatus {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'unmodified';
}

export interface DiffEntry {
  path: string;
  type: 'add' | 'modify' | 'delete';
  oldContent?: string;
  newContent?: string;
}

export interface CommitEntry {
  sha: string;
  message: string;
  author: {
    name: string;
    email: string;
    timestamp: number;
  };
  parent: string[];
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

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Creates a new git repository for the project
 */
export async function initRepo(projectId: string): Promise<void> {
  try {
    const git = await getGit();
    const fs = createFS(projectId);
    const dir = getGitDir();

    await git.init({
      fs,
      dir,
      defaultBranch: 'main',
    });
  } catch (error) {
    throw new Error(
      `Failed to initialize git repository for project ${projectId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

/**
 * Commits files to the repository
 * 
 * @param options - Commit options including projectId, message, author info, and optional file list
 * @returns The commit SHA
 */
export async function commitFiles(options: CommitOptions): Promise<string> {
  try {
    const { projectId, message, authorName, authorEmail, files } = options;
    const git = await getGit();
    const fs = createFS(projectId);
    const dir = getGitDir();

    // If files are specified, stage only those files
    if (files && files.length > 0) {
      for (const file of files) {
        await git.add({
          fs,
          dir,
          filepath: file,
        });
      }
    } else {
      // Stage all modified files
      const statusMatrix = await git.statusMatrix({
        fs,
        dir,
      });

      for (const [filepath, headStatus, workdirStatus, stageStatus] of statusMatrix) {
        // Stage files that are modified, added, or deleted
        if (workdirStatus !== stageStatus || headStatus !== stageStatus) {
          await git.add({
            fs,
            dir,
            filepath,
          });
        }
      }
    }

    // Create commit
    const sha = await git.commit({
      fs,
      dir,
      message,
      author: {
        name: authorName,
        email: authorEmail,
      },
    });

    if (!sha) {
      throw new Error('Commit failed: no SHA returned');
    }

    return sha;
  } catch (error) {
    throw new Error(
      `Failed to commit files: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

/**
 * Creates a new branch
 * 
 * @param projectId - Project ID
 * @param branchName - Name of the branch to create
 * @param startPoint - Optional starting point (commit SHA or branch name). Defaults to current HEAD
 */
export async function createBranch(
  projectId: string,
  branchName: string,
  startPoint?: string,
): Promise<void> {
  try {
    const git = await getGit();
    const fs = createFS(projectId);
    const dir = getGitDir();

    await git.branch({
      fs,
      dir,
      ref: branchName,
      checkout: false,
      ...(startPoint && { startPoint }),
    });
  } catch (error) {
    throw new Error(
      `Failed to create branch '${branchName}': ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

/**
 * Lists all branches in the repository
 * 
 * @param projectId - Project ID
 * @returns Object containing list of branches and current branch name
 */
export async function listBranches(
  projectId: string,
): Promise<{ branches: string[]; current: string }> {
  try {
    const git = await getGit();
    const fs = createFS(projectId);
    const dir = getGitDir();

    const branches = await git.listBranches({
      fs,
      dir,
    });

    const current = await git.currentBranch({
      fs,
      dir,
    });

    return {
      branches,
      current: current || 'main',
    };
  } catch (error) {
    throw new Error(
      `Failed to list branches: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

/**
 * Switches to a branch
 * 
 * @param projectId - Project ID
 * @param branchName - Name of the branch to checkout
 */
export async function checkoutBranch(projectId: string, branchName: string): Promise<void> {
  try {
    const git = await getGit();
    const fs = createFS(projectId);
    const dir = getGitDir();

    await git.checkout({
      fs,
      dir,
      ref: branchName,
    });
  } catch (error) {
    throw new Error(
      `Failed to checkout branch '${branchName}': ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

/**
 * Gets the status of all files in the repository
 * 
 * @param projectId - Project ID
 * @returns Array of file statuses
 */
export async function getStatus(projectId: string): Promise<FileStatus[]> {
  try {
    const git = await getGit();
    const fs = createFS(projectId);
    const dir = getGitDir();

    const statusMatrix = await git.statusMatrix({
      fs,
      dir,
    });

    const fileStatuses: FileStatus[] = statusMatrix.map(([filepath, headStatus, workdirStatus]) => {
      // Status matrix values:
      // 0 = absent
      // 1 = unmodified
      // 2 = modified
      // 3 = added

      let status: FileStatus['status'] = 'unmodified';

      if (headStatus === 0 && workdirStatus !== 0) {
        status = 'added';
      } else if (headStatus !== 0 && workdirStatus === 0) {
        status = 'deleted';
      } else if (headStatus !== workdirStatus) {
        status = 'modified';
      }

      return {
        path: filepath,
        status,
      };
    });

    return fileStatuses;
  } catch (error) {
    throw new Error(
      `Failed to get status: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

/**
 * Gets the diff between two refs
 * 
 * @param projectId - Project ID
 * @param options - Optional diff options (ref1, ref2). Defaults to HEAD vs working directory
 * @returns Array of diff entries
 */
export async function getDiff(
  projectId: string,
  options?: { ref1?: string; ref2?: string },
): Promise<DiffEntry[]> {
  try {
    const git = await getGit();
    const fs = createFS(projectId);
    const dir = getGitDir();

    const ref1 = options?.ref1 || 'HEAD';
    const ref2 = options?.ref2;

    // If comparing two commits (not working directory)
    if (ref2) {
      let ref1Oid: string;
      let ref2Oid: string;

      try {
        ref1Oid = await git.resolveRef({
          fs,
          dir,
          ref: ref1,
        });
      } catch {
        throw new Error(`Failed to resolve ref: ${ref1}`);
      }

      try {
        ref2Oid = await git.resolveRef({
          fs,
          dir,
          ref: ref2,
        });
      } catch {
        throw new Error(`Failed to resolve ref: ${ref2}`);
      }

      const diffEntries: DiffEntry[] = [];
      
      // Use git.walk to compare the two trees
      const files1 = new Map<string, string>(); // path -> oid
      const files2 = new Map<string, string>(); // path -> oid

      // Walk tree 1
      await git.walk({
        fs,
        dir,
        trees: [git.TREE({ ref: ref1Oid })],
        map: async (filepath: string, entries) => {
          const A = entries[0];
          if (A && (await A.type()) === 'blob') {
            files1.set(filepath, await A.oid());
          }
          return undefined;
        },
      });

      // Walk tree 2
      await git.walk({
        fs,
        dir,
        trees: [git.TREE({ ref: ref2Oid })],
        map: async (filepath: string, entries) => {
          const B = entries[0];
          if (B && (await B.type()) === 'blob') {
            files2.set(filepath, await B.oid());
          }
          return undefined;
        },
      });

      const allFiles = new Set([...files1.keys(), ...files2.keys()]);

      for (const filepath of allFiles) {
        const oid1 = files1.get(filepath);
        const oid2 = files2.get(filepath);

        if (!oid1 && oid2) {
          // Added
          try {
            const { blob } = await git.readBlob({
              fs,
              dir,
              oid: oid2,
            });
            diffEntries.push({
              path: filepath,
              type: 'add',
              newContent: new TextDecoder().decode(blob),
            });
          } catch {
            diffEntries.push({
              path: filepath,
              type: 'add',
            });
          }
        } else if (oid1 && !oid2) {
          // Deleted
          try {
            const { blob } = await git.readBlob({
              fs,
              dir,
              oid: oid1,
            });
            diffEntries.push({
              path: filepath,
              type: 'delete',
              oldContent: new TextDecoder().decode(blob),
            });
          } catch {
            diffEntries.push({
              path: filepath,
              type: 'delete',
            });
          }
        } else if (oid1 && oid2 && oid1 !== oid2) {
          // Modified
          try {
            const [{ blob: blob1 }, { blob: blob2 }] = await Promise.all([
              git.readBlob({
                fs,
                dir,
                oid: oid1,
              }),
              git.readBlob({
                fs,
                dir,
                oid: oid2,
              }),
            ]);

            diffEntries.push({
              path: filepath,
              type: 'modify',
              oldContent: new TextDecoder().decode(blob1),
              newContent: new TextDecoder().decode(blob2),
            });
          } catch {
            // Skip if we can't read
          }
        }
      }

      return diffEntries;
    } else {
      // Compare HEAD vs working directory
      const statusMatrix = await git.statusMatrix({
        fs,
        dir,
      });

      const diffEntries: DiffEntry[] = [];

      for (const [filepath, headStatus, workdirStatus] of statusMatrix) {
        if (headStatus === workdirStatus) continue; // Skip unmodified files

        const entry: DiffEntry = {
          path: filepath,
          type: headStatus === 0 ? 'add' : workdirStatus === 0 ? 'delete' : 'modify',
        };

        // Read old content (from HEAD)
        if (headStatus !== 0) {
          try {
            // Resolve HEAD to commit OID, then get tree, then find file
            const headOid = await git.resolveRef({ fs, dir, ref: 'HEAD' });
            const commit = await git.readCommit({ fs, dir, oid: headOid });
            const { blob } = await git.readBlob({
              fs,
              dir,
              oid: commit.commit.tree,
              filepath,
            });
            entry.oldContent = new TextDecoder().decode(blob);
          } catch {
            // File might not exist in HEAD
          }
        }

        // Read new content (from working directory)
        if (workdirStatus !== 0) {
          try {
            const raw = await fs.promises.readFile(filepath);
            entry.newContent = typeof raw === 'string' ? raw : new TextDecoder().decode(raw as Uint8Array);
          } catch {
            // File might not exist
          }
        }

        diffEntries.push(entry);
      }

      return diffEntries;
    }
  } catch (error) {
    throw new Error(
      `Failed to get diff: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

/**
 * Gets the commit log
 * 
 * @param projectId - Project ID
 * @param options - Optional log options (depth, ref). Defaults to depth 20, HEAD
 * @returns Array of commit entries
 */
export async function getLog(
  projectId: string,
  options?: { depth?: number; ref?: string },
): Promise<CommitEntry[]> {
  try {
    const git = await getGit();
    const fs = createFS(projectId);
    const dir = getGitDir();

    const depth = options?.depth ?? 20;
    const ref = options?.ref || 'HEAD';

    const commits = await git.log({
      fs,
      dir,
      depth,
      ref,
    });

    const commitEntries: CommitEntry[] = commits.map((commit: ReadCommitResult) => ({
      sha: commit.oid,
      message: commit.commit.message,
      author: {
        name: commit.commit.author.name,
        email: commit.commit.author.email,
        timestamp: commit.commit.author.timestamp,
      },
      parent: commit.commit.parent || [],
    }));

    return commitEntries;
  } catch (error) {
    throw new Error(
      `Failed to get log: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}
