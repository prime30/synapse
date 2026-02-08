import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { FileReader } from '../reader.js';

describe('FileReader', () => {
  let tmpDir: string;
  let reader: FileReader;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'synapse-reader-test-'));
    reader = new FileReader(tmpDir);
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  // ── validatePath ──────────────────────────────────────────────────────

  describe('validatePath', () => {
    it('returns true for paths within workspace', () => {
      expect(reader.validatePath('templates/index.liquid')).toBe(true);
      expect(reader.validatePath('assets/style.css')).toBe(true);
      expect(reader.validatePath('snippets/header.liquid')).toBe(true);
    });

    it('returns false for directory traversal attempts', () => {
      expect(reader.validatePath('../../../etc/passwd')).toBe(false);
      expect(reader.validatePath('../../secret.txt')).toBe(false);
      expect(reader.validatePath('../outside.js')).toBe(false);
    });

    it('returns true for nested subdirectories within workspace', () => {
      expect(reader.validatePath('a/b/c/d/file.txt')).toBe(true);
    });

    it('returns false for traversal disguised within a deeper path', () => {
      expect(reader.validatePath('templates/../../..')).toBe(false);
    });
  });

  // ── getFileType ───────────────────────────────────────────────────────

  describe('getFileType', () => {
    it('detects .liquid files', () => {
      expect(reader.getFileType('index.liquid')).toBe('liquid');
    });

    it('detects .js files as javascript', () => {
      expect(reader.getFileType('app.js')).toBe('javascript');
    });

    it('detects .ts files as javascript', () => {
      expect(reader.getFileType('app.ts')).toBe('javascript');
    });

    it('detects .jsx files as javascript', () => {
      expect(reader.getFileType('Component.jsx')).toBe('javascript');
    });

    it('detects .tsx files as javascript', () => {
      expect(reader.getFileType('Component.tsx')).toBe('javascript');
    });

    it('detects .css files', () => {
      expect(reader.getFileType('style.css')).toBe('css');
    });

    it('detects .scss files as css', () => {
      expect(reader.getFileType('style.scss')).toBe('css');
    });

    it('returns "other" for unknown extensions', () => {
      expect(reader.getFileType('data.json')).toBe('other');
      expect(reader.getFileType('readme.md')).toBe('other');
      expect(reader.getFileType('image.png')).toBe('other');
      expect(reader.getFileType('archive.zip')).toBe('other');
    });

    it('handles uppercase extensions via toLowerCase', () => {
      expect(reader.getFileType('STYLE.CSS')).toBe('css');
      expect(reader.getFileType('APP.JS')).toBe('javascript');
    });
  });

  // ── readFile ──────────────────────────────────────────────────────────

  describe('readFile', () => {
    it('reads a file within the workspace', async () => {
      const filePath = path.join(tmpDir, 'hello.liquid');
      await fs.writeFile(filePath, '<h1>Hello</h1>', 'utf-8');

      const content = await reader.readFile('hello.liquid');
      expect(content).toBe('<h1>Hello</h1>');
    });

    it('throws on file larger than 10MB', async () => {
      const filePath = path.join(tmpDir, 'huge.liquid');
      // Create a file just over the 10MB limit
      const overLimit = 10 * 1024 * 1024 + 1;
      await fs.writeFile(filePath, Buffer.alloc(overLimit, 'x'));

      await expect(reader.readFile('huge.liquid')).rejects.toThrow('File too large');
    });

    it('throws on path traversal', async () => {
      await expect(reader.readFile('../../../etc/passwd')).rejects.toThrow(
        'Path traversal detected',
      );
    });

    it('throws when file does not exist', async () => {
      await expect(reader.readFile('nonexistent.liquid')).rejects.toThrow();
    });
  });

  // ── checkPermissions ──────────────────────────────────────────────────

  describe('checkPermissions', () => {
    it('reports canRead for a readable file', async () => {
      const filePath = path.join(tmpDir, 'readable.txt');
      await fs.writeFile(filePath, 'data');

      const perms = await reader.checkPermissions('readable.txt');
      expect(perms.canRead).toBe(true);
    });

    it('reports canRead false for a non-existent file', async () => {
      const perms = await reader.checkPermissions('no-such-file.txt');
      expect(perms.canRead).toBe(false);
      expect(perms.canWrite).toBe(false);
      expect(perms.error).toBeDefined();
    });
  });

  // ── resolvePath ───────────────────────────────────────────────────────

  describe('resolvePath', () => {
    it('resolves relative path against workspace root', () => {
      const resolved = reader.resolvePath('templates/index.liquid');
      expect(resolved).toBe(path.resolve(tmpDir, 'templates/index.liquid'));
    });
  });

  // ── listFiles ─────────────────────────────────────────────────────────

  describe('listFiles', () => {
    it('lists supported file types recursively', async () => {
      await fs.ensureDir(path.join(tmpDir, 'templates'));
      await fs.ensureDir(path.join(tmpDir, 'assets'));
      await fs.writeFile(path.join(tmpDir, 'templates', 'index.liquid'), '');
      await fs.writeFile(path.join(tmpDir, 'assets', 'style.css'), '');
      await fs.writeFile(path.join(tmpDir, 'assets', 'app.js'), '');
      // Unsupported extension – should not appear
      await fs.writeFile(path.join(tmpDir, 'readme.md'), '');

      const files = await reader.listFiles();

      // Normalize separators for cross-platform comparison
      const normalized = files.map((f) => f.replace(/\\/g, '/'));

      expect(normalized).toContain('templates/index.liquid');
      expect(normalized).toContain('assets/style.css');
      expect(normalized).toContain('assets/app.js');
      expect(normalized).not.toContain('readme.md');
    });

    it('skips hidden directories and node_modules', async () => {
      await fs.ensureDir(path.join(tmpDir, '.git'));
      await fs.ensureDir(path.join(tmpDir, 'node_modules', 'pkg'));
      await fs.writeFile(path.join(tmpDir, '.git', 'config.js'), '');
      await fs.writeFile(path.join(tmpDir, 'node_modules', 'pkg', 'index.js'), '');
      await fs.writeFile(path.join(tmpDir, 'app.ts'), '');

      const files = await reader.listFiles();
      const normalized = files.map((f) => f.replace(/\\/g, '/'));

      expect(normalized).toContain('app.ts');
      expect(normalized).not.toContain('.git/config.js');
      expect(normalized).not.toContain('node_modules/pkg/index.js');
    });

    it('throws on path traversal in dir argument', async () => {
      await expect(reader.listFiles('../../')).rejects.toThrow('Path traversal detected');
    });
  });
});
