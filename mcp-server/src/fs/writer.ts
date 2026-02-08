import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { logger } from '../logger.js';

export class FileWriter {
  private workspaceRoot: string;
  private createBackups: boolean;

  constructor(workspaceRoot: string, createBackups = true) {
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.createBackups = createBackups;
  }

  /**
   * Write file atomically: write to temp file, then rename.
   * Creates backup before writing if enabled.
   */
  async writeFileAtomic(filePath: string, content: string): Promise<void> {
    const absPath = path.resolve(this.workspaceRoot, filePath);

    // Validate path is within workspace
    if (!absPath.startsWith(this.workspaceRoot)) {
      throw new Error(`Path traversal detected: ${filePath}`);
    }

    // Create backup if file exists
    if (this.createBackups && await fs.pathExists(absPath)) {
      const backupPath = `${absPath}.synapse-backup`;
      await fs.copy(absPath, backupPath, { preserveTimestamps: true });
      logger.debug('Created backup', { backupPath });
    }

    // Ensure directory exists
    await fs.ensureDir(path.dirname(absPath));

    // Get original file stats for permission preservation
    let originalMode: number | undefined;
    try {
      const stats = await fs.stat(absPath);
      originalMode = stats.mode;
    } catch {
      // File doesn't exist yet, no mode to preserve
    }

    // Write to temp file first
    const tempPath = path.join(os.tmpdir(), `synapse-${Date.now()}-${path.basename(filePath)}`);

    try {
      await fs.writeFile(tempPath, content, 'utf-8');

      // Atomic rename (move temp to target)
      await fs.move(tempPath, absPath, { overwrite: true });

      // Restore original permissions if they existed
      if (originalMode !== undefined) {
        await fs.chmod(absPath, originalMode);
      }

      logger.info('File written atomically', { filePath });
    } catch (error) {
      // Cleanup temp file if rename failed
      await fs.remove(tempPath).catch(() => {});
      throw error;
    }
  }

  /** Restore file from backup */
  async restoreFromBackup(filePath: string): Promise<boolean> {
    const absPath = path.resolve(this.workspaceRoot, filePath);
    const backupPath = `${absPath}.synapse-backup`;

    if (await fs.pathExists(backupPath)) {
      await fs.move(backupPath, absPath, { overwrite: true });
      logger.info('Restored from backup', { filePath });
      return true;
    }

    return false;
  }

  /** Check if file was modified since a given timestamp */
  async wasModifiedSince(filePath: string, since: Date): Promise<boolean> {
    const absPath = path.resolve(this.workspaceRoot, filePath);

    try {
      const stats = await fs.stat(absPath);
      return stats.mtime > since;
    } catch {
      return false;
    }
  }

  /** Clean up backup files */
  async cleanupBackup(filePath: string): Promise<void> {
    const absPath = path.resolve(this.workspaceRoot, filePath);
    const backupPath = `${absPath}.synapse-backup`;
    await fs.remove(backupPath).catch(() => {});
  }
}
