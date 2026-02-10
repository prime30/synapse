/**
 * REQ-52 Task 5: Token application engine with atomic deployment.
 *
 * Replaces hardcoded values with token references (or vice versa) across
 * all files in a project.  Changes are validated before writing — if any
 * file fails syntax validation the entire batch is rolled back (i.e. nothing
 * is written).
 */

import { getFile, updateFile, listProjectFiles } from '@/lib/services/files';
import { validateByFileType } from './syntax-validator';
import {
  createVersion as createDesignSystemVersion,
  getLatestVersion,
  getVersionById,
} from '../models/token-model';
import type {
  TokenChange,
  ImpactAnalysis,
  FileImpact,
  DeploymentResult,
} from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface FileSnapshot {
  id: string;
  path: string;
  originalContent: string;
  newContent: string;
  instanceCount: number;
}

/**
 * Build the search pattern for a single `TokenChange`.
 *
 * - `replace` → literal search for `oldValue`
 * - `rename`  → CSS variable references `var(--old)` and declarations `--old:`
 * - `delete`  → CSS variable references `var(--tokenName)` and declarations `--tokenName:...;`
 */
function buildSearchPattern(change: TokenChange): RegExp | null {
  switch (change.type) {
    case 'replace': {
      if (!change.oldValue) return null;
      const escaped = change.oldValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(escaped, 'g');
    }
    case 'rename': {
      // Match var(--old-name) references and --old-name declarations
      const escaped = change.tokenName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(var\\(\\s*--${escaped}\\s*\\)|--${escaped})`, 'g');
    }
    case 'delete': {
      const escaped = change.tokenName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Match the full declaration `--name: value;` OR the var() reference
      return new RegExp(
        `(--${escaped}\\s*:[^;]*;\\s*|var\\(\\s*--${escaped}\\s*\\))`,
        'g',
      );
    }
    default:
      return null;
  }
}

/**
 * Apply a single `TokenChange` to a string, returning the modified string and
 * the number of replacements made.
 */
function applyChange(
  content: string,
  change: TokenChange,
): { result: string; count: number } {
  const pattern = buildSearchPattern(change);
  if (!pattern) return { result: content, count: 0 };

  let count = 0;

  const result = content.replace(pattern, (matched) => {
    count++;
    switch (change.type) {
      case 'replace':
        return change.newValue ?? '';
      case 'rename': {
        const newName = change.newValue ?? change.tokenName;
        if (matched.startsWith('var(')) {
          return `var(--${newName})`;
        }
        return `--${newName}`;
      }
      case 'delete':
        // Remove declarations entirely; replace var() references with fallback or empty
        if (matched.startsWith('var(')) {
          return change.newValue ?? 'inherit';
        }
        return ''; // remove full declaration line
      default:
        return matched;
    }
  });

  return { result, count };
}

/**
 * Count how many matches a change would produce in the given content.
 */
function countMatches(content: string, change: TokenChange): number {
  const pattern = buildSearchPattern(change);
  if (!pattern) return 0;
  return (content.match(pattern) ?? []).length;
}

/**
 * Compute a risk level based on how many instances will be changed in a file.
 */
function assessRisk(instanceCount: number): 'low' | 'medium' | 'high' {
  if (instanceCount <= 2) return 'low';
  if (instanceCount <= 10) return 'medium';
  return 'high';
}

// ---------------------------------------------------------------------------
// TokenApplicator
// ---------------------------------------------------------------------------

export class TokenApplicator {
  // ------------------------------------------------------------------
  // analyzeImpact
  // ------------------------------------------------------------------

  /**
   * Dry-run: analyse which files will be affected by the proposed changes.
   */
  async analyzeImpact(
    projectId: string,
    tokenChanges: TokenChange[],
  ): Promise<ImpactAnalysis> {
    const files = await listProjectFiles(projectId);
    const impacts: FileImpact[] = [];
    let totalInstances = 0;

    for (const fileMeta of files) {
      const fileId = fileMeta.id as string;
      const filePath = (fileMeta.path ?? fileMeta.name) as string;

      let fullFile: { content?: string | null };
      try {
        fullFile = await getFile(fileId);
      } catch {
        continue; // skip unreadable files
      }

      const content = fullFile?.content;
      if (typeof content !== 'string' || content.length === 0) continue;

      let instanceCount = 0;
      for (const change of tokenChanges) {
        instanceCount += countMatches(content, change);
      }

      if (instanceCount > 0) {
        const riskLevel = assessRisk(instanceCount);
        impacts.push({ filePath, instanceCount, riskLevel });
        totalInstances += instanceCount;
      }
    }

    const highRiskCount = impacts.filter((i) => i.riskLevel === 'high').length;
    const mediumRiskCount = impacts.filter((i) => i.riskLevel === 'medium').length;

    let riskSummary: string;
    if (impacts.length === 0) {
      riskSummary = 'No files affected.';
    } else if (highRiskCount > 0) {
      riskSummary = `High risk: ${highRiskCount} file(s) with many changes. Review carefully before applying.`;
    } else if (mediumRiskCount > 0) {
      riskSummary = `Medium risk: ${mediumRiskCount} file(s) with moderate changes.`;
    } else {
      riskSummary = `Low risk: ${impacts.length} file(s) with minor changes.`;
    }

    return { filesAffected: impacts, totalInstances, riskSummary };
  }

  // ------------------------------------------------------------------
  // applyTokenChanges (atomic)
  // ------------------------------------------------------------------

  /**
   * Apply token changes atomically:
   *  1. Read all affected files.
   *  2. Perform replacements in memory.
   *  3. Validate every modified file's syntax.
   *  4. If ALL pass → write them all.  If ANY fail → rollback (write nothing).
   *  5. Create a design-system version snapshot.
   */
  async applyTokenChanges(
    projectId: string,
    tokenChanges: TokenChange[],
    userId: string,
  ): Promise<DeploymentResult> {
    const errors: string[] = [];
    const files = await listProjectFiles(projectId);
    const snapshots: FileSnapshot[] = [];

    // 1. Read & transform each file
    for (const fileMeta of files) {
      const fileId = fileMeta.id as string;
      const filePath = (fileMeta.path ?? fileMeta.name) as string;

      let fullFile: { content?: string | null };
      try {
        fullFile = await getFile(fileId);
      } catch {
        continue;
      }

      const originalContent = fullFile?.content;
      if (typeof originalContent !== 'string' || originalContent.length === 0) continue;

      let newContent = originalContent;
      let totalCount = 0;

      for (const change of tokenChanges) {
        const { result, count } = applyChange(newContent, change);
        newContent = result;
        totalCount += count;
      }

      if (totalCount === 0) continue; // nothing changed in this file

      snapshots.push({
        id: fileId,
        path: filePath,
        originalContent,
        newContent,
        instanceCount: totalCount,
      });
    }

    if (snapshots.length === 0) {
      return {
        success: true,
        filesModified: [],
        instancesChanged: 0,
      };
    }

    // 2. Validate all modified files
    for (const snap of snapshots) {
      const validation = validateByFileType(snap.path, snap.newContent);
      if (!validation.valid) {
        errors.push(
          `Validation failed for ${snap.path}: ${validation.errors.join('; ')}`,
        );
      }
    }

    // 3. If any validation errors → abort entirely (atomic rollback)
    if (errors.length > 0) {
      return {
        success: false,
        filesModified: [],
        instancesChanged: 0,
        errors,
      };
    }

    // 4. Write all files
    const filesModified: string[] = [];
    let instancesChanged = 0;

    for (const snap of snapshots) {
      try {
        await updateFile(snap.id, { content: snap.newContent });
        filesModified.push(snap.path);
        instancesChanged += snap.instanceCount;
      } catch (err) {
        errors.push(
          `Failed to write ${snap.path}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // If writes partially failed, report but don't crash
    if (errors.length > 0) {
      return {
        success: false,
        filesModified,
        instancesChanged,
        errors,
      };
    }

    // 5. Create a design-system version snapshot
    let versionId: string | undefined;
    try {
      const latest = await getLatestVersion(projectId);
      const nextNum = latest ? latest.version_number + 1 : 1;
      const version = await createDesignSystemVersion({
        project_id: projectId,
        version_number: nextNum,
        changes: {
          tokenChanges,
          filesModified,
          instancesChanged,
        },
        author_id: userId,
        description: `Applied ${tokenChanges.length} token change(s) across ${filesModified.length} file(s)`,
      });
      versionId = version.id;
    } catch {
      // Version tracking failure is non-fatal
    }

    return {
      success: true,
      filesModified,
      instancesChanged,
      versionId,
    };
  }

  // ------------------------------------------------------------------
  // rollback
  // ------------------------------------------------------------------

  /**
   * Restore files from the `changes` payload stored in a design-system version.
   *
   * The version's `changes` object is expected to contain `tokenChanges` that
   * were originally applied.  Rollback inverts those changes:
   *  - `replace` → swap oldValue/newValue
   *  - `rename`  → swap tokenName/newValue
   *  - `delete`  → not invertible (noop with warning)
   */
  async rollback(
    projectId: string,
    versionId: string,
  ): Promise<void> {
    const version = await getVersionById(projectId, versionId);

    if (!version) {
      throw new Error(`Version ${versionId} not found for project ${projectId}`);
    }

    const changes = version.changes as {
      tokenChanges?: TokenChange[];
      filesModified?: string[];
    };

    if (!changes?.tokenChanges || changes.tokenChanges.length === 0) {
      throw new Error('Version has no token changes to rollback');
    }

    // Invert changes
    const invertedChanges: TokenChange[] = changes.tokenChanges
      .map((c: TokenChange): TokenChange | null => {
        switch (c.type) {
          case 'replace':
            return {
              type: 'replace',
              tokenName: c.tokenName,
              oldValue: c.newValue,
              newValue: c.oldValue,
            };
          case 'rename':
            return {
              type: 'rename',
              tokenName: c.newValue ?? c.tokenName,
              newValue: c.tokenName,
            };
          case 'delete':
            // Deletions aren't invertible without storing original content
            return null;
          default:
            return null;
        }
      })
      .filter((c): c is TokenChange => c !== null);

    if (invertedChanges.length === 0) {
      throw new Error('No invertible changes found in version');
    }

    const result = await this.applyTokenChanges(
      projectId,
      invertedChanges,
      'system-rollback',
    );

    if (!result.success) {
      throw new Error(
        `Rollback failed: ${result.errors?.join('; ') ?? 'unknown error'}`,
      );
    }
  }
}
