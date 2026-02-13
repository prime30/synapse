import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// Mock fs module
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    mkdirSync: vi.fn(),
    statSync: vi.fn(),
    readdirSync: vi.fn(),
    renameSync: vi.fn(),
    createWriteStream: vi.fn(() => ({
      write: vi.fn(),
      end: vi.fn(),
    })),
  },
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  mkdirSync: vi.fn(),
  statSync: vi.fn(),
  readdirSync: vi.fn(),
  renameSync: vi.fn(),
  createWriteStream: vi.fn(() => ({
    write: vi.fn(),
    end: vi.fn(),
  })),
}));

// Mock logger to suppress output during tests
vi.mock('../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock config helpers
vi.mock('../../config.js', () => ({
  getSynapseDir: vi.fn(() => '/mock/.synapse'),
  ensureSynapseDir: vi.fn(),
}));

import { AuthManager } from '../manager.js';
import type { SynapseConfig } from '../../config.js';

function createConfig(overrides: Partial<SynapseConfig> = {}): SynapseConfig {
  return {
    apiUrl: 'https://api.synapse.shop',
    logLevel: 'info',
    fileWatcherEnabled: true,
    autoRefreshToken: true,
    backupFiles: true,
    ...overrides,
  };
}

const AUTH_PATH = path.join('/mock/.synapse', 'auth.json');

function validStoredAuth(overrides: Partial<{ token: string; expiresAt: string; user: { id: string; email: string } }> = {}) {
  return JSON.stringify({
    token: 'jwt-valid-token',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour from now
    user: { id: 'user-uuid-123', email: 'user@gmail.com' },
    ...overrides,
  });
}

describe('AuthManager', () => {
  let manager: AuthManager;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new AuthManager(createConfig());

    // Setup global fetch mock
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('isAuthenticated', () => {
    it('returns false when no token loaded', () => {
      expect(manager.isAuthenticated()).toBe(false);
    });

    it('returns true after loading a valid stored token', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(validStoredAuth());

      await manager.loadToken();

      expect(manager.isAuthenticated()).toBe(true);
    });
  });

  describe('loadToken', () => {
    it('loads valid stored token and sets auth state', async () => {
      const futureDate = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const storedData = JSON.stringify({
        token: 'jwt-my-token',
        expiresAt: futureDate,
        user: { id: 'uid-1', email: 'test@example.com' },
      });

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(storedData);

      await manager.loadToken();

      expect(manager.isAuthenticated()).toBe(true);
      expect(manager.getAuthHeader()).toBe('Bearer jwt-my-token');
      expect(manager.getUser()).toEqual({ id: 'uid-1', email: 'test@example.com' });
    });

    it('handles missing auth file gracefully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await manager.loadToken();

      expect(manager.isAuthenticated()).toBe(false);
      expect(manager.getAuthHeader()).toBeNull();
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });

    it('handles invalid JSON in auth file gracefully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('not-valid-json{{{');

      await manager.loadToken();

      expect(manager.isAuthenticated()).toBe(false);
    });

    it('handles auth file with missing fields gracefully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ token: 'abc' }));

      await manager.loadToken();

      expect(manager.isAuthenticated()).toBe(false);
    });

    it('detects expired token and attempts refresh when autoRefreshToken is true', async () => {
      const expiredDate = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour ago
      const storedData = JSON.stringify({
        token: 'expired-token',
        expiresAt: expiredDate,
        user: { id: 'uid-1', email: 'test@example.com' },
      });

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(storedData);

      // Mock successful refresh response
      const newExpiry = Math.floor((Date.now() + 7 * 24 * 60 * 60 * 1000) / 1000);
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              session: {
                access_token: 'refreshed-token',
                expires_at: newExpiry,
              },
            },
          }),
      });

      manager = new AuthManager(createConfig({ autoRefreshToken: true }));
      await manager.loadToken();

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.synapse.shop/api/auth/refresh',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer expired-token',
          }),
        }),
      );
    });

    it('does not attempt refresh when autoRefreshToken is false and token is expired', async () => {
      const expiredDate = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const storedData = JSON.stringify({
        token: 'expired-token',
        expiresAt: expiredDate,
        user: { id: 'uid-1', email: 'test@example.com' },
      });

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(storedData);

      manager = new AuthManager(createConfig({ autoRefreshToken: false }));
      await manager.loadToken();

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(manager.isAuthenticated()).toBe(false);
    });
  });

  describe('getAuthHeader', () => {
    it('returns null when not authenticated', () => {
      expect(manager.getAuthHeader()).toBeNull();
    });

    it('returns correct Bearer format after loading token', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(validStoredAuth());

      await manager.loadToken();

      const header = manager.getAuthHeader();
      expect(header).toBe('Bearer jwt-valid-token');
      expect(header).toMatch(/^Bearer .+$/);
    });
  });

  describe('logout', () => {
    it('clears auth state and removes file', async () => {
      // First load a valid token
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(validStoredAuth());

      await manager.loadToken();
      expect(manager.isAuthenticated()).toBe(true);

      // Now logout
      manager.logout();

      expect(manager.isAuthenticated()).toBe(false);
      expect(manager.getAuthHeader()).toBeNull();
      expect(manager.getUser()).toBeNull();
      expect(fs.unlinkSync).toHaveBeenCalledWith(AUTH_PATH);
    });

    it('handles logout when auth file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      manager.logout();

      expect(manager.isAuthenticated()).toBe(false);
      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });
  });

  describe('refreshToken', () => {
    it('calls API and updates stored token on success', async () => {
      // Load a valid token first so this.token is set
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(validStoredAuth());
      await manager.loadToken();

      const newExpiry = Math.floor((Date.now() + 7 * 24 * 60 * 60 * 1000) / 1000);
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              session: {
                access_token: 'new-refreshed-token',
                expires_at: newExpiry,
              },
            },
          }),
      });

      await manager.refreshToken();

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.synapse.shop/api/auth/refresh',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer jwt-valid-token',
          },
        },
      );

      // Token should be updated
      expect(manager.getAuthHeader()).toBe('Bearer new-refreshed-token');
      // Should persist the new token
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('clears auth when refresh API returns non-ok response', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(validStoredAuth());
      await manager.loadToken();

      fetchSpy.mockResolvedValue({
        ok: false,
        status: 401,
      });

      await manager.refreshToken();

      expect(manager.isAuthenticated()).toBe(false);
      expect(manager.getAuthHeader()).toBeNull();
    });

    it('clears auth when refresh API throws a network error', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(validStoredAuth());
      await manager.loadToken();

      fetchSpy.mockRejectedValue(new Error('Network error'));

      await manager.refreshToken();

      expect(manager.isAuthenticated()).toBe(false);
      expect(manager.getAuthHeader()).toBeNull();
    });

    it('does nothing when no token is set', async () => {
      await manager.refreshToken();

      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
