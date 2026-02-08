import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolRegistry } from '../registry.js';
import { registerPreferencesTools } from '../preferences.js';

// Mock logger to suppress output during tests
vi.mock('../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

function createMockAuthManager(authenticated = true) {
  return {
    isAuthenticated: vi.fn(() => authenticated),
    getAuthHeader: vi.fn(() => (authenticated ? 'Bearer test-token' : null)),
    loadToken: vi.fn(),
    logout: vi.fn(),
    refreshToken: vi.fn(),
  };
}

function createMockApiClient() {
  return {
    addFile: vi.fn(),
    listProjects: vi.fn(),
    createProject: vi.fn(),
    listProjectFiles: vi.fn(),
    executeAgents: vi.fn(),
    getExecutionStatus: vi.fn(),
    getProposedChanges: vi.fn(),
    getPreferences: vi.fn(),
  };
}

describe('registerPreferencesTools', () => {
  let registry: ToolRegistry;
  let apiClient: ReturnType<typeof createMockApiClient>;
  let authManager: ReturnType<typeof createMockAuthManager>;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new ToolRegistry();
    apiClient = createMockApiClient();
    authManager = createMockAuthManager();
  });

  it('registers synapse_get_preferences tool', () => {
    registerPreferencesTools(registry, apiClient as never, authManager as never);

    expect(registry.has('synapse_get_preferences')).toBe(true);

    const definitions = registry.getDefinitions();
    const tool = definitions.find((d) => d.name === 'synapse_get_preferences');
    expect(tool).toBeDefined();
    expect(tool!.description).toContain('preferences');
  });

  it('handler calls API and formats preferences', async () => {
    apiClient.getPreferences.mockResolvedValue({
      data: [
        {
          category: 'naming',
          key: 'variable_case',
          value: 'camelCase',
          file_type: 'liquid',
          confidence: 0.95,
        },
        {
          category: 'spacing',
          key: 'indentation',
          value: '2 spaces',
          file_type: null,
          confidence: 0.88,
        },
      ],
    });

    registerPreferencesTools(registry, apiClient as never, authManager as never);
    const handler = registry.getHandler('synapse_get_preferences')!;

    const result = await handler({});

    expect(apiClient.getPreferences).toHaveBeenCalledTimes(1);

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.preferences).toHaveLength(2);

    // First preference — has file_type
    expect(parsed.preferences[0]).toEqual({
      preferenceType: 'naming',
      pattern: 'variable_case',
      example: 'camelCase',
      appliesTo: ['liquid'],
      confidence: 0.95,
    });

    // Second preference — null file_type falls back to ['all']
    expect(parsed.preferences[1]).toEqual({
      preferenceType: 'spacing',
      pattern: 'indentation',
      example: '2 spaces',
      appliesTo: ['all'],
      confidence: 0.88,
    });
  });

  it('throws AUTH_REQUIRED when not authenticated', async () => {
    authManager = createMockAuthManager(false);
    registerPreferencesTools(registry, apiClient as never, authManager as never);

    const handler = registry.getHandler('synapse_get_preferences')!;

    await expect(handler({})).rejects.toThrow('AUTH_REQUIRED');

    expect(apiClient.getPreferences).not.toHaveBeenCalled();
  });
});
