import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Mock fs before importing config
vi.mock('fs', () => {
  return {
    default: {
      existsSync: vi.fn(),
      mkdirSync: vi.fn(),
      readFileSync: vi.fn(),
    },
  };
});

// Import after mocking
import { loadConfig, getSynapseDir, ensureSynapseDir, SynapseConfig } from '../config.js';

describe('config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset env vars to avoid cross-test contamination
    process.env = { ...originalEnv };
    delete process.env.SYNAPSE_API_URL;
    delete process.env.SYNAPSE_LOG_LEVEL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getSynapseDir', () => {
    it('returns the correct path under the home directory', () => {
      const result = getSynapseDir();
      const expected = path.join(os.homedir(), '.synapse');
      expect(result).toBe(expected);
    });
  });

  describe('ensureSynapseDir', () => {
    it('creates directory if it does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      ensureSynapseDir();

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        path.join(os.homedir(), '.synapse'),
        { recursive: true }
      );
    });

    it('does not create directory if it already exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      ensureSynapseDir();

      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('loadConfig', () => {
    it('returns defaults when no config file exists', () => {
      // First call: ensureSynapseDir existsSync (dir exists)
      // Second call: config file existsSync (does not exist)
      vi.mocked(fs.existsSync)
        .mockReturnValueOnce(true)   // synapse dir exists
        .mockReturnValueOnce(false); // config.json does not exist

      const config = loadConfig();

      expect(config).toEqual({
        apiUrl: 'https://api.synapse.dev',
        logLevel: 'info',
        fileWatcherEnabled: true,
        autoRefreshToken: true,
        backupFiles: true,
      });
    });

    it('merges file config with defaults', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ apiUrl: 'https://custom.api.dev', backupFiles: false })
      );

      const config = loadConfig();

      expect(config.apiUrl).toBe('https://custom.api.dev');
      expect(config.backupFiles).toBe(false);
      // Defaults for unspecified fields
      expect(config.logLevel).toBe('info');
      expect(config.fileWatcherEnabled).toBe(true);
      expect(config.autoRefreshToken).toBe(true);
    });

    it('merges environment variable overrides (SYNAPSE_API_URL)', () => {
      vi.mocked(fs.existsSync)
        .mockReturnValueOnce(true)   // synapse dir exists
        .mockReturnValueOnce(false); // config.json does not exist

      process.env.SYNAPSE_API_URL = 'https://env-override.api.dev';

      const config = loadConfig();

      expect(config.apiUrl).toBe('https://env-override.api.dev');
      // Other defaults remain
      expect(config.logLevel).toBe('info');
    });

    it('merges environment variable overrides (SYNAPSE_LOG_LEVEL)', () => {
      vi.mocked(fs.existsSync)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);

      process.env.SYNAPSE_LOG_LEVEL = 'debug';

      const config = loadConfig();

      expect(config.logLevel).toBe('debug');
    });

    it('environment variables take precedence over file config', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ apiUrl: 'https://file.api.dev', logLevel: 'warn' })
      );

      process.env.SYNAPSE_API_URL = 'https://env.api.dev';
      process.env.SYNAPSE_LOG_LEVEL = 'error';

      const config = loadConfig();

      // Env should override file
      expect(config.apiUrl).toBe('https://env.api.dev');
      expect(config.logLevel).toBe('error');
    });

    it('uses defaults when config file contains invalid JSON', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('NOT VALID JSON {{{');

      const config = loadConfig();

      expect(config).toEqual({
        apiUrl: 'https://api.synapse.dev',
        logLevel: 'info',
        fileWatcherEnabled: true,
        autoRefreshToken: true,
        backupFiles: true,
      });
    });
  });
});
