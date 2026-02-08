import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { FileWriter } from '../writer.js';

describe('FileWriter', () => {
  let tmpDir: string;
  let writer: FileWriter;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'synapse-writer-test-'));
    writer = new FileWriter(tmpDir); // createBackups defaults to true
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  // ── writeFileAtomic ───────────────────────────────────────────────────

  describe('writeFileAtomic', () => {
    it('writes content to a new file', async () => {
      await writer.writeFileAtomic('hello.liquid', '<h1>Hello</h1>');

      const content = await fs.readFile(path.join(tmpDir, 'hello.liquid'), 'utf-8');
      expect(content).toBe('<h1>Hello</h1>');
    });

    it('creates intermediate directories if they do not exist', async () => {
      await writer.writeFileAtomic('templates/deep/index.liquid', 'content');

      const exists = await fs.pathExists(path.join(tmpDir, 'templates', 'deep', 'index.liquid'));
      expect(exists).toBe(true);
    });

    it('creates a backup before overwriting an existing file', async () => {
      const filePath = path.join(tmpDir, 'existing.liquid');
      await fs.writeFile(filePath, 'original content');

      await writer.writeFileAtomic('existing.liquid', 'new content');

      // Backup should exist
      const backupPath = `${filePath}.synapse-backup`;
      const backupExists = await fs.pathExists(backupPath);
      expect(backupExists).toBe(true);

      // Backup should contain the original content
      const backupContent = await fs.readFile(backupPath, 'utf-8');
      expect(backupContent).toBe('original content');

      // Current file should have the new content
      const currentContent = await fs.readFile(filePath, 'utf-8');
      expect(currentContent).toBe('new content');
    });

    it('does not create a backup when createBackups is false', async () => {
      const writerNoBackup = new FileWriter(tmpDir, false);
      const filePath = path.join(tmpDir, 'no-backup.liquid');
      await fs.writeFile(filePath, 'original');

      await writerNoBackup.writeFileAtomic('no-backup.liquid', 'updated');

      const backupExists = await fs.pathExists(`${filePath}.synapse-backup`);
      expect(backupExists).toBe(false);

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBe('updated');
    });

    it('rejects path traversal', async () => {
      await expect(
        writer.writeFileAtomic('../../../etc/evil', 'bad'),
      ).rejects.toThrow('Path traversal detected');
    });
  });

  // ── restoreFromBackup ─────────────────────────────────────────────────

  describe('restoreFromBackup', () => {
    it('restores a file from its backup', async () => {
      const filePath = path.join(tmpDir, 'restore-me.liquid');
      await fs.writeFile(filePath, 'original');

      // Write new content (creates backup)
      await writer.writeFileAtomic('restore-me.liquid', 'overwritten');
      expect(await fs.readFile(filePath, 'utf-8')).toBe('overwritten');

      // Restore
      const restored = await writer.restoreFromBackup('restore-me.liquid');
      expect(restored).toBe(true);
      expect(await fs.readFile(filePath, 'utf-8')).toBe('original');
    });

    it('returns false when no backup exists', async () => {
      const filePath = path.join(tmpDir, 'no-backup.liquid');
      await fs.writeFile(filePath, 'content');

      const restored = await writer.restoreFromBackup('no-backup.liquid');
      expect(restored).toBe(false);
    });
  });

  // ── wasModifiedSince ──────────────────────────────────────────────────

  describe('wasModifiedSince', () => {
    it('returns true when file was modified after the given date', async () => {
      const pastDate = new Date(Date.now() - 60_000); // 1 minute ago
      const filePath = path.join(tmpDir, 'recent.txt');
      await fs.writeFile(filePath, 'fresh');

      const result = await writer.wasModifiedSince('recent.txt', pastDate);
      expect(result).toBe(true);
    });

    it('returns false when file was modified before the given date', async () => {
      const filePath = path.join(tmpDir, 'old.txt');
      await fs.writeFile(filePath, 'stale');

      // Future date – file mtime will be before this
      const futureDate = new Date(Date.now() + 60_000);

      const result = await writer.wasModifiedSince('old.txt', futureDate);
      expect(result).toBe(false);
    });

    it('returns false when file does not exist', async () => {
      const result = await writer.wasModifiedSince('ghost.txt', new Date());
      expect(result).toBe(false);
    });
  });

  // ── cleanupBackup ─────────────────────────────────────────────────────

  describe('cleanupBackup', () => {
    it('removes the backup file', async () => {
      const filePath = path.join(tmpDir, 'cleanup.liquid');
      await fs.writeFile(filePath, 'original');
      await writer.writeFileAtomic('cleanup.liquid', 'updated');

      const backupPath = `${filePath}.synapse-backup`;
      expect(await fs.pathExists(backupPath)).toBe(true);

      await writer.cleanupBackup('cleanup.liquid');
      expect(await fs.pathExists(backupPath)).toBe(false);
    });

    it('does not throw when backup does not exist', async () => {
      await expect(writer.cleanupBackup('no-such.liquid')).resolves.not.toThrow();
    });
  });
});
