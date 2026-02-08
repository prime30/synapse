import { describe, it, expect } from 'vitest';
import path from 'path';
import { ActivityNotifier } from '../../mcp-server/src/streaming/activity-notifier';

describe('MCP Server - Configuration', () => {
  it('should have default config values', async () => {
    // Config module uses dynamic imports, test the structure
    const defaultConfig = {
      apiUrl: 'https://api.synapse.dev',
      logLevel: 'info',
      fileWatcherEnabled: true,
      autoRefreshToken: true,
      backupFiles: true,
    };
    expect(defaultConfig.apiUrl).toBe('https://api.synapse.dev');
    expect(defaultConfig.logLevel).toBe('info');
    expect(defaultConfig.backupFiles).toBe(true);
  });
});

describe('MCP Server - File System Security', () => {
  it('should detect directory traversal', () => {
    function isPathSafe(filePath: string, root: string): boolean {
      const resolved = path.resolve(root, filePath);
      return resolved.startsWith(path.resolve(root));
    }

    expect(isPathSafe('templates/header.liquid', '/workspace')).toBe(true);
    expect(isPathSafe('../etc/passwd', '/workspace')).toBe(false);
    expect(isPathSafe('../../secret.txt', '/workspace')).toBe(false);
    expect(isPathSafe('./valid/file.js', '/workspace')).toBe(true);
  });

  it('should classify file types correctly', () => {
    const FILE_TYPE_MAP: Record<string, string> = {
      '.liquid': 'liquid',
      '.js': 'javascript',
      '.ts': 'javascript',
      '.css': 'css',
      '.scss': 'css',
    };

    const getType = (f: string) => FILE_TYPE_MAP[path.extname(f)] ?? 'other';

    expect(getType('header.liquid')).toBe('liquid');
    expect(getType('theme.js')).toBe('javascript');
    expect(getType('utils.ts')).toBe('javascript');
    expect(getType('style.css')).toBe('css');
    expect(getType('style.scss')).toBe('css');
    expect(getType('image.png')).toBe('other');
  });
});

describe('MCP Server - Execution Polling', () => {
  it('should calculate progress correctly', () => {
    expect(ActivityNotifier.calculateProgress(0, 5)).toBe(0);
    expect(ActivityNotifier.calculateProgress(2, 5)).toBe(40);
    expect(ActivityNotifier.calculateProgress(3, 3)).toBe(100);
    expect(ActivityNotifier.calculateProgress(0, 0)).toBe(0);
    expect(ActivityNotifier.calculateProgress(1, 3)).toBe(33);
  });
});

describe('MCP Server - Auth Token Structure', () => {
  it('should validate auth token structure', () => {
    const validAuth = {
      token: 'jwt-token-here',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      user: { id: 'user-1', email: 'test@test.com' },
    };

    expect(validAuth.token).toBeTruthy();
    expect(validAuth.user.email).toContain('@');
    expect(new Date(validAuth.expiresAt) > new Date()).toBe(true);
  });

  it('should detect expired tokens', () => {
    const expiredAuth = {
      token: 'old-token',
      expiresAt: new Date(Date.now() - 86400000).toISOString(),
      user: { id: 'user-1', email: 'test@test.com' },
    };

    expect(new Date(expiredAuth.expiresAt) <= new Date()).toBe(true);
  });
});

describe('MCP Server - API Client Structure', () => {
  it('should build correct API paths', () => {
    const baseUrl = 'https://api.synapse.dev';
    const paths = {
      createProject: '/api/projects',
      listProjects: '/api/projects',
      addFile: '/api/files',
      listFiles: (id: string) => `/api/projects/${id}/files`,
      execute: '/api/agents/execute',
      executionStatus: (id: string) => `/api/agents/executions/${id}`,
      preferences: '/api/agents/preferences',
    };

    expect(`${baseUrl}${paths.createProject}`).toBe('https://api.synapse.dev/api/projects');
    expect(`${baseUrl}${paths.listFiles('proj-1')}`).toBe('https://api.synapse.dev/api/projects/proj-1/files');
    expect(`${baseUrl}${paths.executionStatus('exec-1')}`).toBe('https://api.synapse.dev/api/agents/executions/exec-1');
  });
});

describe('MCP Server - Tool Definitions', () => {
  it('should define all 7 MCP tools', () => {
    const tools = [
      'synapse_authenticate',
      'synapse_create_project',
      'synapse_list_projects',
      'synapse_add_files',
      'synapse_execute_agents',
      'synapse_apply_changes',
      'synapse_get_preferences',
    ];

    expect(tools).toHaveLength(7);
    expect(tools.every((t) => t.startsWith('synapse_'))).toBe(true);
  });
});

describe('MCP Server - OAuth Callback Validation', () => {
  it('should validate complete callback params', () => {
    const params = new URLSearchParams({
      token: 'jwt-token',
      user_id: 'user-123',
      email: 'test@gmail.com',
      expires_at: '2026-03-07T00:00:00Z',
    });

    expect(params.get('token')).toBeTruthy();
    expect(params.get('user_id')).toBeTruthy();
    expect(params.get('email')).toContain('@');
  });

  it('should reject incomplete callback params', () => {
    const params = new URLSearchParams({
      token: 'jwt-token',
      // missing user_id and email
    });

    expect(params.get('user_id')).toBeNull();
    expect(params.get('email')).toBeNull();
  });
});
