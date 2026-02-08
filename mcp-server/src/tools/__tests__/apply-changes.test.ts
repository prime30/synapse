import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolRegistry } from '../registry.js';
import { registerApplyTools } from '../apply-changes.js';

// Mock logger to suppress output during tests
vi.mock('../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock FileWriter — must use a real class so `new FileWriter()` works
const mockWriteFileAtomic = vi.fn();
const mockRestoreFromBackup = vi.fn();

vi.mock('../../fs/writer.js', () => {
  return {
    FileWriter: class MockFileWriter {
      writeFileAtomic = mockWriteFileAtomic;
      restoreFromBackup = mockRestoreFromBackup;
    },
  };
});

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

describe('registerApplyTools', () => {
  let registry: ToolRegistry;
  let apiClient: ReturnType<typeof createMockApiClient>;
  let authManager: ReturnType<typeof createMockAuthManager>;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new ToolRegistry();
    apiClient = createMockApiClient();
    authManager = createMockAuthManager();
  });

  it('registers synapse_apply_changes tool', () => {
    registerApplyTools(registry, apiClient as never, authManager as never);

    expect(registry.has('synapse_apply_changes')).toBe(true);

    const definitions = registry.getDefinitions();
    const tool = definitions.find((d) => d.name === 'synapse_apply_changes');
    expect(tool).toBeDefined();
    expect(tool!.description).toContain('changes');
    expect(tool!.inputSchema.required).toContain('executionId');
    expect(tool!.inputSchema.required).toContain('workspacePath');
  });

  it('handler applies changes to files', async () => {
    apiClient.getProposedChanges.mockResolvedValue({
      data: {
        proposed_changes: [
          {
            fileId: 'f-1',
            fileName: 'layout/theme.liquid',
            originalContent: '<div>old</div>',
            proposedContent: '<div>new</div>',
            reasoning: 'Updated layout',
            agentType: 'coder',
          },
          {
            fileId: 'f-2',
            fileName: 'sections/header.liquid',
            originalContent: '<header>old</header>',
            proposedContent: '<header>new</header>',
            reasoning: 'Updated header',
            agentType: 'coder',
          },
        ],
      },
    });

    registerApplyTools(registry, apiClient as never, authManager as never);
    const handler = registry.getHandler('synapse_apply_changes')!;

    const result = await handler({
      executionId: 'exec-123',
      workspacePath: '/workspace',
    });

    expect(apiClient.getProposedChanges).toHaveBeenCalledWith('exec-123');
    expect(mockWriteFileAtomic).toHaveBeenCalledTimes(2);
    expect(mockWriteFileAtomic).toHaveBeenCalledWith('layout/theme.liquid', '<div>new</div>');
    expect(mockWriteFileAtomic).toHaveBeenCalledWith('sections/header.liquid', '<header>new</header>');

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.appliedFiles).toEqual(['layout/theme.liquid', 'sections/header.liquid']);
    expect(parsed.errors).toBeUndefined();
  });

  it('handler filters by changeIds', async () => {
    apiClient.getProposedChanges.mockResolvedValue({
      data: {
        proposed_changes: [
          {
            fileId: 'f-1',
            fileName: 'file-a.liquid',
            originalContent: 'a-old',
            proposedContent: 'a-new',
            reasoning: 'Update A',
            agentType: 'coder',
          },
          {
            fileId: 'f-2',
            fileName: 'file-b.liquid',
            originalContent: 'b-old',
            proposedContent: 'b-new',
            reasoning: 'Update B',
            agentType: 'coder',
          },
          {
            fileId: 'f-3',
            fileName: 'file-c.liquid',
            originalContent: 'c-old',
            proposedContent: 'c-new',
            reasoning: 'Update C',
            agentType: 'coder',
          },
        ],
      },
    });

    registerApplyTools(registry, apiClient as never, authManager as never);
    const handler = registry.getHandler('synapse_apply_changes')!;

    const result = await handler({
      executionId: 'exec-456',
      workspacePath: '/workspace',
      changeIds: ['0', '2'], // Only apply first and third changes
    });

    // Should only write files at index 0 and 2
    expect(mockWriteFileAtomic).toHaveBeenCalledTimes(2);
    expect(mockWriteFileAtomic).toHaveBeenCalledWith('file-a.liquid', 'a-new');
    expect(mockWriteFileAtomic).toHaveBeenCalledWith('file-c.liquid', 'c-new');

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.appliedFiles).toEqual(['file-a.liquid', 'file-c.liquid']);
  });

  it('handler restores from backup on write error', async () => {
    apiClient.getProposedChanges.mockResolvedValue({
      data: {
        proposed_changes: [
          {
            fileId: 'f-1',
            fileName: 'good-file.liquid',
            originalContent: 'old',
            proposedContent: 'new',
            reasoning: 'Update',
            agentType: 'coder',
          },
          {
            fileId: 'f-2',
            fileName: 'bad-file.liquid',
            originalContent: 'old',
            proposedContent: 'new',
            reasoning: 'Update',
            agentType: 'coder',
          },
        ],
      },
    });

    // First file succeeds, second file fails
    mockWriteFileAtomic
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('EACCES: permission denied'));

    mockRestoreFromBackup.mockResolvedValue(true);

    registerApplyTools(registry, apiClient as never, authManager as never);
    const handler = registry.getHandler('synapse_apply_changes')!;

    const result = await handler({
      executionId: 'exec-789',
      workspacePath: '/workspace',
    });

    // restoreFromBackup should have been called for the failed file
    expect(mockRestoreFromBackup).toHaveBeenCalledWith('bad-file.liquid');
    expect(mockRestoreFromBackup).toHaveBeenCalledTimes(1);

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(false);
    expect(parsed.appliedFiles).toEqual(['good-file.liquid']);
    expect(parsed.errors).toHaveLength(1);
    expect(parsed.errors[0].file).toBe('bad-file.liquid');
    expect(parsed.errors[0].error).toContain('EACCES');
  });

  it('throws AUTH_REQUIRED when not authenticated', async () => {
    authManager = createMockAuthManager(false);
    registerApplyTools(registry, apiClient as never, authManager as never);

    const handler = registry.getHandler('synapse_apply_changes')!;

    await expect(
      handler({
        executionId: 'exec-123',
        workspacePath: '/workspace',
      })
    ).rejects.toThrow('AUTH_REQUIRED');

    expect(apiClient.getProposedChanges).not.toHaveBeenCalled();
    expect(mockWriteFileAtomic).not.toHaveBeenCalled();
  });
});
