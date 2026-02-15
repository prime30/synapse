import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ToolRegistry } from '../registry.js';
import { registerAgentTools, ExecutionPoller } from '../agents.js';

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
    executeAgents: vi.fn(async () => ({
      data: { executionId: 'exec-123' },
    })),
    getExecutionStatus: vi.fn(),
    getProposedChanges: vi.fn(),
    getPreferences: vi.fn(),
  };
}

describe('registerAgentTools', () => {
  let registry: ToolRegistry;
  let apiClient: ReturnType<typeof createMockApiClient>;
  let authManager: ReturnType<typeof createMockAuthManager>;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new ToolRegistry();
    apiClient = createMockApiClient();
    authManager = createMockAuthManager();
  });

  it('registers synapse_execute_agents tool', () => {
    registerAgentTools(registry, apiClient as never, authManager as never);

    expect(registry.has('synapse_execute_agents')).toBe(true);

    const definitions = registry.getDefinitions();
    const agentTool = definitions.find((d) => d.name === 'synapse_execute_agents');
    expect(agentTool).toBeDefined();
    expect(agentTool!.description).toContain('Execute');
    expect(agentTool!.inputSchema.required).toContain('projectId');
    expect(agentTool!.inputSchema.required).toContain('userRequest');
  });

  it('handler calls API and returns synchronous result', async () => {
    // Implementation now executes synchronously — no polling
    apiClient.executeAgents.mockResolvedValue({
      success: true,
      data: {
        executionId: 'exec-123',
        proposedChanges: [
          {
            fileId: 'file-1',
            fileName: 'layout.liquid',
            originalContent: '<div>old</div>',
            proposedContent: '<div>new</div>',
            reasoning: 'Improved layout structure',
            agentType: 'coder',
          },
        ],
        reviewResult: {
          approved: true,
          issues: [],
        },
      },
    });

    registerAgentTools(registry, apiClient as never, authManager as never);
    const handler = registry.getHandler('synapse_execute_agents')!;

    const result = await handler({
      projectId: 'proj-1',
      userRequest: 'Add a hero section',
    });

    // Should have called executeAgents
    expect(apiClient.executeAgents).toHaveBeenCalledWith('proj-1', 'Add a hero section');

    // Synchronous — no polling
    expect(apiClient.getExecutionStatus).not.toHaveBeenCalled();

    // Should return the full result
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.data.proposedChanges).toHaveLength(1);
    expect(parsed.data.proposedChanges[0].fileName).toBe('layout.liquid');
    expect(parsed.data.reviewResult.approved).toBe(true);
  });

  it('throws AUTH_REQUIRED when not authenticated', async () => {
    authManager = createMockAuthManager(false);
    registerAgentTools(registry, apiClient as never, authManager as never);

    const handler = registry.getHandler('synapse_execute_agents')!;

    await expect(
      handler({
        projectId: 'proj-1',
        userRequest: 'Add a hero section',
      })
    ).rejects.toThrow('AUTH_REQUIRED');

    expect(apiClient.executeAgents).not.toHaveBeenCalled();
  });
});

describe('ExecutionPoller', () => {
  let apiClient: ReturnType<typeof createMockApiClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    apiClient = createMockApiClient();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('poll returns on completed status', async () => {
    apiClient.getExecutionStatus.mockResolvedValue({
      data: {
        status: 'completed',
        proposedChanges: [
          {
            fileId: 'f-1',
            fileName: 'index.liquid',
            originalContent: 'old',
            proposedContent: 'new',
            reasoning: 'Updated',
            agentType: 'coder',
          },
        ],
        reviewResult: {
          approved: true,
          issues: [],
        },
      },
    });

    const poller = new ExecutionPoller(apiClient as never);
    const result = await poller.poll('exec-abc');

    expect(result.status).toBe('completed');
    expect(result.proposedChanges).toHaveLength(1);
    expect(result.reviewResult?.approved).toBe(true);
    expect(apiClient.getExecutionStatus).toHaveBeenCalledWith('exec-abc');
    expect(apiClient.getExecutionStatus).toHaveBeenCalledTimes(1);
  });

  it('poll returns on failed status', async () => {
    apiClient.getExecutionStatus.mockResolvedValue({
      data: {
        status: 'failed',
        proposedChanges: undefined,
        reviewResult: undefined,
      },
    });

    const poller = new ExecutionPoller(apiClient as never);
    const result = await poller.poll('exec-fail');

    expect(result.status).toBe('failed');
    expect(result.proposedChanges).toBeUndefined();
    expect(result.reviewResult).toBeUndefined();
    expect(apiClient.getExecutionStatus).toHaveBeenCalledTimes(1);
  });

  it('poll polls multiple times until terminal status', async () => {
    let callCount = 0;
    apiClient.getExecutionStatus.mockImplementation(async () => {
      callCount++;
      if (callCount <= 3) {
        return {
          data: {
            status: 'running',
            activeAgents: ['coder', 'reviewer'],
          },
        };
      }
      return {
        data: {
          status: 'completed',
          proposedChanges: [],
        },
      };
    });

    const poller = new ExecutionPoller(apiClient as never);
    const result = await poller.poll('exec-multi');

    expect(result.status).toBe('completed');
    // 3 running polls + 1 completed = 4 calls
    expect(apiClient.getExecutionStatus).toHaveBeenCalledTimes(4);
  });

  it('cancel stops polling', async () => {
    // getExecutionStatus always returns 'running' so it would poll forever
    apiClient.getExecutionStatus.mockResolvedValue({
      data: {
        status: 'running',
        activeAgents: ['coder'],
      },
    });

    const poller = new ExecutionPoller(apiClient as never);

    // Cancel after a short delay
    setTimeout(() => poller.cancel(), 50);

    await expect(poller.poll('exec-cancel')).rejects.toThrow('POLL_CANCELLED');
  });

  it('throws API_ERROR when getExecutionStatus fails', async () => {
    apiClient.getExecutionStatus.mockRejectedValue(new Error('Network failure'));

    const poller = new ExecutionPoller(apiClient as never);

    await expect(poller.poll('exec-err')).rejects.toThrow('API_ERROR');
  });
});
