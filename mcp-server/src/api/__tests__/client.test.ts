import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock logger to suppress output during tests
vi.mock('../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { APIClient } from '../client.js';
import type { SynapseConfig } from '../../config.js';
import type { AuthManager } from '../../auth/manager.js';

const TEST_CONFIG: SynapseConfig = {
  apiUrl: 'https://test.api',
  logLevel: 'info',
  autoRefreshToken: true,
  fileWatcherEnabled: true,
  backupFiles: true,
};

function createMockAuthManager(overrides: Partial<{ authenticated: boolean; header: string | null }> = {}): AuthManager {
  const authenticated = overrides.authenticated ?? true;
  const header = overrides.header ?? 'Bearer test-token';
  return {
    isAuthenticated: vi.fn(() => authenticated),
    getAuthHeader: vi.fn(() => (authenticated ? header : null)),
    getUser: vi.fn(() => null),
    loadToken: vi.fn(),
    authenticate: vi.fn(),
    refreshToken: vi.fn(),
    logout: vi.fn(),
  } as unknown as AuthManager;
}

function mockFetchResponse(data: unknown, status = 200): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  });
}

describe('APIClient', () => {
  let client: APIClient;
  let authManager: AuthManager;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    authManager = createMockAuthManager();
    client = new APIClient(TEST_CONFIG, authManager);
    fetchSpy = mockFetchResponse({});
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('createProject', () => {
    it('sends POST /api/projects with correct body', async () => {
      const responseData = { data: { id: 'proj-1', name: 'My Project' } };
      fetchSpy = mockFetchResponse(responseData);
      vi.stubGlobal('fetch', fetchSpy);

      const result = await client.createProject('My Project', 'A test project');

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://test.api/api/projects',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-token',
          }),
          body: JSON.stringify({
            name: 'My Project',
            description: 'A test project',
            organization_id: 'default',
          }),
        }),
      );

      expect(result).toEqual(responseData);
    });

    it('sends POST /api/projects without description when omitted', async () => {
      const responseData = { data: { id: 'proj-2', name: 'No Desc' } };
      fetchSpy = mockFetchResponse(responseData);
      vi.stubGlobal('fetch', fetchSpy);

      const result = await client.createProject('No Desc');

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://test.api/api/projects',
        expect.objectContaining({
          body: JSON.stringify({
            name: 'No Desc',
            description: undefined,
            organization_id: 'default',
          }),
        }),
      );

      expect(result).toEqual(responseData);
    });
  });

  describe('listProjects', () => {
    it('sends GET /api/projects', async () => {
      const responseData = {
        data: [
          { id: 'proj-1', name: 'Project A', fileCount: 5 },
          { id: 'proj-2', name: 'Project B' },
        ],
      };
      fetchSpy = mockFetchResponse(responseData);
      vi.stubGlobal('fetch', fetchSpy);

      const result = await client.listProjects();

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://test.api/api/projects',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-token',
          }),
          body: undefined,
        }),
      );

      expect(result).toEqual(responseData);
    });
  });

  describe('authentication errors', () => {
    it('throws AUTH_REQUIRED when not authenticated', async () => {
      authManager = createMockAuthManager({ authenticated: false });
      client = new APIClient(TEST_CONFIG, authManager);

      await expect(client.createProject('test')).rejects.toThrow('AUTH_REQUIRED');
      await expect(client.listProjects()).rejects.toThrow('AUTH_REQUIRED');

      // fetch should never be called
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('throws AUTH_EXPIRED on 401 response', async () => {
      fetchSpy = mockFetchResponse({ error: 'Unauthorized' }, 401);
      vi.stubGlobal('fetch', fetchSpy);

      await expect(client.listProjects()).rejects.toThrow('AUTH_EXPIRED');
    });
  });

  describe('rate limiting', () => {
    it('throws RATE_LIMITED on 429 response', async () => {
      fetchSpy = mockFetchResponse({ error: 'Too many requests' }, 429);
      vi.stubGlobal('fetch', fetchSpy);

      await expect(client.listProjects()).rejects.toThrow('RATE_LIMITED');
    });
  });

  describe('API errors', () => {
    it('throws API_ERROR on other error responses', async () => {
      fetchSpy = mockFetchResponse({ error: 'Internal server error' }, 500);
      vi.stubGlobal('fetch', fetchSpy);

      await expect(client.listProjects()).rejects.toThrow('API_ERROR');
    });

    it('throws API_ERROR on 404 response', async () => {
      fetchSpy = mockFetchResponse({ error: 'Not found' }, 404);
      vi.stubGlobal('fetch', fetchSpy);

      await expect(client.createProject('test')).rejects.toThrow('API_ERROR');
    });

    it('includes status code in API_ERROR message', async () => {
      fetchSpy = mockFetchResponse({ error: 'Bad request' }, 400);
      vi.stubGlobal('fetch', fetchSpy);

      await expect(client.listProjects()).rejects.toThrow(/API_ERROR: 400/);
    });
  });

  describe('addFile', () => {
    it('sends POST /api/files with project_id and file data', async () => {
      const responseData = { data: { id: 'file-1', name: 'index.html' } };
      fetchSpy = mockFetchResponse(responseData);
      vi.stubGlobal('fetch', fetchSpy);

      const file = {
        name: 'index.html',
        path: '/templates/index.html',
        file_type: 'liquid',
        content: '<h1>Hello</h1>',
      };

      const result = await client.addFile('proj-1', file);

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://test.api/api/files',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            project_id: 'proj-1',
            name: 'index.html',
            path: '/templates/index.html',
            file_type: 'liquid',
            content: '<h1>Hello</h1>',
          }),
        }),
      );

      expect(result).toEqual(responseData);
    });
  });

  describe('listProjectFiles', () => {
    it('sends GET /api/projects/:projectId/files', async () => {
      const responseData = {
        data: [{ id: 'file-1', name: 'index.html', path: '/', file_type: 'liquid' }],
      };
      fetchSpy = mockFetchResponse(responseData);
      vi.stubGlobal('fetch', fetchSpy);

      const result = await client.listProjectFiles('proj-1');

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://test.api/api/projects/proj-1/files',
        expect.objectContaining({ method: 'GET' }),
      );

      expect(result).toEqual(responseData);
    });
  });

  describe('updateFileContent', () => {
    it('sends PUT /api/files/:id with content', async () => {
      const responseData = { data: { id: 'file-1', name: 'snippet.liquid', content: 'updated' } };
      fetchSpy = mockFetchResponse(responseData);
      vi.stubGlobal('fetch', fetchSpy);

      const result = await client.updateFileContent('file-1', 'new content');

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://test.api/api/files/file-1',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ content: 'new content' }),
        }),
      );

      expect(result).toEqual(responseData);
    });
  });

  describe('executeAgents', () => {
    it('sends POST /api/agents/execute with projectId and request', async () => {
      const responseData = { data: { executionId: 'exec-1' } };
      fetchSpy = mockFetchResponse(responseData);
      vi.stubGlobal('fetch', fetchSpy);

      const result = await client.executeAgents('proj-1', 'Fix the header');

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://test.api/api/agents/execute',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            projectId: 'proj-1',
            request: 'Fix the header',
          }),
        }),
      );

      expect(result).toEqual(responseData);
    });
  });

  describe('getExecutionStatus', () => {
    it('sends GET /api/agents/executions/:executionId', async () => {
      const responseData = { data: { status: 'completed', activeAgents: [], completedAgents: ['css'] } };
      fetchSpy = mockFetchResponse(responseData);
      vi.stubGlobal('fetch', fetchSpy);

      const result = await client.getExecutionStatus('exec-1');

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://test.api/api/agents/executions/exec-1',
        expect.objectContaining({ method: 'GET' }),
      );

      expect(result).toEqual(responseData);
    });
  });

  describe('getPreferences', () => {
    it('sends GET /api/agents/preferences', async () => {
      const responseData = {
        data: [{ category: 'style', key: 'color', value: 'blue', file_type: null, confidence: 0.9 }],
      };
      fetchSpy = mockFetchResponse(responseData);
      vi.stubGlobal('fetch', fetchSpy);

      const result = await client.getPreferences();

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://test.api/api/agents/preferences',
        expect.objectContaining({ method: 'GET' }),
      );

      expect(result).toEqual(responseData);
    });
  });
});
