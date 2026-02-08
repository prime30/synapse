import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger to suppress output during tests
vi.mock('../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { registerProjectTools } from '../projects.js';
import { ToolRegistry } from '../registry.js';
import type { APIClient } from '../../api/client.js';
import type { AuthManager } from '../../auth/manager.js';

function createMockAuthManager(authenticated = true): AuthManager {
  return {
    isAuthenticated: vi.fn(() => authenticated),
    getAuthHeader: vi.fn(() => (authenticated ? 'Bearer test-token' : null)),
    getUser: vi.fn(() => null),
    loadToken: vi.fn(),
    authenticate: vi.fn(),
    refreshToken: vi.fn(),
    logout: vi.fn(),
  } as unknown as AuthManager;
}

function createMockAPIClient(): APIClient {
  return {
    createProject: vi.fn(),
    listProjects: vi.fn(),
    addFile: vi.fn(),
    listProjectFiles: vi.fn(),
    executeAgents: vi.fn(),
    getExecutionStatus: vi.fn(),
    getProposedChanges: vi.fn(),
    getPreferences: vi.fn(),
  } as unknown as APIClient;
}

describe('registerProjectTools', () => {
  let registry: ToolRegistry;
  let apiClient: APIClient;
  let authManager: AuthManager;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new ToolRegistry();
    apiClient = createMockAPIClient();
    authManager = createMockAuthManager(true);
  });

  describe('tool registration', () => {
    it('registers synapse_create_project and synapse_list_projects tools', () => {
      registerProjectTools(registry, apiClient, authManager);

      expect(registry.has('synapse_create_project')).toBe(true);
      expect(registry.has('synapse_list_projects')).toBe(true);

      const definitions = registry.getDefinitions();
      expect(definitions).toHaveLength(2);

      const createDef = definitions.find((d) => d.name === 'synapse_create_project');
      expect(createDef).toBeDefined();
      expect(createDef!.description).toBeTruthy();
      expect(createDef!.inputSchema.required).toContain('name');

      const listDef = definitions.find((d) => d.name === 'synapse_list_projects');
      expect(listDef).toBeDefined();
      expect(listDef!.description).toBeTruthy();
    });
  });

  describe('synapse_create_project handler', () => {
    it('calls API and returns projectId', async () => {
      vi.mocked(apiClient.createProject as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'proj-new-1', name: 'Test Project' },
      });

      registerProjectTools(registry, apiClient, authManager);

      const handler = registry.getHandler('synapse_create_project');
      expect(handler).toBeDefined();

      const result = await handler!({ name: 'Test Project', description: 'A description' });

      expect(apiClient.createProject).toHaveBeenCalledWith('Test Project', 'A description');

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.projectId).toBe('proj-new-1');
      expect(parsed.name).toBe('Test Project');
    });

    it('calls API without description when not provided', async () => {
      vi.mocked(apiClient.createProject as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: { id: 'proj-2', name: 'No Desc' },
      });

      registerProjectTools(registry, apiClient, authManager);

      const handler = registry.getHandler('synapse_create_project')!;
      await handler({ name: 'No Desc' });

      expect(apiClient.createProject).toHaveBeenCalledWith('No Desc', undefined);
    });
  });

  describe('synapse_list_projects handler', () => {
    it('calls API and returns projects', async () => {
      vi.mocked(apiClient.listProjects as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [
          { id: 'proj-1', name: 'Project A', fileCount: 3 },
          { id: 'proj-2', name: 'Project B' },
        ],
      });

      registerProjectTools(registry, apiClient, authManager);

      const handler = registry.getHandler('synapse_list_projects');
      expect(handler).toBeDefined();

      const result = await handler!({});

      expect(apiClient.listProjects).toHaveBeenCalled();

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.projects).toHaveLength(2);
      expect(parsed.projects[0].id).toBe('proj-1');
      expect(parsed.projects[0].name).toBe('Project A');
      expect(parsed.projects[1].id).toBe('proj-2');
    });
  });

  describe('authentication checks', () => {
    it('synapse_create_project throws AUTH_REQUIRED when not authenticated', async () => {
      authManager = createMockAuthManager(false);
      registerProjectTools(registry, apiClient, authManager);

      const handler = registry.getHandler('synapse_create_project')!;

      await expect(handler({ name: 'test' })).rejects.toThrow('AUTH_REQUIRED');
      expect(apiClient.createProject).not.toHaveBeenCalled();
    });

    it('synapse_list_projects throws AUTH_REQUIRED when not authenticated', async () => {
      authManager = createMockAuthManager(false);
      registerProjectTools(registry, apiClient, authManager);

      const handler = registry.getHandler('synapse_list_projects')!;

      await expect(handler({})).rejects.toThrow('AUTH_REQUIRED');
      expect(apiClient.listProjects).not.toHaveBeenCalled();
    });
  });
});
