import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';

// Mock fs before importing modules that use it
vi.mock('fs', () => {
  const mockStream = {
    write: vi.fn(),
    end: vi.fn(),
  };
  return {
    default: {
      existsSync: vi.fn().mockReturnValue(true),
      mkdirSync: vi.fn(),
      readFileSync: vi.fn().mockReturnValue('{}'),
      statSync: vi.fn().mockReturnValue({
        mtime: new Date(),
      }),
      createWriteStream: vi.fn().mockReturnValue(mockStream),
      readdirSync: vi.fn().mockReturnValue([]),
      renameSync: vi.fn(),
      unlinkSync: vi.fn(),
    },
  };
});

describe('Server Lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-setup the mockStream after clearAllMocks
    const mockStream = {
      write: vi.fn(),
      end: vi.fn(),
    };
    vi.mocked(fs.createWriteStream).mockReturnValue(mockStream as unknown as fs.WriteStream);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('{}');
    vi.mocked(fs.statSync).mockReturnValue({ mtime: new Date() } as fs.Stats);
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('Module imports (smoke tests)', () => {
    it('can import config module', async () => {
      const configModule = await import('../config.js');
      expect(configModule.loadConfig).toBeDefined();
      expect(configModule.getSynapseDir).toBeDefined();
      expect(configModule.ensureSynapseDir).toBeDefined();
      expect(typeof configModule.loadConfig).toBe('function');
      expect(typeof configModule.getSynapseDir).toBe('function');
      expect(typeof configModule.ensureSynapseDir).toBe('function');
    });

    it('can import logger module', async () => {
      const loggerModule = await import('../logger.js');
      expect(loggerModule.initLogger).toBeDefined();
      expect(loggerModule.closeLogger).toBeDefined();
      expect(loggerModule.logger).toBeDefined();
      expect(typeof loggerModule.initLogger).toBe('function');
      expect(typeof loggerModule.closeLogger).toBe('function');
      expect(typeof loggerModule.logger).toBe('object');
    });

    it('logger exposes debug, info, warn, error methods', async () => {
      const { logger } = await import('../logger.js');
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
    });
  });

  describe('Logger initialization', () => {
    it('initLogger runs without error', async () => {
      const { initLogger, closeLogger } = await import('../logger.js');

      expect(() => initLogger('info')).not.toThrow();

      // Verify a write stream was created
      expect(fs.createWriteStream).toHaveBeenCalled();

      closeLogger();
    });

    it('initLogger creates a write stream with append mode', async () => {
      const { initLogger, closeLogger } = await import('../logger.js');

      initLogger('debug');

      expect(fs.createWriteStream).toHaveBeenCalledWith(
        expect.stringContaining('mcp-server.log'),
        { flags: 'a' }
      );

      closeLogger();
    });
  });

  describe('Logger levels', () => {
    it('logger.info writes to the log stream', async () => {
      const mockStream = { write: vi.fn(), end: vi.fn() };
      vi.mocked(fs.createWriteStream).mockReturnValue(mockStream as unknown as fs.WriteStream);

      const { initLogger, logger, closeLogger } = await import('../logger.js');
      initLogger('info');

      logger.info('test info message');

      expect(mockStream.write).toHaveBeenCalledWith(
        expect.stringContaining('[INFO] test info message')
      );

      closeLogger();
    });

    it('logger.warn writes to the log stream', async () => {
      const mockStream = { write: vi.fn(), end: vi.fn() };
      vi.mocked(fs.createWriteStream).mockReturnValue(mockStream as unknown as fs.WriteStream);

      const { initLogger, logger, closeLogger } = await import('../logger.js');
      initLogger('info');

      logger.warn('test warn message');

      expect(mockStream.write).toHaveBeenCalledWith(
        expect.stringContaining('[WARN] test warn message')
      );

      closeLogger();
    });

    it('logger.error writes to the log stream and stderr', async () => {
      const mockStream = { write: vi.fn(), end: vi.fn() };
      vi.mocked(fs.createWriteStream).mockReturnValue(mockStream as unknown as fs.WriteStream);
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

      const { initLogger, logger, closeLogger } = await import('../logger.js');
      initLogger('info');

      logger.error('test error message');

      expect(mockStream.write).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR] test error message')
      );
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR] test error message')
      );

      stderrSpy.mockRestore();
      closeLogger();
    });

    it('logger.debug does not write when level is info', async () => {
      const mockStream = { write: vi.fn(), end: vi.fn() };
      vi.mocked(fs.createWriteStream).mockReturnValue(mockStream as unknown as fs.WriteStream);

      const { initLogger, logger, closeLogger } = await import('../logger.js');
      initLogger('info');

      logger.debug('should not appear');

      expect(mockStream.write).not.toHaveBeenCalled();

      closeLogger();
    });

    it('logger.debug writes when level is debug', async () => {
      const mockStream = { write: vi.fn(), end: vi.fn() };
      vi.mocked(fs.createWriteStream).mockReturnValue(mockStream as unknown as fs.WriteStream);

      const { initLogger, logger, closeLogger } = await import('../logger.js');
      initLogger('debug');

      logger.debug('debug message');

      expect(mockStream.write).toHaveBeenCalledWith(
        expect.stringContaining('[DEBUG] debug message')
      );

      closeLogger();
    });

    it('logger.info includes data when provided', async () => {
      const mockStream = { write: vi.fn(), end: vi.fn() };
      vi.mocked(fs.createWriteStream).mockReturnValue(mockStream as unknown as fs.WriteStream);

      const { initLogger, logger, closeLogger } = await import('../logger.js');
      initLogger('info');

      logger.info('test with data', { key: 'value' });

      expect(mockStream.write).toHaveBeenCalledWith(
        expect.stringContaining('{"key":"value"}')
      );

      closeLogger();
    });
  });

  describe('closeLogger', () => {
    it('ends the write stream on close', async () => {
      const mockStream = { write: vi.fn(), end: vi.fn() };
      vi.mocked(fs.createWriteStream).mockReturnValue(mockStream as unknown as fs.WriteStream);

      const { initLogger, closeLogger } = await import('../logger.js');
      initLogger('info');

      closeLogger();

      expect(mockStream.end).toHaveBeenCalled();
    });
  });
});
